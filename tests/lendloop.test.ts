import { createHmac, timingSafeEqual } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { signature } from "../convex/signing";
import { utcDay } from "../lib/catalog";
import requestFlow from "../n8n/workflows/request-notification.json";
import reminderFlow from "../n8n/workflows/overdue-reminders.json";

const modules = import.meta.glob("../convex/**/*.*s");
const now = Date.UTC(2026, 10, 18, 10);
const today = utcDay(now);
const tomorrow = utcDay(now + 86_400_000);
const yesterday = utcDay(now - 86_400_000);
const listing = {
  name: "Cordless drill",
  category: "Power tools",
  condition: "Good",
  description: "Includes two batteries.",
} as const;
const toConvex = "test-only-n8n-to-convex";
const toN8n = "test-only-convex-to-n8n";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("N8N_TO_CONVEX_SECRET", toConvex);
  vi.stubEnv("CONVEX_TO_N8N_SECRET", toN8n);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup() {
  const t = convexTest(schema, modules);
  const lender = t.withIdentity({ subject: "clerk-lender" });
  const borrower = t.withIdentity({ subject: "clerk-borrower" });
  const other = t.withIdentity({ subject: "clerk-other" });
  const admin = t.withIdentity({ subject: "clerk-admin" });
  for (const client of [lender, borrower, other, admin])
    await client.mutation(api.members.register, {});
  await t.mutation(internal.members.setRole, { subject: "clerk-admin", role: "admin" });
  const tool = await lender.mutation(api.marketplace.save, listing);
  return { t, lender, borrower, other, admin, tool };
}

type Client = Awaited<ReturnType<typeof setup>>["t"];

async function signedPost(
  t: Client,
  scope: string,
  input: object,
  options?: { stale?: boolean; signedFor?: string; tampered?: boolean },
) {
  const timestamp = String(now - (options?.stale ? 400_000 : 0));
  const payload = JSON.stringify(input);
  const mac = await signature(toConvex, options?.signedFor ?? scope, timestamp, payload);
  return t.fetch("/automation/" + scope, {
    method: "POST",
    body: payload + (options?.tampered ? " " : ""),
    headers: { "x-lendloop-signature": mac, "x-lendloop-timestamp": timestamp },
  });
}

type CodeFlow = typeof requestFlow | typeof reminderFlow;

function runCode(flow: CodeFlow, name: string, json: object) {
  const code = flow.nodes.find((node) => node.name === name)?.parameters.jsCode;
  if (!code) throw new Error("Could not find workflow node " + name);
  // Evaluate only the project's checked-in Code node source, with the n8n inputs it uses.
  const execute = new Function("require", "Buffer", "Date", "$input", "$env", code);
  return execute(
    (module: string) => {
      if (module === "crypto") return { createHmac, timingSafeEqual };
    },
    Buffer,
    Date,
    { first: () => ({ json }) },
    { N8N_TO_CONVEX_SECRET: toConvex, CONVEX_TO_N8N_SECRET: toN8n },
  )[0].json;
}

async function sendCodeRequest(
  t: Client,
  route: string,
  signed: { body: string; timestamp: string; signature: string },
) {
  return t.fetch("/automation/" + route, {
    method: "POST",
    body: signed.body,
    headers: { "x-lendloop-timestamp": signed.timestamp, "x-lendloop-signature": signed.signature },
  });
}

test("guest sees only public fields and members cannot cross ownership or role boundaries", async () => {
  const { t, lender, borrower, other, admin, tool } = await setup();
  expect(await t.query(api.marketplace.publicTools, {})).toEqual([
    { name: listing.name, category: listing.category },
  ]);
  expect(await t.query(api.marketplace.board, {})).toEqual([]);
  await expect(t.mutation(api.marketplace.save, listing)).rejects.toThrow();
  await expect(borrower.mutation(api.marketplace.save, { ...listing, id: tool })).rejects.toThrow();
  await expect(admin.mutation(api.marketplace.save, { ...listing, id: tool })).rejects.toThrow();
  await expect(other.mutation(api.marketplace.remove, { id: tool })).rejects.toThrow();

  const id = await borrower.mutation(api.marketplace.request, {
    tool,
    start: today,
    end: tomorrow,
  });
  expect(
    await borrower.mutation(api.marketplace.request, { tool, start: today, end: tomorrow }),
  ).toBe(id);
  expect((await other.query(api.marketplace.myLoans, {})).all).toEqual([]);
  expect((await admin.query(api.marketplace.myLoans, {})).all).toHaveLength(1);
  const lenderId = (await lender.query(api.members.viewer, {}))!.id;
  await expect(
    other.mutation(api.marketplace.trust, { lender: lenderId, trusted: true }),
  ).rejects.toThrow();
  await admin.mutation(api.marketplace.trust, { lender: lenderId, trusted: true });
  expect((await borrower.query(api.marketplace.board, {}))[0].trusted).toBe(true);
  await expect(
    borrower.mutation(api.marketplace.transition, { id, status: "approved" }),
  ).rejects.toThrow();
  await expect(
    admin.mutation(api.marketplace.transition, { id, status: "approved" }),
  ).rejects.toThrow();
  await admin.mutation(api.marketplace.remove, { id: tool });
  expect((await borrower.query(api.marketplace.myLoans, {})).outgoing[0].status).toBe("cancelled");
  expect(await t.query(api.marketplace.publicTools, {})).toEqual([]);
});

test("parallel approvals reserve inclusive date ranges and only the lender can mark a loan returned", async () => {
  const { t, lender, borrower, other, tool } = await setup();
  await expect(
    borrower.mutation(api.marketplace.request, { tool, start: today, end: "2027-02-31" }),
  ).rejects.toThrow();
  const one = await borrower.mutation(api.marketplace.request, {
    tool,
    start: today,
    end: tomorrow,
  });
  const two = await other.mutation(api.marketplace.request, {
    tool,
    start: tomorrow,
    end: tomorrow,
  });
  const results = await Promise.allSettled(
    [one, two].map((id) => lender.mutation(api.marketplace.transition, { id, status: "approved" })),
  );
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  const approved = results[0].status === "fulfilled" ? one : two;
  if (approved === two) vi.setSystemTime(now + 86_400_000);
  expect(await t.query(api.marketplace.publicTools, {})).toEqual([]);
  await expect(
    borrower.mutation(api.marketplace.transition, { id: approved, status: "returned" }),
  ).rejects.toThrow();
  await lender.mutation(api.marketplace.transition, { id: approved, status: "returned" });
  expect(await t.query(api.marketplace.publicTools, {})).toHaveLength(1);
});

test("Convex HTTP rejects stale, tampered, cross-route and unsigned automation requests", async () => {
  const { t } = await setup();
  expect((await t.fetch("/automation/overdue", { method: "POST", body: "{}" })).status).toBe(401);
  expect((await signedPost(t, "overdue", { cursor: null }, { stale: true })).status).toBe(401);
  expect(
    (await signedPost(t, "overdue", { cursor: null }, { signedFor: "reminder-delivered" })).status,
  ).toBe(401);
  expect((await signedPost(t, "overdue", { cursor: null }, { tampered: true })).status).toBe(401);
  expect((await signedPost(t, "overdue", { cursor: null })).status).toBe(200);
});

test("notification action and real workflow Code nodes agree on both signatures, with at-most-one inbox entry", async () => {
  const { t, lender, borrower, tool } = await setup();
  const id = await borrower.mutation(api.marketplace.request, {
    tool,
    start: today,
    end: tomorrow,
  });
  const event = await t.run(
    async (ctx) =>
      (await ctx.db
        .query("events")
        .withIndex("by_loan", (q) => q.eq("loan", id))
        .first())!,
  );
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.example.test/webhook/lendloop-request-event");
  const webhook = vi.fn(async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string);
    expect(Object.keys(JSON.parse(body.payload))).toEqual(["eventId"]);
    expect(
      runCode(requestFlow, "Verify request signature", {
        headers,
        body: { payload: body.payload + " " },
      }),
    ).toEqual({ authorized: false });
    const verified = runCode(requestFlow, "Verify request signature", { headers, body });
    const signed = runCode(requestFlow, "Sign event delivery", verified);
    expect((await sendCodeRequest(t, "event-delivered", signed)).status).toBe(200);
    return sendCodeRequest(t, "event-delivered", signed);
  });
  vi.stubGlobal("fetch", webhook);
  await t.action(internal.dispatch.send, { eventId: event._id, attempt: 1 });
  await t.action(internal.dispatch.send, { eventId: event._id, attempt: 2 });
  expect(webhook).toHaveBeenCalledTimes(1);
  expect(await lender.query(api.marketplace.inbox, {})).toMatchObject([
    { kind: "requested", tool: listing.name },
  ]);
  expect(await borrower.query(api.marketplace.inbox, {})).toEqual([]);
});

test("request delivery retries then records a visible exhausted failure", async () => {
  const { t, lender, borrower, tool } = await setup();
  await borrower.mutation(api.marketplace.request, { tool, start: today, end: tomorrow });
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.example.test/webhook/lendloop-request-event");
  const fetch = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(fetch).toHaveBeenCalledTimes(4);
  expect((await lender.query(api.marketplace.myLoans, {})).incoming[0].delivery).toBe("failed");
});

test("daily workflow pages overdue loans, retries safely and skips loans returned before write-back", async () => {
  const { t, lender, borrower, tool } = await setup();
  const lenderId = (await lender.query(api.members.viewer, {}))!.id;
  const borrowerId = (await borrower.query(api.members.viewer, {}))!.id;
  const loans = await t.run(async (ctx) => {
    const ids: Id<"loans">[] = [];
    for (let i = 0; i < 52; i++)
      ids.push(
        await ctx.db.insert("loans", {
          tool,
          lender: lenderId,
          borrower: borrowerId,
          start: yesterday,
          end: yesterday,
          status: "approved",
        }),
      );
    return ids;
  });
  const lookup = runCode(reminderFlow, "Sign overdue lookup", { cursor: null });
  const first = await (await sendCodeRequest(t, "overdue", lookup)).json();
  expect(first.loans).toHaveLength(50);
  expect(first.cursor).toBeTruthy();
  const batch = runCode(reminderFlow, "Sign reminder batch", first);
  expect(await (await sendCodeRequest(t, "reminder-delivered", batch)).json()).toEqual({
    logged: 50,
  });
  expect(await (await sendCodeRequest(t, "reminder-delivered", batch)).json()).toEqual({
    logged: 0,
  });
  const next = await (
    await sendCodeRequest(t, "overdue", runCode(reminderFlow, "Sign overdue lookup", first))
  ).json();
  expect(next.loans).toHaveLength(2);
  expect(next.cursor).toBeNull();
  await lender.mutation(api.marketplace.transition, { id: loans[51], status: "returned" });
  const tail = runCode(reminderFlow, "Sign reminder batch", next);
  expect(await (await sendCodeRequest(t, "reminder-delivered", tail)).json()).toEqual({
    logged: 1,
  });
  expect(await t.run(async (ctx) => (await ctx.db.query("notifications").collect()).length)).toBe(
    51,
  );
});

import { createHmac, timingSafeEqual } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { signature } from "../convex/signing";
import { utcDay } from "../lib/catalog";
import { FIRST_PAGE, parsePageSize } from "../lib/constants";
import type { PageSize } from "../lib/constants";
import requestFlow from "../n8n/workflows/request-notification.json";
import reminderFlow from "../n8n/workflows/overdue-reminders.json";

const modules = import.meta.glob("../convex/**/*.*s");
const now = Date.UTC(2026, 10, 18, 10);
const today = utcDay(now);
const tomorrow = utcDay(now + 86_400_000);
const yesterday = utcDay(now - 86_400_000);
const requestKey = "cb574023-2139-427a-97b2-b9fa25444444";
const secondKey = "f788d162-56d9-4123-8966-67b4962bbbbb";
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
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toEqual([
    { name: listing.name, category: listing.category, available: true, returnDue: null },
  ]);
  expect((await t.query(api.marketplace.board, { ...FIRST_PAGE, own: false })).page).toEqual([]);
  await expect(t.mutation(api.marketplace.save, listing)).rejects.toThrow();
  await expect(borrower.mutation(api.marketplace.save, { ...listing, id: tool })).rejects.toThrow();
  await expect(admin.mutation(api.marketplace.save, { ...listing, id: tool })).rejects.toThrow();
  await expect(other.mutation(api.marketplace.remove, { id: tool })).rejects.toThrow();

  const id = await borrower.mutation(api.marketplace.request, {
    idempotencyKey: requestKey,
    tool,
    start: today,
    end: tomorrow,
  });
  expect(
    await borrower.mutation(api.marketplace.request, {
      idempotencyKey: requestKey,
      tool,
      start: today,
      end: tomorrow,
    }),
  ).toBe(id);
  expect((await other.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "all" })).page).toEqual(
    [],
  );
  expect(
    (await admin.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "all" })).page,
  ).toHaveLength(1);
  const lenderId = (await lender.query(api.members.viewer, {}))!.id;
  await expect(
    other.mutation(api.marketplace.trust, { lender: lenderId, trusted: true }),
  ).rejects.toThrow();
  await admin.mutation(api.marketplace.trust, { lender: lenderId, trusted: true });
  expect(
    (await borrower.query(api.marketplace.board, { ...FIRST_PAGE, own: false })).page[0].trusted,
  ).toBe(true);
  await expect(
    borrower.mutation(api.marketplace.transition, { id, status: "approved" }),
  ).rejects.toThrow();
  await expect(
    admin.mutation(api.marketplace.transition, { id, status: "approved" }),
  ).rejects.toThrow();
  await admin.mutation(api.marketplace.remove, { id: tool });
  expect(
    (await borrower.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "outgoing" })).page[0]
      .status,
  ).toBe("cancelled");
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toEqual([]);
});

test("parallel approvals reserve inclusive date ranges and only the lender can mark a loan returned", async () => {
  const { t, lender, borrower, other, tool } = await setup();
  await expect(
    borrower.mutation(api.marketplace.request, {
      idempotencyKey: requestKey,
      tool,
      start: today,
      end: "2027-02-31",
    }),
  ).rejects.toThrow();
  const one = await borrower.mutation(api.marketplace.request, {
    idempotencyKey: requestKey,
    tool,
    start: today,
    end: tomorrow,
  });
  const two = await other.mutation(api.marketplace.request, {
    idempotencyKey: requestKey,
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
  await t.mutation(internal.automation.updateBoardClock, {});
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toMatchObject([
    { name: listing.name, available: false, returnDue: tomorrow },
  ]);
  await expect(
    borrower.mutation(api.marketplace.transition, { id: approved, status: "returned" }),
  ).rejects.toThrow();
  await lender.mutation(api.marketplace.transition, { id: approved, status: "returned" });
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toHaveLength(1);
});

test("request keys are scoped to the borrower and replay the original loan after cancellation", async () => {
  const { t, lender, borrower, other, tool } = await setup();
  const request = { tool, start: today, end: tomorrow, idempotencyKey: requestKey };
  await expect(t.mutation(api.marketplace.request, request)).rejects.toThrow("Sign in");
  await expect(lender.mutation(api.marketplace.request, request)).rejects.toThrow(
    "can’t be requested",
  );
  await expect(
    borrower.mutation(api.marketplace.request, { ...request, idempotencyKey: "invalid" }),
  ).rejects.toThrow("Invalid request key");

  const [original, repeated, alternate] = await Promise.all([
    borrower.mutation(api.marketplace.request, request),
    borrower.mutation(api.marketplace.request, request),
    borrower.mutation(api.marketplace.request, { ...request, idempotencyKey: secondKey }),
  ]);
  expect(repeated).toBe(original);
  expect(alternate).toBe(original);
  expect(await other.mutation(api.marketplace.request, request)).not.toBe(original);
  await expect(
    borrower.mutation(api.marketplace.request, { ...request, start: tomorrow }),
  ).rejects.toThrow("already been used");
  await borrower.mutation(api.marketplace.transition, { id: original, status: "cancelled" });
  expect(await borrower.mutation(api.marketplace.request, request)).toBe(original);
  expect(
    await borrower.mutation(api.marketplace.request, { ...request, idempotencyKey: secondKey }),
  ).toBe(original);
  expect(
    (await borrower.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "outgoing" })).page,
  ).toHaveLength(1);
  const events = await t.run((ctx) =>
    ctx.db
      .query("events")
      .withIndex("by_loan", (q) => q.eq("loan", original))
      .collect(),
  );
  expect(events.map((event) => event.kind)).toEqual(["requested", "cancelled"]);
});

test("future bookings block inclusive date ranges and change availability on their UTC start day", async () => {
  const { t, lender, borrower, other, tool } = await setup();
  const nextDay = utcDay(now + 2 * 86_400_000);
  const furtherDay = utcDay(now + 3 * 86_400_000);
  const request = { tool, start: tomorrow, end: tomorrow, idempotencyKey: requestKey };
  await t.mutation(internal.automation.updateBoardClock, {});
  const id = await borrower.mutation(api.marketplace.request, request);
  await lender.mutation(api.marketplace.transition, { id, status: "approved" });
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toMatchObject([
    { available: true, returnDue: null },
  ]);
  expect(await other.query(api.marketplace.bookingAvailability, { tool })).toEqual({
    today,
    overdue: false,
    ranges: [{ start: tomorrow, end: tomorrow }],
  });
  expect(await t.query(api.marketplace.bookingAvailability, { tool })).toBeNull();
  expect(await lender.query(api.marketplace.bookingAvailability, { tool })).toBeNull();
  await expect(
    other.mutation(api.marketplace.request, { ...request, start: today, end: nextDay }),
  ).rejects.toThrow("already booked");
  await expect(other.mutation(api.marketplace.request, request)).rejects.toThrow("already booked");
  const future = await other.mutation(api.marketplace.request, {
    ...request,
    start: furtherDay,
    end: furtherDay,
  });

  vi.setSystemTime(now + 86_400_000);
  await t.mutation(internal.automation.updateBoardClock, {});
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toMatchObject([
    { available: false, returnDue: tomorrow },
  ]);
  vi.setSystemTime(now + 2 * 86_400_000);
  await t.mutation(internal.automation.updateBoardClock, {});
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toMatchObject([
    { available: false, returnDue: null },
  ]);
  await expect(
    other.mutation(api.marketplace.request, {
      tool,
      start: nextDay,
      end: nextDay,
      idempotencyKey: secondKey,
    }),
  ).rejects.toThrow("awaiting return");
  await expect(
    lender.mutation(api.marketplace.transition, { id: future, status: "approved" }),
  ).rejects.toThrow("awaiting return");
  await lender.mutation(api.marketplace.transition, { id, status: "returned" });
  await lender.mutation(api.marketplace.transition, { id: future, status: "approved" });
  expect((await t.query(api.marketplace.publicTools, FIRST_PAGE)).page).toMatchObject([
    { available: true, returnDue: null },
  ]);
});

test("catalog cursors bound results, preserve order and apply visibility and category before paging", async () => {
  const { t, lender, other } = await setup();
  for (let index = 0; index < 110; index++) {
    await lender.mutation(api.marketplace.save, {
      ...listing,
      name: `Catalog tool ${index}`,
      category: index % 2 ? "Garden" : "Hand tools",
    });
  }
  await other.mutation(api.marketplace.save, { ...listing, name: "Someone else's tool" });
  const first = await t.query(api.marketplace.publicTools, FIRST_PAGE);
  expect(first.page).toHaveLength(10);
  expect(first.isDone).toBe(false);
  const second = await t.query(api.marketplace.publicTools, {
    ...FIRST_PAGE,
    cursor: first.continueCursor,
  });
  expect(second.page).toHaveLength(10);
  expect(new Set([...first.page, ...second.page].map((tool) => tool.name)).size).toBe(20);

  for (const pageSize of [25, 50, 100] as const) {
    const result = await t.query(api.marketplace.publicTools, { pageSize, cursor: null });
    expect(result.page).toHaveLength(pageSize);
  }
  const filtered = await lender.query(api.marketplace.board, {
    ...FIRST_PAGE,
    own: false,
    category: "Garden",
  });
  const next = await lender.query(api.marketplace.board, {
    ...FIRST_PAGE,
    own: false,
    category: "Garden",
    cursor: filtered.continueCursor,
  });
  expect(filtered.page).toHaveLength(10);
  expect(next.page).toHaveLength(10);
  expect([...filtered.page, ...next.page].every((tool) => tool.category === "Garden")).toBe(true);
  expect(new Set([...filtered.page, ...next.page].map((tool) => tool.id)).size).toBe(20);

  const owned = await other.query(api.marketplace.board, { ...FIRST_PAGE, own: true });
  expect(owned.page.map((tool) => tool.name)).toEqual(["Someone else's tool"]);
  expect(owned.isDone).toBe(true);
  expect(await lender.query(api.marketplace.boardStats, {})).toMatchObject({ listings: "100+" });

  await expect(
    t.query(api.marketplace.publicTools, { pageSize: 101 as PageSize, cursor: null }),
  ).rejects.toThrow();
  expect(parsePageSize("50")).toBe(50);
  expect(parsePageSize("500")).toBe(10);
  expect(parsePageSize(null)).toBe(10);
});

test("loan and Activity cursors keep member and staff data in their authorized scopes", async () => {
  const { t, lender, borrower, other, admin, tool } = await setup();
  const lenderId = (await lender.query(api.members.viewer, {}))!.id;
  const borrowerId = (await borrower.query(api.members.viewer, {}))!.id;
  const ids = await t.run(async (ctx) => {
    const loans: Id<"loans">[] = [];
    for (let index = 0; index < 26; index++) {
      vi.setSystemTime(now + index);
      const id = await ctx.db.insert("loans", {
        tool,
        lender: lenderId,
        borrower: borrowerId,
        start: today,
        end: tomorrow,
        status: "pending",
      });
      loans.push(id);
      await ctx.db.insert("notifications", {
        key: `test:${id}`,
        loan: id,
        recipient: lenderId,
        kind: "requested",
      });
    }
    return loans.reverse();
  });
  for (const [client, view] of [
    [lender, "incoming"],
    [borrower, "outgoing"],
    [admin, "all"],
  ] as const) {
    const first = await client.query(api.marketplace.myLoans, { ...FIRST_PAGE, view });
    const remaining = await client.query(api.marketplace.myLoans, {
      pageSize: 25,
      view,
      cursor: first.continueCursor,
    });
    expect(first.page.map((loan) => loan.id)).toEqual(ids.slice(0, 10));
    expect(remaining.page.map((loan) => loan.id)).toEqual(ids.slice(10));
    expect(remaining.isDone).toBe(true);
  }
  const activity = await lender.query(api.marketplace.inbox, { pageSize: 25, cursor: null });
  const older = await lender.query(api.marketplace.inbox, {
    ...FIRST_PAGE,
    cursor: activity.continueCursor,
  });
  expect(activity.page.map((entry) => entry.loanId)).toEqual(ids.slice(0, 25));
  expect(older.page.map((entry) => entry.loanId)).toEqual(ids.slice(25));
  expect(older.isDone).toBe(true);
  expect(
    (await other.query(api.marketplace.inbox, { ...FIRST_PAGE, cursor: activity.continueCursor }))
      .page,
  ).toEqual([]);
  expect((await other.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "all" })).page).toEqual(
    [],
  );
  expect(await other.query(api.marketplace.loanDetails, { id: ids[25] })).toBeNull();
  expect(await lender.query(api.marketplace.loanDetails, { id: ids[25] })).toMatchObject({
    id: ids[25],
  });
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
  const { t, lender, borrower, other, tool } = await setup();
  const id = await borrower.mutation(api.marketplace.request, {
    idempotencyKey: requestKey,
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
  expect((await lender.query(api.marketplace.inbox, FIRST_PAGE)).page).toMatchObject([
    { kind: "requested", tool: listing.name, loanId: id },
  ]);
  expect((await borrower.query(api.marketplace.inbox, FIRST_PAGE)).page).toEqual([]);
  expect((await other.query(api.marketplace.inbox, FIRST_PAGE)).page).toEqual([]);
});

test.each([
  { status: 503, reason: "Webhook returned HTTP 503." },
  { status: 200, reason: "Webhook did not record delivery in Convex." },
])(
  "HTTP $status without a write-back retries, fails, and can be replayed",
  async ({ status, reason }) => {
    const { t, lender, borrower, tool } = await setup();
    const loan = await borrower.mutation(api.marketplace.request, {
      idempotencyKey: requestKey,
      tool,
      start: today,
      end: tomorrow,
    });
    vi.stubEnv(
      "N8N_REQUEST_WEBHOOK_URL",
      "https://n8n.example.test/webhook/lendloop-request-event",
    );
    const webhook = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status }),
    );
    vi.stubGlobal("fetch", webhook);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (await lender.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "incoming" })).page[0]
        .delivery,
    ).toBe("queued");

    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(webhook).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenLastCalledWith(
      "Request notification failed",
      expect.objectContaining({ attempt: 4, reason }),
    );
    expect(
      (await lender.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "incoming" })).page[0]
        .delivery,
    ).toBe("failed");
    expect((await lender.query(api.marketplace.inbox, FIRST_PAGE)).page).toEqual([]);

    const event = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_loan", (q) => q.eq("loan", loan))
        .first(),
    );
    expect(event?.failedAt).toBeDefined();
    webhook.mockImplementationOnce(async (_url, init) => {
      const verified = runCode(requestFlow, "Verify request signature", {
        headers: init.headers,
        body: JSON.parse(init.body as string),
      });
      return sendCodeRequest(
        t,
        "event-delivered",
        runCode(requestFlow, "Sign event delivery", verified),
      );
    });
    await t.action(internal.dispatch.send, { eventId: event!._id, attempt: 1 });
    await t.action(internal.dispatch.send, { eventId: event!._id, attempt: 1 });
    expect(webhook).toHaveBeenCalledTimes(5);
    expect(
      (await lender.query(api.marketplace.myLoans, { ...FIRST_PAGE, view: "incoming" })).page[0]
        .delivery,
    ).toBe("logged");
    expect((await lender.query(api.marketplace.inbox, FIRST_PAGE)).page).toMatchObject([
      { kind: "requested", tool: listing.name },
    ]);
    expect((await borrower.query(api.marketplace.inbox, FIRST_PAGE)).page).toEqual([]);
  },
);

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

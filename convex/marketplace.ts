import { ConvexError, v } from "convex/values";
import { isDay, utcDay } from "../lib/catalog";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { currentMember, requireMember } from "./members";
import { listing } from "./validators";

function cleanListing(args: Pick<Doc<"tools">, "name" | "category" | "condition" | "description">) {
  const name = args.name.trim();
  const description = args.description.trim();
  if (name.length < 2 || name.length > 80 || description.length < 2 || description.length > 280) {
    throw new ConvexError("Use 2–80 characters for the name and 2–280 for the description.");
  }
  return { name, category: args.category, condition: args.condition, description };
}

async function availableNow(ctx: QueryCtx) {
  const clock = await ctx.db.query("boardClock").unique();
  const today = clock?.day ?? utcDay();
  const approved = await ctx.db.query("loans").withIndex("by_status_end", (q) => q.eq("status", "approved")).collect();
  const away = new Set(approved.filter((loan) => loan.start <= today).map((loan) => loan.tool));
  const tools = await ctx.db.query("tools").withIndex("by_archived", (q) => q.eq("archived", false)).order("desc").collect();
  return tools.map((tool) => ({ ...tool, available: !away.has(tool._id) }));
}

export const publicTools = query({
  args: {},
  handler: async (ctx) => (await availableNow(ctx)).filter((tool) => tool.available)
    .map(({ name, category }) => ({ name, category })),
});

export const board = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];
    return Promise.all((await availableNow(ctx)).map(async ({ _id, name, category, condition, description, owner, available }) => ({
      id: _id, name, category, condition, description, available, mine: owner === member._id, lender: member.role === "admin" ? owner : null,
      trusted: (await ctx.db.get("members", owner))?.trusted ?? false,
    })));
  },
});

export const myLoans = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return { incoming: [], outgoing: [], all: [] };
    const [incoming, outgoing, all] = await Promise.all([
      ctx.db.query("loans").withIndex("by_lender", (q) => q.eq("lender", member._id)).order("desc").collect(),
      ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrower", member._id)).order("desc").collect(),
      member.role === "admin" ? ctx.db.query("loans").order("desc").collect() : [],
    ]);
    const format = async (loan: Doc<"loans">) => {
      const tool = await ctx.db.get("tools", loan.tool);
      const lender = await ctx.db.get("members", loan.lender);
      const latest = await ctx.db.query("events").withIndex("by_loan", (q) => q.eq("loan", loan._id)).order("desc").first();
      const isParticipant = member._id === loan.borrower || member._id === loan.lender;
      return {
        id: loan._id, name: tool?.name ?? "Archived tool", start: loan.start, end: loan.end, status: loan.status,
        lastReminderDay: loan.lastReminderDay, delivery: latest?.failedAt ? "failed" as const :
          latest?.deliveredAt ? "logged" as const : "queued" as const,
        lender: member.role === "admin" ? loan.lender : null, trusted: lender?.trusted ?? false,
        isLender: isParticipant && member._id === loan.lender, isBorrower: isParticipant && member._id === loan.borrower,
      };
    };
    return {
      incoming: await Promise.all(incoming.map(format)),
      outgoing: await Promise.all(outgoing.map(format)),
      all: await Promise.all(all.map(format)),
    };
  },
});

export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return [];
    const notifications = await ctx.db.query("notifications").withIndex("by_recipient", (q) => q.eq("recipient", member._id)).order("desc").take(15);
    return Promise.all(notifications.map(async (notification) => {
      const loan = await ctx.db.get("loans", notification.loan);
      const tool = loan && await ctx.db.get("tools", loan.tool);
      return { id: notification._id, at: notification._creationTime, kind: notification.kind, tool: tool?.name ?? "Archived tool" };
    }));
  },
});

export const save = mutation({
  args: { ...listing, id: v.optional(v.id("tools")) },
  handler: async (ctx, { id, ...fields }) => {
    const member = await requireMember(ctx);
    const values = cleanListing(fields);
    if (!id) return ctx.db.insert("tools", { ...values, owner: member._id, archived: false });
    const tool = await ctx.db.get("tools", id);
    if (!tool || tool.archived || tool.owner !== member._id) throw new ConvexError("You can only edit your own active listings.");
    await ctx.db.patch("tools", id, values);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("tools") },
  handler: async (ctx, { id }) => {
    const member = await requireMember(ctx);
    const tool = await ctx.db.get("tools", id);
    if (!tool || (tool.owner !== member._id && member.role !== "admin")) throw new ConvexError("You can’t remove this listing.");
    if (tool.archived) return;
    await ctx.db.patch("tools", id, { archived: true });
    const pending = await ctx.db.query("loans").withIndex("by_tool_status_end", (q) => q.eq("tool", id).eq("status", "pending")).collect();
    for (const loan of pending) {
      await ctx.db.patch("loans", loan._id, { status: "cancelled" });
      await enqueue(ctx, loan._id, loan.borrower, "cancelled");
    }
  },
});

export const trust = mutation({
  args: { lender: v.id("members"), trusted: v.boolean() },
  handler: async (ctx, { lender, trusted }) => {
    const member = await requireMember(ctx);
    if (member.role !== "admin") throw new ConvexError("Admin access required.");
    const listing = await ctx.db.query("tools").withIndex("by_owner_archived", (q) => q.eq("owner", lender)).first();
    if (!listing) throw new ConvexError("This member has no listings.");
    await ctx.db.patch("members", lender, { trusted });
  },
});

type RequestEvent = Exclude<Doc<"events">["kind"], "overdue">;

async function enqueue(ctx: MutationCtx, loan: Id<"loans">, recipient: Id<"members">, kind: RequestEvent) {
  const eventId = await ctx.db.insert("events", { loan, recipient, kind });
  await ctx.scheduler.runAfter(0, internal.dispatch.send, { eventId, attempt: 1 });
}

export const request = mutation({
  args: { tool: v.id("tools"), start: v.string(), end: v.string() },
  handler: async (ctx, { tool: toolId, start, end }) => {
    const borrower = await requireMember(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (!tool || tool.archived || tool.owner === borrower._id) throw new ConvexError("This tool can’t be requested.");
    if (!isDay(start) || !isDay(end) || start < utcDay() || end < start) {
      throw new ConvexError("Choose a valid date range starting today or later.");
    }
    const existing = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrower", borrower._id))
      .filter((q) => q.and(q.eq(q.field("tool"), toolId), q.eq(q.field("start"), start), q.eq(q.field("end"), end),
        q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "approved")))).first();
    if (existing) return existing._id;
    const id = await ctx.db.insert("loans", { tool: toolId, lender: tool.owner, borrower: borrower._id, start, end, status: "pending" });
    await enqueue(ctx, id, tool.owner, "requested");
    return id;
  },
});

export const transition = mutation({
  args: { id: v.id("loans"), status: v.union(v.literal("approved"), v.literal("declined"), v.literal("returned"), v.literal("cancelled")) },
  handler: async (ctx, { id, status }) => {
    const member = await requireMember(ctx);
    const loan = await ctx.db.get("loans", id);
    const actor = status === "cancelled" ? loan?.borrower : loan?.lender;
    if (!loan || actor !== member._id) throw new ConvexError("You can’t change this request.");
    if (loan.status === status) return;
    if (loan.status !== (status === "returned" ? "approved" : "pending")) throw new ConvexError("This request has already changed.");
    const today = utcDay();
    if (status === "returned" && loan.start > today) throw new ConvexError("The loan has not started yet.");
    if (status === "approved") {
      const tool = await ctx.db.get("tools", loan.tool);
      if (!tool || tool.archived || loan.end < today) throw new ConvexError("This request is no longer available.");
      const approved = await ctx.db.query("loans").withIndex("by_tool_status_end", (q) => q.eq("tool", loan.tool).eq("status", "approved")).collect();
      if (approved.some((other) => other.end < today || (other.start <= loan.end && other.end >= loan.start))) {
        throw new ConvexError("The tool is already booked for those dates or is awaiting return.");
      }
    }
    await ctx.db.patch("loans", id, { status });
    await enqueue(ctx, id, status === "cancelled" ? loan.lender : loan.borrower, status);
  },
});

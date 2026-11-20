import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { utcDay } from "../lib/catalog";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const getEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => ctx.db.get("events", eventId),
});

export const markFailed = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("events", eventId);
    if (event && !event.deliveredAt) await ctx.db.patch("events", eventId, { failedAt: Date.now() });
  },
});

async function logNotification(ctx: MutationCtx, key: string, loan: Id<"loans">, recipient: Id<"members">, kind: Doc<"notifications">["kind"]) {
  const existing = await ctx.db.query("notifications").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (existing) return;
  await ctx.db.insert("notifications", { key, loan, recipient, kind });
}

export const deliverEvent = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const id = ctx.db.normalizeId("events", eventId);
    const event = id && await ctx.db.get("events", id);
    if (!event) return { applied: false };
    if (event.deliveredAt) return { applied: true };
    await logNotification(ctx, "event:" + event._id, event.loan, event.recipient, event.kind);
    await ctx.db.patch("events", event._id, { deliveredAt: Date.now(), failedAt: undefined });
    return { applied: true };
  },
});

export const overdue = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const day = utcDay();
    const result = await ctx.db.query("loans").withIndex("by_status_end", (q) => q.eq("status", "approved").lt("end", day)).paginate(paginationOpts);
    return {
      loans: result.page.filter((loan) => loan.lastReminderDay !== day).map((loan) => loan._id),
      cursor: result.isDone ? null : result.continueCursor,
      day,
    };
  },
});

export const deliverReminder = internalMutation({
  args: { loanIds: v.array(v.string()), day: v.string() },
  handler: async (ctx, { loanIds, day }) => {
    if (day !== utcDay()) return { logged: 0 };
    let logged = 0;
    for (const loanId of new Set(loanIds)) {
      const id = ctx.db.normalizeId("loans", loanId);
      const loan = id && await ctx.db.get("loans", id);
      if (!loan || loan.status !== "approved" || loan.end >= day || loan.lastReminderDay === day) continue;
      await logNotification(ctx, "reminder:" + loan._id + ":" + day, loan._id, loan.borrower, "overdue");
      await ctx.db.patch("loans", loan._id, { lastReminderDay: day });
      logged++;
    }
    return { logged };
  },
});

export const updateBoardClock = internalMutation({
  args: {},
  handler: async (ctx) => {
    const clock = await ctx.db.query("boardClock").unique();
    const day = utcDay();
    if (clock) await ctx.db.patch("boardClock", clock._id, { day });
    else await ctx.db.insert("boardClock", { day });
  },
});

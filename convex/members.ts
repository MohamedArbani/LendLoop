import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function currentMember(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("members")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .unique();
}

export async function requireMember(ctx: QueryCtx | MutationCtx) {
  const member = await currentMember(ctx);
  if (!member) throw new ConvexError("Sign in to continue.");
  return member;
}

export const register = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to continue.");
    const existing = await currentMember(ctx);
    if (!existing)
      await ctx.db.insert("members", { subject: identity.subject, role: "user", trusted: false });
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    return member && { id: member._id, role: member.role };
  },
});

export const setRole = internalMutation({
  args: { subject: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { subject, role }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
    if (!member) throw new ConvexError("The account must sign in first.");
    await ctx.db.patch("members", member._id, { role });
  },
});

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { eventKind, listing, status } from "./validators";

export default defineSchema({
  boardClock: defineTable({ day: v.string() }),
  members: defineTable({
    subject: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    trusted: v.boolean(),
  }).index("by_subject", ["subject"]),
  tools: defineTable({
    ...listing,
    owner: v.id("members"),
    archived: v.boolean(),
  })
    .index("by_archived", ["archived"])
    .index("by_owner_archived", ["owner", "archived"]),
  loans: defineTable({
    tool: v.id("tools"),
    lender: v.id("members"),
    borrower: v.id("members"),
    start: v.string(),
    end: v.string(),
    status,
    lastReminderDay: v.optional(v.string()),
  })
    .index("by_tool_status_end", ["tool", "status", "end"])
    .index("by_status_end", ["status", "end"])
    .index("by_lender", ["lender"])
    .index("by_borrower", ["borrower"]),
  events: defineTable({
    loan: v.id("loans"),
    recipient: v.id("members"),
    kind: eventKind,
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  }).index("by_loan", ["loan"]),
  notifications: defineTable({
    key: v.string(),
    loan: v.id("loans"),
    recipient: v.id("members"),
    kind: eventKind,
  })
    .index("by_key", ["key"])
    .index("by_recipient", ["recipient"]),
});

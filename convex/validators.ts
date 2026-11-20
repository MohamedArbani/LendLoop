import { v } from "convex/values";
import { categories, conditions } from "../lib/catalog";

export const category = v.union(...categories.map((name) => v.literal(name)));
export const condition = v.union(...conditions.map((name) => v.literal(name)));
export const listing = { name: v.string(), category, condition, description: v.string() };
export const status = v.union(v.literal("pending"), v.literal("approved"), v.literal("declined"), v.literal("returned"), v.literal("cancelled"));
export const eventKind = v.union(v.literal("requested"), v.literal("approved"), v.literal("declined"), v.literal("returned"), v.literal("cancelled"), v.literal("overdue"));

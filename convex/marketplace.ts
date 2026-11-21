import { getPage } from "convex-helpers/server/pagination";
import type { PageRequest } from "convex-helpers/server/pagination";
import { paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { isDay, utcDay } from "../lib/catalog";
import { PAGE_SIZES } from "../lib/constants";
import type { PageSize } from "../lib/constants";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { currentMember, requireMember } from "./members";
import schema from "./schema";
import { category, eventKind, listing, status as loanStatus } from "./validators";

function cleanListing(args: Pick<Doc<"tools">, "name" | "category" | "condition" | "description">) {
  const name = args.name.trim();
  const description = args.description.trim();
  if (name.length < 2 || name.length > 80 || description.length < 2 || description.length > 280) {
    throw new ConvexError("Use 2–80 characters for the name and 2–280 for the description.");
  }
  return { name, category: args.category, condition: args.condition, description };
}

async function boardDay(ctx: QueryCtx) {
  const clock = await ctx.db.query("boardClock").unique();
  return clock?.day ?? utcDay();
}

const publicAvailability = { available: v.boolean(), returnDue: v.union(v.string(), v.null()) };

const pageArgs = {
  pageSize: v.union(...PAGE_SIZES.map((size) => v.literal(size))),
  cursor: v.union(v.string(), v.null()),
};
const emptyPage = { page: [], isDone: true, continueCursor: "" };

async function readPage<Table extends "tools" | "loans" | "notifications">(
  ctx: QueryCtx,
  source: Pick<PageRequest<DataModel, Table>, "table" | "index">,
  prefix: (string | boolean)[],
  pageSize: PageSize,
  cursor: string | null,
) {
  let startIndexKey: (string | boolean | number)[] = prefix;
  if (cursor !== null) {
    if (cursor.length > 512) return emptyPage;
    let value: unknown;
    try {
      value = JSON.parse(cursor);
    } catch {
      return emptyPage;
    }
    if (
      !Array.isArray(value) ||
      value[0] !== source.index ||
      value.length !== prefix.length + 3 ||
      !prefix.every((part, index) => value[index + 1] === part)
    )
      return emptyPage;
    const creationTime: unknown = value.at(-2);
    const id: unknown = value.at(-1);
    if (
      typeof creationTime !== "number" ||
      !Number.isFinite(creationTime) ||
      typeof id !== "string" ||
      !ctx.db.normalizeId(source.table, id)
    )
      return emptyPage;
    startIndexKey = [...prefix, creationTime, id];
  }

  // One lookahead keeps the page bounded as subscriptions react to inserts and deletes.
  const { page, hasMore, indexKeys } = await getPage(ctx, {
    ...source,
    schema,
    order: "desc",
    startIndexKey,
    startInclusive: cursor === null,
    endIndexKey: prefix,
    absoluteMaxRows: pageSize,
  });
  return {
    page,
    isDone: !hasMore,
    continueCursor: hasMore ? JSON.stringify([source.index, ...indexKeys.at(-1)!]) : "",
  };
}

async function toolAvailability(ctx: QueryCtx, tool: Id<"tools">, today: string) {
  const loan = await ctx.db
    .query("loans")
    .withIndex("by_tool_status_start", (q) =>
      q.eq("tool", tool).eq("status", "approved").lte("start", today),
    )
    .first();

  return { available: loan === null, returnDue: loan && loan.end >= today ? loan.end : null };
}

export const publicTools = query({
  args: pageArgs,
  returns: paginationResultValidator(
    v.object({ name: v.string(), category, ...publicAvailability }),
  ),
  handler: async (ctx, { pageSize, cursor }) => {
    const today = await boardDay(ctx);
    const result = await readPage(
      ctx,
      { table: "tools", index: "by_archived" },
      [false],
      pageSize,
      cursor,
    );
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async ({ _id, name, category }) => ({
          name,
          category,
          ...(await toolAvailability(ctx, _id, today)),
        })),
      ),
    };
  },
});

export const board = query({
  args: { ...pageArgs, own: v.boolean(), category: v.optional(category) },
  returns: paginationResultValidator(
    v.object({
      id: v.id("tools"),
      ...listing,
      ...publicAvailability,
      mine: v.boolean(),
      lender: v.union(v.id("members"), v.null()),
      trusted: v.boolean(),
    }),
  ),
  handler: async (ctx, { pageSize, cursor, own, category }) => {
    const member = await currentMember(ctx);
    if (!member) return emptyPage;
    const today = await boardDay(ctx);
    const result = own
      ? await readPage(
          ctx,
          { table: "tools", index: "by_owner_archived" },
          [member._id, false],
          pageSize,
          cursor,
        )
      : category
        ? await readPage(
            ctx,
            { table: "tools", index: "by_archived_category" },
            [false, category],
            pageSize,
            cursor,
          )
        : await readPage(ctx, { table: "tools", index: "by_archived" }, [false], pageSize, cursor);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async ({ _id, name, category, condition, description, owner }) => ({
          id: _id,
          name,
          category,
          condition,
          description,
          ...(await toolAvailability(ctx, _id, today)),
          mine: owner === member._id,
          lender: member.role === "admin" ? owner : null,
          trusted: (await ctx.db.get("members", owner))?.trusted ?? false,
        })),
      ),
    };
  },
});

export const boardStats = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      available: v.string(),
      listings: v.string(),
      incoming: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const member = await currentMember(ctx);
    if (!member) return null;
    const today = await boardDay(ctx);
    // Keep overview reads bounded independently of the selected page.
    const limit = PAGE_SIZES[PAGE_SIZES.length - 1];
    const [tools, owned, pending] = await Promise.all([
      ctx.db
        .query("tools")
        .withIndex("by_archived", (q) => q.eq("archived", false))
        .take(limit + 1),
      ctx.db
        .query("tools")
        .withIndex("by_owner_archived", (q) => q.eq("owner", member._id).eq("archived", false))
        .take(limit + 1),
      ctx.db
        .query("loans")
        .withIndex("by_lender_status", (q) => q.eq("lender", member._id).eq("status", "pending"))
        .take(limit + 1),
    ]);
    const availability = await Promise.all(
      tools.slice(0, limit).map((tool) => toolAvailability(ctx, tool._id, today)),
    );
    const available = availability.filter((tool) => tool.available).length;
    return {
      available: tools.length > limit ? `${available}+` : String(available),
      listings: owned.length > limit ? `${limit}+` : String(owned.length),
      incoming: pending.length > limit ? `${limit}+` : String(pending.length),
    };
  },
});

function approvedLoans(ctx: QueryCtx | MutationCtx, tool: Id<"tools">, start: string) {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_status_end", (q) =>
      q.eq("tool", tool).eq("status", "approved").gte("end", start),
    );
}

function overdueLoan(ctx: QueryCtx | MutationCtx, tool: Id<"tools">, today: string) {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_status_end", (q) =>
      q.eq("tool", tool).eq("status", "approved").lt("end", today),
    )
    .first();
}

function bookingConflict(ctx: MutationCtx, tool: Id<"tools">, start: string, end: string) {
  return approvedLoans(ctx, tool, start)
    .filter((q) => q.lte(q.field("start"), end))
    .first();
}

const bookedMessage = "This tool is already booked for those dates.";

export const bookingAvailability = query({
  args: { tool: v.id("tools") },
  returns: v.union(
    v.null(),
    v.object({
      today: v.string(),
      overdue: v.boolean(),
      ranges: v.array(
        v.object({
          start: v.string(),
          end: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { tool }) => {
    const member = await currentMember(ctx);
    if (!member) return null;
    const listing = await ctx.db.get("tools", tool);
    if (!listing || listing.archived || listing.owner === member._id) return null;

    const today = await boardDay(ctx);
    const overdue = (await overdueLoan(ctx, tool, today)) !== null;
    const ranges = overdue ? [{ start: today, end: today }] : [];
    for await (const { start, end } of approvedLoans(ctx, tool, today)) ranges.push({ start, end });
    return { today, overdue, ranges };
  },
});

const loanCard = v.object({
  id: v.id("loans"),
  name: v.string(),
  start: v.string(),
  end: v.string(),
  status: loanStatus,
  lastReminderDay: v.optional(v.string()),
  delivery: v.union(v.literal("failed"), v.literal("logged"), v.literal("queued")),
  lender: v.union(v.id("members"), v.null()),
  trusted: v.boolean(),
  isLender: v.boolean(),
  isBorrower: v.boolean(),
});

async function formatLoan(ctx: QueryCtx, loan: Doc<"loans">, member: Doc<"members">) {
  const [tool, lender, latest] = await Promise.all([
    ctx.db.get("tools", loan.tool),
    ctx.db.get("members", loan.lender),
    ctx.db
      .query("events")
      .withIndex("by_loan", (q) => q.eq("loan", loan._id))
      .order("desc")
      .first(),
  ]);
  return {
    id: loan._id,
    name: tool?.name ?? "Archived tool",
    start: loan.start,
    end: loan.end,
    status: loan.status,
    lastReminderDay: loan.lastReminderDay,
    delivery: latest?.failedAt
      ? ("failed" as const)
      : latest?.deliveredAt
        ? ("logged" as const)
        : ("queued" as const),
    lender: member.role === "admin" ? loan.lender : null,
    trusted: lender?.trusted ?? false,
    isLender: member._id === loan.lender,
    isBorrower: member._id === loan.borrower,
  };
}

export const myLoans = query({
  args: {
    ...pageArgs,
    view: v.union(v.literal("incoming"), v.literal("outgoing"), v.literal("all")),
  },
  returns: paginationResultValidator(loanCard),
  handler: async (ctx, { pageSize, cursor, view }) => {
    const member = await currentMember(ctx);
    if (!member || (view === "all" && member.role !== "admin")) return emptyPage;
    const result =
      view === "all"
        ? await readPage(ctx, { table: "loans", index: "by_creation_time" }, [], pageSize, cursor)
        : await readPage(
            ctx,
            { table: "loans", index: view === "incoming" ? "by_lender" : "by_borrower" },
            [member._id],
            pageSize,
            cursor,
          );
    return {
      ...result,
      page: await Promise.all(result.page.map((loan) => formatLoan(ctx, loan, member))),
    };
  },
});

export const loanDetails = query({
  args: { id: v.id("loans") },
  returns: v.union(v.null(), loanCard),
  handler: async (ctx, { id }) => {
    const member = await currentMember(ctx);
    if (!member) return null;
    const loan = await ctx.db.get("loans", id);
    if (!loan || (loan.lender !== member._id && loan.borrower !== member._id)) return null;
    return formatLoan(ctx, loan, member);
  },
});

export const inbox = query({
  args: pageArgs,
  returns: paginationResultValidator(
    v.object({
      id: v.id("notifications"),
      loanId: v.id("loans"),
      at: v.number(),
      kind: eventKind,
      tool: v.string(),
    }),
  ),
  handler: async (ctx, { pageSize, cursor }) => {
    const member = await currentMember(ctx);
    if (!member) return emptyPage;
    const result = await readPage(
      ctx,
      { table: "notifications", index: "by_recipient" },
      [member._id],
      pageSize,
      cursor,
    );
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (notification) => {
          const loan = await ctx.db.get("loans", notification.loan);
          const tool = loan && (await ctx.db.get("tools", loan.tool));
          return {
            id: notification._id,
            loanId: notification.loan,
            at: notification._creationTime,
            kind: notification.kind,
            tool: tool?.name ?? "Archived tool",
          };
        }),
      ),
    };
  },
});

export const save = mutation({
  args: { ...listing, id: v.optional(v.id("tools")) },
  handler: async (ctx, { id, ...fields }) => {
    const member = await requireMember(ctx);
    const values = cleanListing(fields);
    if (!id) return ctx.db.insert("tools", { ...values, owner: member._id, archived: false });
    const tool = await ctx.db.get("tools", id);
    if (!tool || tool.archived || tool.owner !== member._id)
      throw new ConvexError("You can only edit your own active listings.");
    await ctx.db.patch("tools", id, values);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("tools") },
  handler: async (ctx, { id }) => {
    const member = await requireMember(ctx);
    const tool = await ctx.db.get("tools", id);
    if (!tool || (tool.owner !== member._id && member.role !== "admin"))
      throw new ConvexError("You can’t remove this listing.");
    if (tool.archived) return;
    await ctx.db.patch("tools", id, { archived: true });
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status_end", (q) => q.eq("tool", id).eq("status", "pending"))
      .collect();
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
    const listing = await ctx.db
      .query("tools")
      .withIndex("by_owner_archived", (q) => q.eq("owner", lender))
      .first();
    if (!listing) throw new ConvexError("This member has no listings.");
    await ctx.db.patch("members", lender, { trusted });
  },
});

type RequestEvent = Exclude<Doc<"events">["kind"], "overdue">;

async function enqueue(
  ctx: MutationCtx,
  loan: Id<"loans">,
  recipient: Id<"members">,
  kind: RequestEvent,
) {
  const eventId = await ctx.db.insert("events", { loan, recipient, kind });
  await ctx.scheduler.runAfter(0, internal.dispatch.send, { eventId, attempt: 1 });
}

export const request = mutation({
  args: { tool: v.id("tools"), start: v.string(), end: v.string(), idempotencyKey: v.string() },
  returns: v.id("loans"),
  handler: async (ctx, { tool: toolId, start, end, idempotencyKey }) => {
    const borrower = await requireMember(ctx);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
    ) {
      throw new ConvexError("Invalid request key. Reopen the request and try again.");
    }
    if (!isDay(start) || !isDay(end) || end < start) {
      throw new ConvexError("Choose a valid date range starting today or later.");
    }

    const key = idempotencyKey.toLowerCase();
    const previous = await ctx.db
      .query("bookingRequests")
      .withIndex("by_borrower_key", (q) => q.eq("borrower", borrower._id).eq("key", key))
      .unique();
    if (previous) {
      const loan = await ctx.db.get("loans", previous.loan);
      if (!loan || loan.tool !== toolId || loan.start !== start || loan.end !== end) {
        throw new ConvexError(
          "This request key has already been used for different dates or a different tool.",
        );
      }
      return previous.loan;
    }

    const tool = await ctx.db.get("tools", toolId);
    if (!tool || tool.archived || tool.owner === borrower._id)
      throw new ConvexError("This tool can’t be requested.");
    const today = utcDay();
    if (start < today) throw new ConvexError("Choose a valid date range starting today or later.");

    const findExisting = (status: "approved" | "pending") =>
      ctx.db
        .query("loans")
        .withIndex("by_borrower_tool_start_end_status", (q) =>
          q
            .eq("borrower", borrower._id)
            .eq("tool", toolId)
            .eq("start", start)
            .eq("end", end)
            .eq("status", status),
        )
        .first();
    const approved = await findExisting("approved");
    if (approved) {
      await ctx.db.insert("bookingRequests", { borrower: borrower._id, key, loan: approved._id });
      return approved._id;
    }

    if (await bookingConflict(ctx, toolId, start, end)) throw new ConvexError(bookedMessage);
    if (start === today && (await overdueLoan(ctx, toolId, today))) {
      throw new ConvexError("The tool is awaiting return. Choose future dates.");
    }

    const pending = await findExisting("pending");
    const loan =
      pending?._id ??
      (await ctx.db.insert("loans", {
        tool: toolId,
        lender: tool.owner,
        borrower: borrower._id,
        start,
        end,
        status: "pending",
      }));
    await ctx.db.insert("bookingRequests", { borrower: borrower._id, key, loan });
    if (!pending) await enqueue(ctx, loan, tool.owner, "requested");
    return loan;
  },
});

export const transition = mutation({
  args: {
    id: v.id("loans"),
    status: v.union(
      v.literal("approved"),
      v.literal("declined"),
      v.literal("returned"),
      v.literal("cancelled"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const member = await requireMember(ctx);
    const loan = await ctx.db.get("loans", id);
    const actor = status === "cancelled" ? loan?.borrower : loan?.lender;
    if (!loan || actor !== member._id) throw new ConvexError("You can’t change this request.");
    if (loan.status === status) return null;
    if (loan.status !== (status === "returned" ? "approved" : "pending"))
      throw new ConvexError("This request has already changed.");
    const today = utcDay();
    if (status === "returned" && loan.start > today)
      throw new ConvexError("The loan has not started yet.");
    if (status === "approved") {
      const tool = await ctx.db.get("tools", loan.tool);
      if (!tool || tool.archived || loan.end < today)
        throw new ConvexError("This request is no longer available.");
      if (await bookingConflict(ctx, loan.tool, loan.start, loan.end)) {
        throw new ConvexError(bookedMessage);
      }
      if (await overdueLoan(ctx, loan.tool, today)) {
        throw new ConvexError("The tool is awaiting return. Try again after it’s returned.");
      }
    }
    await ctx.db.patch("loans", id, { status });
    await enqueue(ctx, id, status === "cancelled" ? loan.lender : loan.borrower, status);
    return null;
  },
});

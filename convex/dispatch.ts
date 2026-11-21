import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { signature } from "./signing";

const delays = [10_000, 60_000, 300_000];

async function deliverViaWebhook(ctx: ActionCtx, eventId: Id<"events">): Promise<string | null> {
  const url = process.env.N8N_REQUEST_WEBHOOK_URL;
  const secret = process.env.CONVEX_TO_N8N_SECRET;
  if (!url || !secret) return "Webhook URL or signing key is missing.";

  try {
    // The envelope preserves the signed string across n8n's JSON parser.
    const payload = JSON.stringify({ eventId });
    const timestamp = String(Date.now());
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lendloop-timestamp": timestamp,
        "x-lendloop-signature": await signature(secret, "request-event", timestamp, payload),
      },
      body: JSON.stringify({ payload }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return `Webhook returned HTTP ${response.status}.`;
    const event = await ctx.runQuery(internal.automation.getEvent, { eventId });
    return event?.deliveredAt === undefined ? "Webhook did not record delivery in Convex." : null;
  } catch {
    return "Webhook request or delivery check failed.";
  }
}

export const send = internalAction({
  args: { eventId: v.id("events"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { eventId, attempt }): Promise<null> => {
    const event = await ctx.runQuery(internal.automation.getEvent, { eventId });
    if (!event || event.deliveredAt !== undefined) return null;

    const reason = await deliverViaWebhook(ctx, eventId);
    if (reason === null) return null;

    console.error("Request notification failed", { eventId, attempt, reason });
    const delay = delays[attempt - 1];
    if (delay !== undefined) {
      await ctx.scheduler.runAfter(delay, internal.dispatch.send, {
        eventId,
        attempt: attempt + 1,
      });
    } else {
      await ctx.runMutation(internal.automation.markFailed, { eventId });
    }
    return null;
  },
});

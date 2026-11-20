import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { signature } from "./signing";

const delays = [10_000, 60_000, 300_000];

export const send = internalAction({
  args: { eventId: v.id("events"), attempt: v.number() },
  handler: async (ctx, { eventId, attempt }): Promise<void> => {
    const event = await ctx.runQuery(internal.automation.getEvent, { eventId });
    if (!event || event.deliveredAt) return;
    try {
      const url = process.env.N8N_REQUEST_WEBHOOK_URL;
      const secret = process.env.CONVEX_TO_N8N_SECRET;
      if (!url || !secret) throw new Error("Automation is not configured.");
      // The envelope preserves the signed string across n8n's JSON parser.
      const payload = JSON.stringify({ eventId });
      const timestamp = String(Date.now());
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-lendloop-timestamp": timestamp,
          "x-lendloop-signature": await signature(secret, "request-event", timestamp, payload) },
        body: JSON.stringify({ payload }),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok || !(await ctx.runQuery(internal.automation.getEvent, { eventId }))?.deliveredAt) {
        throw new Error("The workflow did not confirm delivery.");
      }
    } catch {
      console.error("Request notification failed", { eventId, attempt });
      const delay = delays[attempt - 1];
      if (delay !== undefined) {
        await ctx.scheduler.runAfter(delay, internal.dispatch.send, { eventId, attempt: attempt + 1 });
      } else {
        await ctx.runMutation(internal.automation.markFailed, { eventId });
      }
    }
  },
});

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { validSignature } from "./signing";

const http = httpRouter();

for (const route of ["overdue", "event-delivered", "reminder-delivered"] as const) {
  http.route({
    path: "/automation/" + route,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.N8N_TO_CONVEX_SECRET;
      if (!secret) return Response.json({ error: "Automation unavailable" }, { status: 503 });
      const body = await request.text();
      if (body.length > 8192) return Response.json({ error: "Payload too large" }, { status: 413 });
      if (!await validSignature(secret, route, request.headers.get("x-lendloop-timestamp"), body, request.headers.get("x-lendloop-signature"))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      let fields;
      try { fields = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return Response.json({ error: "Invalid payload" }, { status: 400 });
      try {
        if (route === "overdue" && (fields.cursor === null || typeof fields.cursor === "string")) {
          return Response.json(await ctx.runQuery(internal.automation.overdue, { paginationOpts: { cursor: fields.cursor, numItems: 50 } }));
        }
        if (route === "event-delivered" && typeof fields.eventId === "string") {
          const result = await ctx.runMutation(internal.automation.deliverEvent, { eventId: fields.eventId });
          return Response.json(result, { status: result.applied ? 200 : 404 });
        }
        if (route === "reminder-delivered" && Array.isArray(fields.loanIds) && fields.loanIds.length <= 50 &&
          fields.loanIds.every((id: unknown) => typeof id === "string") && typeof fields.day === "string") {
          return Response.json(await ctx.runMutation(internal.automation.deliverReminder, { loanIds: fields.loanIds, day: fields.day }));
        }
      } catch (error) {
        console.error("Automation endpoint failed", { route, type: error instanceof Error ? error.name : "Unknown" });
        return Response.json({ error: "Automation operation failed" }, { status: 500 });
      }
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }),
  });
}

export default http;

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// GET /quotes/latest?limit=20
http.route({
  path: "/quotes/latest",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 100);

    const quotes = await ctx.runQuery(api.quotes.latest, { limit });
    return Response.json({ quotes });
  }),
});

// GET /quotes/random
http.route({
  path: "/quotes/random",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const quote = await ctx.runQuery(api.quotes.random, {});
    return Response.json({ quote });
  }),
});

function header(rfc822: string, name: string): string | undefined {
  const m = rfc822.match(new RegExp(`^${name}:\\s*(.*)$`, "im"));
  return m?.[1]?.trim() || undefined;
}

function bodyFromRfc822(rfc822: string): string {
  // split at first blank line between headers and body
  return rfc822.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
}

function extractQuoteCandidate(body: string): string | undefined {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return undefined;

  // Skip common reply/list noise
  const skip = [
    /^>/,                 // quoted replies
    /^On .* wrote:$/i,
    /^From:\s/i,
    /^Subject:\s/i,
    /^To:\s/i,
    /^Sent:\s/i,
    /^--\s*$/,            // signature delimiter
  ];

  const candidate = lines.find((l) => !skip.some((re) => re.test(l)));
  return candidate ?? lines[0];
}

http.route({
  path: "/ingest-raw",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // --- Auth ---
    const auth = req.headers.get("authorization") ?? "";
    const expected = process.env.WEBHOOK_SECRET;

    if (!expected) return new Response("Missing WEBHOOK_SECRET", { status: 500 });
    if (auth !== `Bearer ${expected}`) return new Response("Unauthorized", { status: 401 });

    // --- Read email ---
    const rfc822 = await req.text();

    const subject = header(rfc822, "Subject");
    const from = header(rfc822, "From");
    const messageId = header(rfc822, "Message-ID");

    const body = bodyFromRfc822(rfc822);
    const quote = extractQuoteCandidate(body);

    if (!quote) return new Response("No quote found", { status: 400 });

    const result = await ctx.runMutation(api.quotes.add, {
      quote,
      from,
      subject,
      messageId,
    });

    return Response.json({ ok: true, quote, ...result });
  }),
});

export default http;

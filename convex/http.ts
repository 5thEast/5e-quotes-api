import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import PostalMime from "postal-mime";

const http = httpRouter();

function requireSecret(req: Request) {
    const expected = process.env.CONVEX_API_SECRET;
    if (!expected) {
        return new Response("Server misconfigured: missing CONVEX_API_SECRET", { status: 500 });
    }

    const got = req.headers.get("x-krotus-secret");
    if (got !== expected) {
        return new Response("Unauthorized", { status: 401 });
    }

    return null; // ok
}


// GET /quotes/latest?limit=20
http.route({
    path: "/quotes/latest",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        const deny = requireSecret(req);
        if (deny) return deny;

        const url = new URL(req.url);
        const limit = Math.min(
            Number(url.searchParams.get("limit") ?? "20") || 20,
            100
        );

        const quotes = await ctx.runQuery(api.quotes.latest, { limit });
        return Response.json({ quotes });
    }),
});


// GET /quotes/random
http.route({
    path: "/quotes/random",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        const deny = requireSecret(req);
        if (deny) return deny;

        const quote = await ctx.runQuery(api.quotes.random, {});
        return Response.json({ quote });
    }),
});


function pickQuote(text: string): string | undefined {
    // Normalize, split to lines
    const lines = text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((l) => l.trim());

    // Stop at common “quoted reply” separators
    const stopAt = [
        /^On .+ wrote:$/i,
        /^From:\s/i,
        /^Sent:\s/i,
        /^Subject:\s/i,
        /^To:\s/i,
        /^-----Original Message-----$/i,
    ];

    const cleaned: string[] = [];
    for (const l of lines) {
        if (!l) continue;
        if (l.startsWith(">")) continue;         // skip quoted replies
        if (l === "--") break;                   // signature delimiter
        if (stopAt.some((re) => re.test(l))) break;
        cleaned.push(l);
        if (cleaned.length >= 10) break;         // don’t over-grab
    }

    // Take first meaningful line as “quote”
    return cleaned[0];
}

http.route({
    path: "/ingest-raw",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
        // Auth
        const auth = req.headers.get("authorization") ?? "";
        const expected = process.env.WEBHOOK_SECRET;
        if (!expected) return new Response("Missing WEBHOOK_SECRET", { status: 500 });
        if (auth !== `Bearer ${expected}`) return new Response("Unauthorized", { status: 401 });

        // Read raw email
        const rfc822 = await req.text();

        // Parse MIME properly
        const parser = new PostalMime();
        const email = await parser.parse(rfc822);

        // email.text is the plain-text body (best for quotes)
        const text = (email.text ?? "").trim();
        const quote = pickQuote(text);

        if (!quote) return new Response("No quote found in text/plain body", { status: 400 });

        const result = await ctx.runMutation(api.quotes.add, {
            quote,
            from: email.from?.text,     // e.g. "River Adkins <radkins@mit.edu>"
            subject: email.subject,
            messageId: email.messageId, // parsed if available
        });

        return Response.json({ ok: true, quote, ...result });
    }),
});

export default http;

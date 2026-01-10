import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    quote: v.string(),
    from: v.optional(v.string()),
    subject: v.optional(v.string()),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.messageId) {
      const existing = await ctx.db
        .query("quotes")
        .filter((q) => q.eq(q.field("messageId"), args.messageId))
        .first();
      if (existing) return { id: existing._id, deduped: true };
    }

    const id = await ctx.db.insert("quotes", {
      quote: args.quote.trim(),
      from: args.from,
      subject: args.subject,
      messageId: args.messageId,
      createdAt: Date.now(),
    });

    return { id, deduped: false };
  },
});

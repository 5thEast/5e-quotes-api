import { query } from "./_generated/server";
import { v } from "convex/values";

export const top = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);

    const rows = await ctx.db.query("leaderboard").collect();

    // Sort by score descending (highest first)
    rows.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));

    return rows.slice(0, limit);
  },
});

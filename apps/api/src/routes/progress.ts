import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { activityDays, progress } from "../db/schema.js";
import type { AppBindings } from "../env.js";
import { jstDate } from "../lib/util.js";
import { requireUser } from "../middleware/auth.js";

const problemIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

const attemptSchema = z.object({ passed: z.boolean() });

/**
 * 進捗(SPEC.md §3.5)。本人のデータのみ。
 * リクエストの user_id は一切信用せず、常にセッションの user.id で絞る(DECISIONS.md D-017 方針 3)。
 */
export const progressRoutes = new Hono<AppBindings>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(progress)
      .where(eq(progress.userId, c.var.user.id))
      .limit(500);
    return c.json({ progress: rows.map(toJson) });
  })
  .get("/:problemId", async (c) => {
    const parsed = problemIdSchema.safeParse(c.req.param("problemId"));
    if (!parsed.success) return c.json({ error: "not_found" } as const, 404);
    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(progress)
      .where(and(eq(progress.userId, c.var.user.id), eq(progress.problemId, parsed.data)))
      .get();
    if (!row) return c.json({ error: "not_found" } as const, 404);
    return c.json({ progress: toJson(row) });
  })
  /** 1 回の挑戦を記録する。試行回数を加算し、正解なら cleared_at を立てる(一度立てたら消さない) */
  .post("/:problemId/attempts", async (c) => {
    const parsed = problemIdSchema.safeParse(c.req.param("problemId"));
    if (!parsed.success) return c.json({ error: "not_found" } as const, 404);
    const body = attemptSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const now = new Date();
    const userId = c.var.user.id;
    const { passed } = body.data;

    // D1 Free は 1 リクエスト 50 クエリまで(D-017 方針 7)。upsert + 活動日の 2 クエリに収める
    const row = await db
      .insert(progress)
      .values({
        userId,
        problemId: parsed.data,
        attempts: 1,
        failures: passed ? 0 : 1,
        clearedAt: passed ? now : null,
        lastAttemptAt: now,
      })
      .onConflictDoUpdate({
        target: [progress.userId, progress.problemId],
        set: {
          attempts: sql`${progress.attempts} + 1`,
          lastAttemptAt: now,
          ...(passed
            ? { clearedAt: sql`coalesce(${progress.clearedAt}, ${now.getTime()})` }
            : { failures: sql`${progress.failures} + 1` }),
        },
      })
      .returning()
      .get();

    await db
      .insert(activityDays)
      .values({ userId, dateJst: jstDate(now) })
      .onConflictDoNothing();

    return c.json({ progress: toJson(row) });
  });

function toJson(row: typeof progress.$inferSelect) {
  return {
    problemId: row.problemId,
    attempts: row.attempts,
    failures: row.failures,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    lastAttemptAt: row.lastAttemptAt.toISOString(),
  };
}

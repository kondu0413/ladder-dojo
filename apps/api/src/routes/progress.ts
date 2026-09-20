import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { activityDays, progress } from "../db/schema.js";
import type { ProgressDto } from "../dto.js";
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
 * 未ログイン中に localStorage に溜めた進捗をログイン時にまとめて取り込む(DECISIONS.md S-002)。
 * D1 Free は 1 リクエスト 50 クエリなので、1 回の upsert バッチ + 活動日 1 件に収まるよう
 * 件数を制限する(D-017 方針 7)。
 */
const MAX_MERGE_ENTRIES = 45;

const mergeSchema = z.object({
  entries: z
    .array(
      z.object({
        problemId: problemIdSchema,
        attempts: z.number().int().min(0).max(100_000),
        failures: z.number().int().min(0).max(100_000),
        cleared: z.boolean(),
        /** 端末で記録した日時。無ければ取り込んだ時刻になる(復習の間隔が取り込み時から数え直される、S-054) */
        clearedAt: z.string().datetime().optional(),
        lastAttemptAt: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(MAX_MERGE_ENTRIES),
});

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
  })
  /** 端末に溜めた進捗を取り込む。クリアは OR、試行・失敗は加算(S-002) */
  .post("/merge", async (c) => {
    const body = mergeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const now = new Date();
    const userId = c.var.user.id;

    const statements = body.data.entries.map((e) => {
      const clearedAt = e.cleared ? parseWhen(e.clearedAt, now) : null;
      const lastAttemptAt = parseWhen(e.lastAttemptAt, now);
      return db
        .insert(progress)
        .values({
          userId,
          problemId: e.problemId,
          attempts: e.attempts,
          failures: e.failures,
          clearedAt,
          lastAttemptAt,
        })
        .onConflictDoUpdate({
          target: [progress.userId, progress.problemId],
          set: {
            attempts: sql`${progress.attempts} + ${e.attempts}`,
            failures: sql`${progress.failures} + ${e.failures}`,
            // 端末の日時とサーバーの日時の新しいほう。最初のクリアは古いほうを残す
            lastAttemptAt: sql`max(${progress.lastAttemptAt}, ${lastAttemptAt.getTime()})`,
            ...(clearedAt
              ? {
                  clearedAt: sql`min(coalesce(${progress.clearedAt}, ${clearedAt.getTime()}), ${clearedAt.getTime()})`,
                }
              : {}),
          },
        });
    });
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);

    await db
      .insert(activityDays)
      .values({ userId, dateJst: jstDate(now) })
      .onConflictDoNothing();

    const rows = await db.select().from(progress).where(eq(progress.userId, userId)).limit(500);
    return c.json({ merged: body.data.entries.length, progress: rows.map(toJson) });
  });

/** 端末が送った日時。未来や壊れた値は取り込み時刻にする */
function parseWhen(iso: string | undefined, now: Date): Date {
  if (!iso) return now;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime()) || t.getTime() > now.getTime()) return now;
  return t;
}

function toJson(row: typeof progress.$inferSelect): ProgressDto {
  return {
    problemId: row.problemId,
    attempts: row.attempts,
    failures: row.failures,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    lastAttemptAt: row.lastAttemptAt.toISOString(),
  };
}

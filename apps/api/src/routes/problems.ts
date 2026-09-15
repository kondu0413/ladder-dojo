import {
  type Circuit,
  circuitSchema,
  judge,
  type TestCase,
  testCasesSchema,
} from "@ladder-dojo/core";
import { and, desc, eq, like, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import {
  postedAttempts,
  postedProblems,
  problemDifficultyVotes,
  problemLikes,
  problemReports,
} from "../db/schema.js";
import type { PostedProblemDetailDto, PostedProblemSummaryDto } from "../dto.js";
import type { AppBindings } from "../env.js";
import { byteLength, MAX_CIRCUIT_JSON_BYTES, newId } from "../lib/util.js";
import { optionalUser, requireUser } from "../middleware/auth.js";

/** これだけ通報されたら自動で非表示にする(§3.6: 自動チェック + 通報の事後対応) */
const AUTO_HIDE_REPORTS = 3;
/** 1 投稿あたりのテストケース数の上限(COST.md §1.1: CPU 10 ms/リクエスト) */
const MAX_TEST_CASES = 20;
/** サーバー側の再検証で許すスキャン数(同上) */
const MAX_SCANS_PER_CASE = 3000;
const PAGE_SIZE = 20;

const publishSchema = z.object({
  title: z.string().min(1).max(100),
  spec: z.string().min(1).max(2000),
  circuit: circuitSchema,
  testCases: testCasesSchema.refine((t) => t.length <= MAX_TEST_CASES, {
    message: `テストケースは ${MAX_TEST_CASES} 件までです`,
  }),
  difficulty: z.number().int().min(1).max(5),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  visibility: z.enum(["public", "private"]).default("public"),
});

const listQuerySchema = z.object({
  sort: z.enum(["new", "likes", "difficulty"]).default("new"),
  tag: z.string().max(30).optional(),
  q: z.string().max(100).optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  cursor: z.string().max(64).optional(),
  mine: z.coerce.boolean().optional(),
});

/**
 * 投稿問題(SPEC.md §3.6)。
 *
 * - 投稿時に **サーバー側で** 模範解答がテストケースを全て通ることを再検証する(D-010)。
 *   クライアントの判定結果は信用しない
 * - 模範解答の回路は、投稿者本人かクリア済みの人にしか返さない
 * - 非表示(通報済み)の問題は一覧にも取得にも出さない(D-017 方針 5)
 */
export const problemRoutes = new Hono<AppBindings>()
  .get("/", optionalUser, async (c) => {
    const query = listQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "invalid_body" } as const, 400);
    const { sort, tag, q, difficulty, cursor, mine } = query.data;
    const me = c.get("user");
    const db = drizzle(c.env.DB);

    if (mine && !me) return c.json({ error: "unauthorized" } as const, 401);

    const conditions = [eq(postedProblems.hidden, false)];
    if (mine && me) {
      conditions.push(eq(postedProblems.authorId, me.id));
    } else {
      conditions.push(eq(postedProblems.visibility, "public"));
    }
    if (difficulty !== undefined) conditions.push(eq(postedProblems.difficulty, difficulty));
    if (tag) conditions.push(like(postedProblems.tagsJson, `%"${tag}"%`));
    if (q) {
      const pattern = `%${q}%`;
      const match = or(like(postedProblems.title, pattern), like(postedProblems.spec, pattern));
      if (match) conditions.push(match);
    }
    // 新着順のときだけ、created_at を使ったカーソルで続きを読む
    if (cursor && sort === "new") {
      const ms = Number(cursor);
      if (Number.isFinite(ms)) conditions.push(lt(postedProblems.createdAt, new Date(ms)));
    }

    const order =
      sort === "likes"
        ? [desc(postedProblems.likesCount), desc(postedProblems.createdAt)]
        : sort === "difficulty"
          ? [desc(postedProblems.difficulty), desc(postedProblems.createdAt)]
          : [desc(postedProblems.createdAt)];

    const rows = await db
      .select()
      .from(postedProblems)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(PAGE_SIZE);

    const last = rows[rows.length - 1];
    return c.json({
      problems: rows.map(toSummary),
      nextCursor:
        sort === "new" && rows.length === PAGE_SIZE && last
          ? String(last.createdAt.getTime())
          : null,
    });
  })
  .get("/:id", optionalUser, async (c) => {
    const db = drizzle(c.env.DB);
    const me = c.get("user");
    const row = await db
      .select()
      .from(postedProblems)
      .where(and(eq(postedProblems.id, c.req.param("id")), eq(postedProblems.hidden, false)))
      .get();
    if (!row) return c.json({ error: "not_found" } as const, 404);
    // private は本人だけ(D-017 方針 5)
    if (row.visibility === "private" && row.authorId !== me?.id) {
      return c.json({ error: "not_found" } as const, 404);
    }

    let cleared = false;
    let liked = false;
    let myDifficulty: number | null = null;
    if (me) {
      const attempt = await db
        .select()
        .from(postedAttempts)
        .where(and(eq(postedAttempts.problemId, row.id), eq(postedAttempts.userId, me.id)))
        .get();
      cleared = Boolean(attempt?.clearedAt);
      const like = await db
        .select()
        .from(problemLikes)
        .where(and(eq(problemLikes.problemId, row.id), eq(problemLikes.userId, me.id)))
        .get();
      liked = Boolean(like);
      const vote = await db
        .select()
        .from(problemDifficultyVotes)
        .where(
          and(
            eq(problemDifficultyVotes.problemId, row.id),
            eq(problemDifficultyVotes.userId, me.id),
          ),
        )
        .get();
      myDifficulty = vote?.difficulty ?? null;
    }

    // 模範解答は本人かクリア済みの人にだけ返す(先に答えを見せない)
    const canSeeSolution = row.authorId === me?.id || cleared;
    const detail: PostedProblemDetailDto = {
      ...toSummary(row),
      testCases: JSON.parse(row.testCasesJson) as unknown,
      solution: canSeeSolution ? (JSON.parse(row.circuitJson) as unknown) : null,
      isAuthor: row.authorId === me?.id,
      cleared,
      liked,
      myDifficulty,
    };
    return c.json({ problem: detail });
  })
  .post("/", requireUser, async (c) => {
    const body = publishSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const circuitJson = JSON.stringify(body.data.circuit);
    const testCasesJson = JSON.stringify(body.data.testCases);
    if (byteLength(circuitJson) + byteLength(testCasesJson) > MAX_CIRCUIT_JSON_BYTES) {
      return c.json({ error: "too_large" } as const, 413);
    }

    // §3.6 必須: 模範解答が自分のテストケースをすべて通ることをサーバー側で確かめる
    const verdict = verifySolution(body.data.circuit, body.data.testCases);
    if (!verdict.ok) {
      return c.json({ error: "solution_failed" as const, failures: verdict.failures }, 422);
    }

    const db = drizzle(c.env.DB);
    const now = new Date();
    const row = await db
      .insert(postedProblems)
      .values({
        id: newId(),
        authorId: c.var.user.id,
        title: body.data.title,
        spec: body.data.spec,
        circuitJson,
        testCasesJson,
        difficulty: body.data.difficulty,
        tagsJson: JSON.stringify(body.data.tags),
        visibility: body.data.visibility,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json({ problem: toSummary(row) }, 201);
  })
  .delete("/:id", requireUser, async (c) => {
    const db = drizzle(c.env.DB);
    const row = await db
      .delete(postedProblems)
      .where(
        and(eq(postedProblems.id, c.req.param("id")), eq(postedProblems.authorId, c.var.user.id)),
      )
      .returning()
      .get();
    if (!row) return c.json({ error: "not_found" } as const, 404);
    return c.json({ deleted: true as const });
  })
  /** 挑戦を記録する。クリア率(挑戦者数・クリア者数)はユーザー単位で数える */
  .post("/:id/attempts", requireUser, async (c) => {
    const body = z.object({ passed: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const problemId = c.req.param("id");
    const userId = c.var.user.id;
    const problem = await visibleProblem(db, problemId, userId);
    if (!problem) return c.json({ error: "not_found" } as const, 404);

    const now = new Date();
    const before = await db
      .select()
      .from(postedAttempts)
      .where(and(eq(postedAttempts.problemId, problemId), eq(postedAttempts.userId, userId)))
      .get();

    const firstAttempt = !before;
    const firstClear = body.data.passed && !before?.clearedAt;

    await db
      .insert(postedAttempts)
      .values({
        problemId,
        userId,
        attempts: 1,
        failures: body.data.passed ? 0 : 1,
        clearedAt: body.data.passed ? now : null,
        lastAttemptAt: now,
      })
      .onConflictDoUpdate({
        target: [postedAttempts.problemId, postedAttempts.userId],
        set: {
          attempts: sql`${postedAttempts.attempts} + 1`,
          lastAttemptAt: now,
          ...(body.data.passed
            ? { clearedAt: sql`coalesce(${postedAttempts.clearedAt}, ${now.getTime()})` }
            : { failures: sql`${postedAttempts.failures} + 1` }),
        },
      });

    if (firstAttempt || firstClear) {
      await db
        .update(postedProblems)
        .set({
          ...(firstAttempt ? { attemptsCount: sql`${postedProblems.attemptsCount} + 1` } : {}),
          ...(firstClear ? { clearsCount: sql`${postedProblems.clearsCount} + 1` } : {}),
        })
        .where(eq(postedProblems.id, problemId));
    }

    const updated = await db
      .select()
      .from(postedProblems)
      .where(eq(postedProblems.id, problemId))
      .get();
    return c.json({ problem: updated ? toSummary(updated) : toSummary(problem) });
  })
  .post("/:id/like", requireUser, async (c) => {
    const db = drizzle(c.env.DB);
    const problemId = c.req.param("id");
    const userId = c.var.user.id;
    if (!(await visibleProblem(db, problemId, userId))) {
      return c.json({ error: "not_found" } as const, 404);
    }
    const inserted = await db
      .insert(problemLikes)
      .values({ problemId, userId, createdAt: new Date() })
      .onConflictDoNothing()
      .returning()
      .get();
    if (inserted) {
      await db
        .update(postedProblems)
        .set({ likesCount: sql`${postedProblems.likesCount} + 1` })
        .where(eq(postedProblems.id, problemId));
    }
    return c.json({ liked: true as const });
  })
  .delete("/:id/like", requireUser, async (c) => {
    const db = drizzle(c.env.DB);
    const problemId = c.req.param("id");
    const removed = await db
      .delete(problemLikes)
      .where(and(eq(problemLikes.problemId, problemId), eq(problemLikes.userId, c.var.user.id)))
      .returning()
      .get();
    if (removed) {
      await db
        .update(postedProblems)
        .set({ likesCount: sql`max(${postedProblems.likesCount} - 1, 0)` })
        .where(eq(postedProblems.id, problemId));
    }
    return c.json({ liked: false as const });
  })
  /** 難易度投票(1〜5)。1 ユーザー 1 票で、投票し直せる */
  .put("/:id/difficulty", requireUser, async (c) => {
    const body = z
      .object({ difficulty: z.number().int().min(1).max(5) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const problemId = c.req.param("id");
    const userId = c.var.user.id;
    if (!(await visibleProblem(db, problemId, userId))) {
      return c.json({ error: "not_found" } as const, 404);
    }

    const before = await db
      .select()
      .from(problemDifficultyVotes)
      .where(
        and(
          eq(problemDifficultyVotes.problemId, problemId),
          eq(problemDifficultyVotes.userId, userId),
        ),
      )
      .get();

    const now = new Date();
    await db
      .insert(problemDifficultyVotes)
      .values({ problemId, userId, difficulty: body.data.difficulty, updatedAt: now })
      .onConflictDoUpdate({
        target: [problemDifficultyVotes.problemId, problemDifficultyVotes.userId],
        set: { difficulty: body.data.difficulty, updatedAt: now },
      });

    const delta = body.data.difficulty - (before?.difficulty ?? 0);
    await db
      .update(postedProblems)
      .set({
        difficultyVotesSum: sql`${postedProblems.difficultyVotesSum} + ${delta}`,
        ...(before
          ? {}
          : { difficultyVotesCount: sql`${postedProblems.difficultyVotesCount} + 1` }),
      })
      .where(eq(postedProblems.id, problemId));

    const updated = await db
      .select()
      .from(postedProblems)
      .where(eq(postedProblems.id, problemId))
      .get();
    return c.json({ problem: updated ? toSummary(updated) : null });
  })
  /** 通報。一定数を超えたら自動で非表示にする */
  .post("/:id/report", requireUser, async (c) => {
    const body = z
      .object({ reason: z.string().min(1).max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const problemId = c.req.param("id");
    const userId = c.var.user.id;
    const problem = await visibleProblem(db, problemId, userId);
    if (!problem) return c.json({ error: "not_found" } as const, 404);

    const inserted = await db
      .insert(problemReports)
      .values({ problemId, userId, reason: body.data.reason, createdAt: new Date() })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!inserted) return c.json({ reported: true as const, hidden: problem.hidden });

    const count = problem.reportsCount + 1;
    const hidden = count >= AUTO_HIDE_REPORTS;
    await db
      .update(postedProblems)
      .set({ reportsCount: count, hidden })
      .where(eq(postedProblems.id, problemId));
    return c.json({ reported: true as const, hidden });
  });

// ---------------------------------------------------------------------------

type Db = ReturnType<typeof drizzle>;

/** 非表示でなく、閲覧できる問題を返す(private は本人のみ) */
async function visibleProblem(db: Db, id: string, userId: string) {
  const row = await db
    .select()
    .from(postedProblems)
    .where(and(eq(postedProblems.id, id), eq(postedProblems.hidden, false)))
    .get();
  if (!row) return undefined;
  if (row.visibility === "private" && row.authorId !== userId) return undefined;
  return row;
}

export type VerifyFailure = {
  caseId: string;
  title: string;
  /** mismatch = 期待と違う / unstable = 発振して収束しない / limit = 重すぎて打ち切った */
  kind: "mismatch" | "unstable" | "limit";
};

/**
 * 模範解答が自分のテストケースを全て通るか、サーバー側で確かめる(§3.6 必須)。
 * クライアントの申告は一切信用しない。CPU 10 ms/リクエストの枠に収めるため、
 * 1 ケースあたりのスキャン数に上限を置く(COST.md §1.1)。
 */
export function verifySolution(
  circuit: Circuit,
  testCases: TestCase[],
): { ok: true } | { ok: false; failures: VerifyFailure[] } {
  const result = judge(circuit, testCases, { maxScansPerCase: MAX_SCANS_PER_CASE });
  if (result.passed) return { ok: true };
  return {
    ok: false,
    failures: result.cases
      .filter((x) => !x.passed)
      .map((x) => ({
        caseId: x.caseId,
        title: x.title,
        kind: x.failure?.kind ?? "mismatch",
      })),
  };
}

function toSummary(row: typeof postedProblems.$inferSelect): PostedProblemSummaryDto {
  const votes = row.difficultyVotesCount;
  return {
    id: row.id,
    title: row.title,
    spec: row.spec,
    difficulty: row.difficulty,
    votedDifficulty: votes > 0 ? Math.round((row.difficultyVotesSum / votes) * 10) / 10 : null,
    difficultyVotes: votes,
    tags: JSON.parse(row.tagsJson) as string[],
    visibility: row.visibility,
    likes: row.likesCount,
    attempts: row.attemptsCount,
    clears: row.clearsCount,
    clearRate:
      row.attemptsCount > 0 ? Math.round((row.clearsCount / row.attemptsCount) * 100) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

import {
  type Circuit,
  circuitSchema,
  judge,
  PUBLISH_LIMITS,
  type TestCase,
  testCasesSchema,
} from "@ladder-dojo/core";
import { and, desc, eq, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import {
  orgMembers,
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
/**
 * 投稿時の再検証の上限。**core の PUBLISH_LIMITS をそのまま使う**(S-030)。
 * ブラウザ側の事前チェックと同じ値でないと、手元では通るのに投稿だけ弾かれる
 */
const MAX_TEST_CASES = PUBLISH_LIMITS.maxTestCases;
const PAGE_SIZE = 20;

/**
 * 検索語の最小の長さ(改善候補 12 / S-016)。
 *
 * trigram は 3 文字ずつの並びを索引にするので、これより短い語には当たらない。
 * 日本語では「保持」「接点」「出力」のような 2 文字の語がごく普通に出てくるので、
 * 短い語は索引を使わず、これまでどおり instr() で拾う。
 */
const FTS_MIN_CHARS = 3;

/**
 * 検索語を FTS5 の「この並びをそのまま含む」1 語にする。
 *
 * **必ず引用符で囲む**。囲まないと `AND` `OR` `NOT` `NEAR` や `*` `^` `:` が
 * 検索の文法として解釈され、書いた人の意図と違う結果になったり、
 * 文法エラーで 500 になったりする。中の引用符は 2 つ重ねて打ち消す。
 */
function ftsPhrase(q: string): string {
  return `"${q.replaceAll('"', '""')}"`;
}

/**
 * 題名と説明から探す条件を作る。
 *
 * 3 文字以上なら全文検索の索引を引く(全表走査をしない)。
 * 1〜2 文字は索引に当たらないので、これまでどおり全表走査で拾う。
 * **短い語で「0 件」になるより、遅くても当たるほうがよい**。
 */
function searchCondition(q: string): SQL | undefined {
  const needle = q.trim().toLowerCase();
  if (needle.length === 0) return undefined;
  if ([...needle].length >= FTS_MIN_CHARS) {
    return sql`${postedProblems.id} in (
      select problem_id from posted_problems_fts where posted_problems_fts match ${ftsPhrase(needle)}
    )`;
  }
  return sql`(instr(lower(${postedProblems.title}), ${needle}) > 0 or instr(lower(${postedProblems.spec}), ${needle}) > 0)`;
}

const publishSchema = z.object({
  title: z.string().min(1).max(100),
  spec: z.string().min(1).max(2000),
  circuit: circuitSchema,
  testCases: testCasesSchema.refine((t) => t.length <= MAX_TEST_CASES, {
    message: `テストケースは ${MAX_TEST_CASES} 件までです`,
  }),
  difficulty: z.number().int().min(1).max(5),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  visibility: z.enum(["public", "org", "private"]).default("public"),
  /** visibility = "org" のときに必須。所属組織のみに公開する(§3.8) */
  orgId: z.string().max(64).optional(),
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
      // 全体公開に加えて、自分が所属する組織に限定公開された問題も見せる(§3.8)
      const myOrgs = me ? await listMyOrgIds(db, me.id) : [];
      const publicOnly = eq(postedProblems.visibility, "public");
      if (myOrgs.length === 0) {
        conditions.push(publicOnly);
      } else {
        const orgScoped = and(
          eq(postedProblems.visibility, "org"),
          inArray(postedProblems.orgId, myOrgs),
        );
        // drizzle の and()/or() は引数が空だと undefined を返す型なので、念のため畳む
        conditions.push(orgScoped ? (or(publicOnly, orgScoped) ?? publicOnly) : publicOnly);
      }
    }
    if (difficulty !== undefined) conditions.push(eq(postedProblems.difficulty, difficulty));
    // LIKE は使わない。SQLite の LIKE パターンには長さ上限(既定 50 バイト)があり、
    // 日本語 17 文字ほどの検索語で「LIKE or GLOB pattern too complex」で落ちる。
    // また `%` や `_` を含む検索語をワイルドカードとして解釈してしまう。
    // instr() は上限もワイルドカードも無い単純な部分一致なので、こちらを使う。
    if (tag) conditions.push(sql`instr(${postedProblems.tagsJson}, ${`"${tag}"`}) > 0`);
    if (q) {
      const condition = searchCondition(q);
      if (condition) conditions.push(condition);
    }
    // 続きを読むカーソル。**どの並び順でも効く**(S-033)
    const from = parseCursor(cursor);
    if (from) {
      const keyed = cursorCondition(sort, from);
      if (keyed) conditions.push(keyed);
    }

    const order =
      sort === "likes"
        ? [desc(postedProblems.likesCount), desc(postedProblems.createdAt), desc(postedProblems.id)]
        : sort === "difficulty"
          ? [
              desc(postedProblems.difficulty),
              desc(postedProblems.createdAt),
              desc(postedProblems.id),
            ]
          : [desc(postedProblems.createdAt), desc(postedProblems.id)];

    const rows = await db
      .select()
      .from(postedProblems)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(PAGE_SIZE);

    const last = rows[rows.length - 1];
    return c.json({
      problems: rows.map(toSummary),
      nextCursor: rows.length === PAGE_SIZE && last ? makeCursor(sort, last) : null,
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
    if (!(await canView(db, row, me?.id))) return c.json({ error: "not_found" } as const, 404);

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

    // 組織限定で公開するなら、その組織のメンバーでなければならない(D-017 方針 6)
    if (body.data.visibility === "org") {
      if (!body.data.orgId) return c.json({ error: "invalid_body" } as const, 400);
      const membership = await db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, body.data.orgId), eq(orgMembers.userId, c.var.user.id)))
        .get();
      if (!membership) return c.json({ error: "not_found" } as const, 404);
    }

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
        orgId: body.data.visibility === "org" ? (body.data.orgId ?? null) : null,
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
  return (await canView(db, row, userId)) ? row : undefined;
}

/** 可視性の判定(D-017 方針 5): public は誰でも / org は所属メンバー / private は本人だけ */
async function canView(
  db: Db,
  row: typeof postedProblems.$inferSelect,
  userId: string | undefined,
): Promise<boolean> {
  if (row.authorId === userId) return true;
  if (row.visibility === "public") return true;
  if (row.visibility === "private") return false;
  if (!userId || !row.orgId) return false;
  const membership = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, row.orgId), eq(orgMembers.userId, userId)))
    .get();
  return Boolean(membership);
}

/** 自分が所属する組織の ID(一覧の絞り込みに使う) */
async function listMyOrgIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .limit(50);
  return rows.map((r) => r.orgId);
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
  const result = judge(circuit, testCases, {
    maxScansPerCase: PUBLISH_LIMITS.maxScansPerCase,
    maxScansTotal: PUBLISH_LIMITS.maxScansTotal,
  });
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

/**
 * 続きを読むためのカーソル(S-033)。
 *
 * 以前は新着順にしか付いていなかったので、**いいね順や難易度順では 21 件目から先を
 * 見る手段が無かった**(「もっと読む」が出ない)。並び順のキーと作成時刻と id を
 * 持たせて、どの並びでも続きから読めるようにする。
 * id まで入れるのは、同じミリ秒に作られた 2 件が境目に来ると 1 件飛ぶため
 */
type Cursor = { key: number; createdAt: number; id: string };

function makeCursor(sort: "new" | "likes" | "difficulty", row: typeof postedProblems.$inferSelect) {
  const key = sort === "likes" ? row.likesCount : sort === "difficulty" ? row.difficulty : 0;
  return `${key}.${row.createdAt.getTime()}.${row.id}`;
}

function parseCursor(cursor: string | undefined): Cursor | undefined {
  if (!cursor) return undefined;
  const dot = cursor.indexOf(".");
  const dot2 = cursor.indexOf(".", dot + 1);
  if (dot < 0 || dot2 < 0) return undefined;
  const key = Number(cursor.slice(0, dot));
  const createdAt = Number(cursor.slice(dot + 1, dot2));
  const id = cursor.slice(dot2 + 1);
  if (!Number.isFinite(key) || !Number.isFinite(createdAt) || !id) return undefined;
  return { key, createdAt, id };
}

/** その並び順で「カーソルより後ろ」を表す条件 */
function cursorCondition(sort: "new" | "likes" | "difficulty", from: Cursor): SQL | undefined {
  const createdAt = new Date(from.createdAt);
  const afterCreatedAt = or(
    lt(postedProblems.createdAt, createdAt),
    and(eq(postedProblems.createdAt, createdAt), lt(postedProblems.id, from.id)),
  );
  if (sort === "new") return afterCreatedAt;
  const column = sort === "likes" ? postedProblems.likesCount : postedProblems.difficulty;
  return or(lt(column, from.key), and(eq(column, from.key), afterCreatedAt));
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
    orgId: row.orgId,
    likes: row.likesCount,
    attempts: row.attemptsCount,
    clears: row.clearsCount,
    clearRate:
      row.attemptsCount > 0 ? Math.round((row.clearsCount / row.attemptsCount) * 100) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

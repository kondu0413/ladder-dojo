import { circuitFingerprint, circuitSchema, DIAGNOSIS_IDS } from "@ladder-dojo/core";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { problemMistakes, problemMistakeUsers, submissions } from "../db/schema.js";
import type { SubmissionDto } from "../dto.js";
import type { AppBindings } from "../env.js";
import { byteLength, MAX_CIRCUIT_JSON_BYTES, newId, sha256Hex } from "../lib/util.js";
import { requireUser } from "../middleware/auth.js";

/** S-003: 不正解は問題ごとに直近 20 件まで、正解は全件保持する */
const MAX_FAILED_PER_PROBLEM = 20;

const bodySchema = z.object({
  problemId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  circuit: circuitSchema,
  passed: z.boolean(),
  /**
   * つまずき診断の種類。判定も診断もクライアント側で動く(SPEC.md §6)ので、
   * サーバーは既知の ID かどうかだけ見る(S-011)
   */
  diagnosisId: z.enum(DIAGNOSIS_IDS).optional(),
});

/**
 * 提出回路の履歴(SPEC.md §3.5)。本人のデータのみ(DECISIONS.md D-017 方針 3)。
 * 同じ回路(指紋一致)は重複保存しない(S-003)。
 */
export const submissionRoutes = new Hono<AppBindings>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const problemId = c.req.query("problemId");
    const db = drizzle(c.env.DB);
    const where = problemId
      ? and(eq(submissions.userId, c.var.user.id), eq(submissions.problemId, problemId))
      : eq(submissions.userId, c.var.user.id);
    const rows = await db
      .select()
      .from(submissions)
      .where(where)
      .orderBy(desc(submissions.createdAt))
      .limit(100);
    return c.json({ submissions: rows.map(toJson) });
  })
  .post("/", async (c) => {
    const body = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const circuitJson = JSON.stringify(body.data.circuit);
    if (byteLength(circuitJson) > MAX_CIRCUIT_JSON_BYTES) {
      return c.json({ error: "too_large" } as const, 413);
    }
    const circuitHash = await sha256Hex(circuitFingerprint(body.data.circuit));

    const db = drizzle(c.env.DB);
    const userId = c.var.user.id;
    const { problemId, passed, diagnosisId } = body.data;

    // 同じ回路を出し直した場合は行を増やさない(S-003)
    const existing = await db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.problemId, problemId),
          eq(submissions.circuitHash, circuitHash),
        ),
      )
      .get();
    if (existing) {
      // 同じ回路の出し直しでも、つまずきの人数には数える(初回だけ増える)
      if (!passed && diagnosisId) await countMistake(db, problemId, diagnosisId, userId);
      return c.json({ submission: toJson(existing), deduplicated: true as const });
    }

    const row = await db
      .insert(submissions)
      .values({
        id: newId(),
        userId,
        problemId,
        circuitJson,
        circuitHash,
        passed,
        ...(diagnosisId ? { diagnosisId } : {}),
        createdAt: new Date(),
      })
      .returning()
      .get();

    if (!passed) {
      await pruneFailed(db, userId, problemId);
      if (diagnosisId) await countMistake(db, problemId, diagnosisId, userId);
    }

    return c.json({ submission: toJson(row), deduplicated: false as const }, 201);
  });

type Db = ReturnType<typeof drizzle>;

/**
 * 「みんながつまずくところ」の人数を数える(SPEC.md §3.5)。
 *
 * 同じ人が同じ間違いを何度しても 1 人。先に重複よけの表へ入れてみて、
 * 実際に行が増えたときだけ人数を足す。毎回 submissions を数え直すと
 * 読み取り行数を使いすぎるため(COST.md §1.2、D-018)。
 */
async function countMistake(
  db: Db,
  problemId: string,
  diagnosisId: string,
  userId: string,
): Promise<void> {
  const inserted = await db
    .insert(problemMistakeUsers)
    .values({ problemId, diagnosisId, userId })
    .onConflictDoNothing()
    .run();
  // 既に数えた人なら行が増えないので、そこで終わり
  if ((inserted.meta?.changes ?? 0) === 0) return;

  await db
    .insert(problemMistakes)
    .values({ problemId, diagnosisId, users: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [problemMistakes.problemId, problemMistakes.diagnosisId],
      set: { users: sql`${problemMistakes.users} + 1`, updatedAt: new Date() },
    })
    .run();
}

/** 不正解の履歴を直近 MAX_FAILED_PER_PROBLEM 件に切り詰める(S-003) */
async function pruneFailed(db: Db, userId: string, problemId: string): Promise<void> {
  await db.run(sql`
    delete from ${submissions}
    where ${submissions.userId} = ${userId}
      and ${submissions.problemId} = ${problemId}
      and ${submissions.passed} = 0
      and ${submissions.id} not in (
        select ${submissions.id} from ${submissions}
        where ${submissions.userId} = ${userId}
          and ${submissions.problemId} = ${problemId}
          and ${submissions.passed} = 0
        order by ${submissions.createdAt} desc
        limit ${MAX_FAILED_PER_PROBLEM}
      )
  `);
}

function toJson(row: typeof submissions.$inferSelect): SubmissionDto {
  return {
    id: row.id,
    problemId: row.problemId,
    circuit: JSON.parse(row.circuitJson) as unknown,
    passed: row.passed,
    createdAt: row.createdAt.toISOString(),
  };
}

import { circuitFingerprint, circuitSchema } from "@ladder-dojo/core";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { submissions } from "../db/schema.js";
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
    const { problemId, passed } = body.data;

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
    if (existing) return c.json({ submission: toJson(existing), deduplicated: true as const });

    const row = await db
      .insert(submissions)
      .values({
        id: newId(),
        userId,
        problemId,
        circuitJson,
        circuitHash,
        passed,
        createdAt: new Date(),
      })
      .returning()
      .get();

    if (!passed) await pruneFailed(db, userId, problemId);

    return c.json({ submission: toJson(row), deduplicated: false as const }, 201);
  });

type Db = ReturnType<typeof drizzle>;

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

function toJson(row: typeof submissions.$inferSelect) {
  return {
    id: row.id,
    problemId: row.problemId,
    circuit: JSON.parse(row.circuitJson) as unknown,
    passed: row.passed,
    createdAt: row.createdAt.toISOString(),
  };
}

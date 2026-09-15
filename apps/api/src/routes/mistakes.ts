import { and, desc, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { problemMistakes } from "../db/schema.js";
import type { MistakeListDto } from "../dto.js";
import type { AppBindings } from "../env.js";

/**
 * 「みんながつまずくところ」(SPEC.md §3.5「提出回路の履歴は、後のつまずき分析に使う」)。
 *
 * 集計はログイン不要で見られる。個人は一切出さず、人数だけを返す。
 */

/**
 * この人数に達するまで出さない。
 *
 * 1 人や 2 人の結果を「みんながつまずくところ」として見せるのは、
 * 名前が嘘になるうえ、たまたま 1 人がした間違いを「よくある間違い」だと
 * 思い込ませてしまう。誰がしたかを推測しにくくする意味もある。
 */
export const MIN_USERS_TO_SHOW = 3;

/** 1 問につき出す種類の数。多いと答えを絞り込めてしまう */
const MAX_KINDS = 3;

export const mistakeRoutes = new Hono<AppBindings>().get("/:problemId", async (c) => {
  const problemId = c.req.param("problemId");
  if (!/^[a-z0-9-]{1,64}$/.test(problemId)) {
    return c.json({ error: "invalid_problem_id" } as const, 400);
  }
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      diagnosisId: problemMistakes.diagnosisId,
      users: problemMistakes.users,
    })
    .from(problemMistakes)
    .where(
      and(eq(problemMistakes.problemId, problemId), gte(problemMistakes.users, MIN_USERS_TO_SHOW)),
    )
    .orderBy(desc(problemMistakes.users))
    .limit(MAX_KINDS);

  const dto: MistakeListDto = { problemId, minUsers: MIN_USERS_TO_SHOW, mistakes: rows };
  return c.json(dto);
});

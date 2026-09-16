import { and, eq, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { submissions } from "./db/schema.js";
import type { Env } from "./env.js";

/**
 * 古い提出履歴の掃除(SPEC.md §3.5 / 改善候補 13 / S-017)。
 *
 * 提出のたびに S-003 の上限(不正解は問題ごと・ユーザーごとに直近 20 件)は
 * 効いている。つまり 1 人あたりの件数は既に頭打ちで、**残り続けるのは
 * 「利用者数 × 問題数」の方向**。人が増えるほど、誰も見ない古い不正解が溜まる。
 *
 * ここでは日数で切る。消すのは **90 日より前の不正解だけ**。
 * 正解は消さない(「いつ解けたか」は本人の記録として意味がある)。
 */

/** これより前の不正解を消す */
export const KEEP_FAILED_DAYS = 90;

/**
 * 1 回の実行で消す上限。
 *
 * 溜まったぶんを一度に消すと、D1 の書き込み(10万 行/日、COST.md §1.2)を
 * 掃除だけで使い切りかねない。1 日 1 回動くので、残りは翌日以降に回る。
 */
export const MAX_DELETE_PER_RUN = 2_000;

export type CleanupResult = { deleted: number; hitLimit: boolean };

/**
 * 90 日より前の不正解を消す。消した件数を返す。
 *
 * 上限に当たったかどうかも返す。当たり続けるなら、溜まる速さに
 * 掃除が追いついていないということなので、COST.md の見直しが要る。
 */
export async function pruneOldSubmissions(
  env: Env,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const db = drizzle(env.DB);
  const cutoff = new Date(now.getTime() - KEEP_FAILED_DAYS * 24 * 60 * 60 * 1000);

  // 上限を効かせるため、消す行を先に選ぶ。
  // SQLite の DELETE には LIMIT が無い(既定のビルドでは無効)ので、
  // 主キーで絞る形にする
  const result = await db.run(sql`
    delete from ${submissions}
    where ${submissions.id} in (
      select ${submissions.id} from ${submissions}
      where ${submissions.passed} = 0
        and ${submissions.createdAt} < ${cutoff.getTime()}
      order by ${submissions.createdAt} asc
      limit ${MAX_DELETE_PER_RUN}
    )
  `);

  const deleted = result.meta.changes ?? 0;
  return { deleted, hitLimit: deleted >= MAX_DELETE_PER_RUN };
}

/** 掃除の対象がどれだけ残っているか(テストと様子見用) */
export async function countPrunable(env: Env, now: Date = new Date()): Promise<number> {
  const db = drizzle(env.DB);
  const cutoff = new Date(now.getTime() - KEEP_FAILED_DAYS * 24 * 60 * 60 * 1000);
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(submissions)
    .where(and(eq(submissions.passed, false), lt(submissions.createdAt, cutoff)))
    .get();
  return row?.n ?? 0;
}

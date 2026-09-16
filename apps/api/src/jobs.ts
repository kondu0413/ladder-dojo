/**
 * 1 日 1 回の仕事をまとめて動かす(改善候補 13 / S-017)。
 *
 * **1 つが落ちても、残りは動かす**。順番に await で繋ぐと、先の仕事が
 * 失敗した日は後ろが丸ごと止まる。止まったことを誰も見ないので、
 * 気づかないうちに古い履歴が溜まっていく、という壊れ方をする。
 *
 * 「止めない」をここで形にしておけば、仕事が増えても書き方を間違えない。
 */

export type DailyJob = {
  /** ログに出す名前。失敗したときだけ使う */
  name: string;
  run: () => Promise<unknown>;
};

/** 全部動かす。失敗したものだけログに残す(COST.md: Workers Logs はエラー時のみ) */
export async function runDailyJobs(jobs: readonly DailyJob[]): Promise<void> {
  const results = await Promise.allSettled(jobs.map((job) => job.run()));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`daily job "${jobs[i]?.name}" failed`, result.reason);
    }
  });
}

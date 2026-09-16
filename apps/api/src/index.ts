import { app } from "./app.js";
import { pruneOldSubmissions } from "./cleanup.js";
import type { Env } from "./env.js";
import { runDailyJobs } from "./jobs.js";
import { computeGlobalRankings } from "./ranking.js";

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  /**
   * Cron Triggers(DECISIONS.md D-010)。1 日 1 回動く。
   *
   * 1. 全体ランキングを計算して保存する。全ユーザーの集計はリクエストのたびに
   *    やると D1 の読み取り行数を使いすぎるため
   * 2. 古い提出履歴を掃除する(改善候補 13 / S-017)
   */
  scheduled: (_event, env, ctx) => {
    // 成功時はログを出さない(COST.md: Workers Logs はエラー時のみ)。
    // 実行結果は Cloudflare のダッシュボードの Cron Triggers で確認できる。
    //
    // 1 つが落ちても残りは動かす。詳しくは jobs.ts
    ctx.waitUntil(
      runDailyJobs([
        { name: "rankings", run: () => computeGlobalRankings(env) },
        {
          name: "submission-cleanup",
          run: async () => {
            const { hitLimit, deleted } = await pruneOldSubmissions(env);
            // 上限に当たり続けるなら、溜まる速さに掃除が追いついていない。
            // COST.md の見直しが要るので、ここだけは残す
            if (hitLimit) console.warn(`submission cleanup hit its per-run limit (${deleted})`);
          },
        },
      ]),
    );
  },
} satisfies ExportedHandler<Env>;

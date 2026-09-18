import { app } from "./app.js";
import { pruneOldSubmissions } from "./cleanup.js";
import type { Env } from "./env.js";
import { runDailyJobs } from "./jobs.js";
import { REMINDER_CRON, sendDueReminders } from "./push/reminders.js";
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
  scheduled: (event, env, ctx) => {
    // 朝の Cron は課題の通知だけ(S-045)。集計と同じ実行に混ぜると、
    // サブリクエストの上限(COST.md §1.1)を通知と集計で取り合うことになる
    if (event.cron === REMINDER_CRON) {
      ctx.waitUntil(
        runDailyJobs([{ name: "assignment-reminders", run: () => sendDueReminders(env) }]),
      );
      return;
    }
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

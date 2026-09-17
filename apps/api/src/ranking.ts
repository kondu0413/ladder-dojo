import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { rankingSnapshots } from "./db/schema.js";
import type { Env } from "./env.js";
import { jstDate } from "./lib/util.js";

/**
 * ランキング(SPEC.md §3.7)。
 *
 * 速さは競わせない。指標は貢献・継続系だけ:
 * - solved: 解いた問題数(公式 + 投稿)
 * - authored_solved: 自分が作った問題が解かれた回数
 * - authored_likes: 自分が作った問題に付いたいいね数
 * - streak: 連続学習日数(JST、S-001)
 *
 * 全ユーザーを毎回集計すると D1 の読み取り行数を大量に使うので、Cron Triggers で
 * 1 日 1 回計算して `ranking_snapshots` に書き出す(DECISIONS.md D-010)。
 * 組織内ランキングは対象が少ないので、その場で計算する。
 */

export const PERIODS = ["weekly", "monthly", "all"] as const;
export type Period = (typeof PERIODS)[number];

export const METRICS = ["solved", "authored_solved", "authored_likes", "streak"] as const;
export type Metric = (typeof METRICS)[number];

export const TOP_N = 50;
/** 連続学習日数を数えるためにさかのぼる日数 */
const STREAK_WINDOW_DAYS = 90;

export type RankingRow = { rank: number; userId: string; userName: string; value: number };

type Db = ReturnType<typeof drizzle>;

function periodStartMs(period: Period, now: Date): number {
  if (period === "all") return 0;
  const days = period === "weekly" ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

/** 指標ごとの集計。`memberIds` を渡すと、その人たちだけを対象にする(組織内ランキング) */
async function aggregate(
  db: Db,
  metric: Metric,
  period: Period,
  now: Date,
  memberIds?: string[],
): Promise<RankingRow[]> {
  if (memberIds?.length === 0) return [];
  const since = periodStartMs(period, now);
  const limit = TOP_N;
  const memberFilter = memberIds
    ? sql` and user_id in (${sql.join(
        memberIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;

  if (metric === "streak") {
    return streakRanking(db, now, memberIds);
  }

  const query =
    metric === "solved"
      ? sql`
          select u.id as user_id, u.name as user_name, sum(t.c) as value
          from (
            select user_id, count(*) as c from progress
            where cleared_at is not null and cleared_at >= ${since}${memberFilter}
            group by user_id
            union all
            -- 非表示(通報済み)になった投稿のクリアは数えない。
            -- 作った側の指標(authored_*)は hidden を外しているので、解いた側だけ
            -- 残るのは辻褄が合わない(S-031)
            select a.user_id, count(*) as c from posted_attempts a
            join posted_problems p on p.id = a.problem_id and p.hidden = 0
            where a.cleared_at is not null and a.cleared_at >= ${since}${
              memberIds
                ? sql` and a.user_id in (${sql.join(
                    memberIds.map((id) => sql`${id}`),
                    sql`, `,
                  )})`
                : sql``
            }
            group by a.user_id
          ) t
          join user u on u.id = t.user_id
          group by u.id, u.name
          having value > 0
          order by value desc, u.name asc
          limit ${limit}
        `
      : metric === "authored_solved"
        ? sql`
            select u.id as user_id, u.name as user_name, count(*) as value
            from posted_attempts a
            join posted_problems p on p.id = a.problem_id
            join user u on u.id = p.author_id
            where a.cleared_at is not null and a.cleared_at >= ${since}
              and p.hidden = 0${
                memberIds
                  ? sql` and u.id in (${sql.join(
                      memberIds.map((id) => sql`${id}`),
                      sql`, `,
                    )})`
                  : sql``
              }
            group by u.id, u.name
            order by value desc, u.name asc
            limit ${limit}
          `
        : sql`
            select u.id as user_id, u.name as user_name, count(*) as value
            from problem_likes l
            join posted_problems p on p.id = l.problem_id
            join user u on u.id = p.author_id
            where l.created_at >= ${since} and p.hidden = 0${
              memberIds
                ? sql` and u.id in (${sql.join(
                    memberIds.map((id) => sql`${id}`),
                    sql`, `,
                  )})`
                : sql``
            }
            group by u.id, u.name
            order by value desc, u.name asc
            limit ${limit}
          `;

  const rows = await db.all<{ user_id: string; user_name: string; value: number }>(query);
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    userName: r.user_name,
    value: Number(r.value),
  }));
}

/** 連続学習日数(JST、S-001)。日付の並びを JS 側で数える */
async function streakRanking(db: Db, now: Date, memberIds?: string[]): Promise<RankingRow[]> {
  const since = jstDate(new Date(now.getTime() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const filter = memberIds
    ? sql` and a.user_id in (${sql.join(
        memberIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const rows = await db.all<{ user_id: string; user_name: string; date_jst: string }>(sql`
    select a.user_id, u.name as user_name, a.date_jst
    from activity_days a
    join user u on u.id = a.user_id
    where a.date_jst >= ${since}${filter}
    order by a.user_id asc, a.date_jst desc
    limit 20000
  `);

  const today = jstDate(now);
  const yesterday = jstDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const byUser = new Map<string, { name: string; dates: string[] }>();
  for (const row of rows) {
    const cur = byUser.get(row.user_id) ?? { name: row.user_name, dates: [] };
    cur.dates.push(row.date_jst);
    byUser.set(row.user_id, cur);
  }

  const result: RankingRow[] = [];
  for (const [userId, { name, dates }] of byUser) {
    // 今日か昨日に活動していなければ連続は途切れている
    const newest = dates[0];
    if (!newest || (newest !== today && newest !== yesterday)) continue;
    let streak = 1;
    let expected = shiftDate(newest, -1);
    for (const date of dates.slice(1)) {
      if (date === expected) {
        streak += 1;
        expected = shiftDate(date, -1);
      } else if (date < expected) {
        break;
      }
    }
    result.push({ rank: 0, userId, userName: name, value: streak });
  }
  return result
    .sort((a, b) => b.value - a.value || a.userName.localeCompare(b.userName))
    .slice(0, TOP_N)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** `YYYY-MM-DD` を days 日ずらす */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 全体ランキングを計算して保存する(Cron から呼ぶ) */
export async function computeGlobalRankings(env: Env, now = new Date()): Promise<number> {
  const db = drizzle(env.DB);
  let written = 0;
  for (const metric of METRICS) {
    // 連続学習日数は「いまの連続」なので期間で切らない
    const periods: Period[] = metric === "streak" ? ["all"] : [...PERIODS];
    for (const period of periods) {
      const rows = await aggregate(db, metric, period, now);
      await db
        .delete(rankingSnapshots)
        .where(
          and(
            eq(rankingSnapshots.period, period),
            eq(rankingSnapshots.metric, metric),
            isNull(rankingSnapshots.orgId),
          ),
        );
      if (rows.length === 0) continue;
      const values = rows.map((r) => ({
        period,
        metric,
        orgId: null,
        rank: r.rank,
        userId: r.userId,
        userName: r.userName,
        value: r.value,
        computedAt: now,
      }));
      await db.insert(rankingSnapshots).values(values);
      written += values.length;
    }
  }
  return written;
}

export type RankingResult = {
  entries: RankingRow[];
  /** この順位を計算した時刻。Cron は 1 日 1 回なので、最新の活動は次回に反映される */
  computedAt: string;
};

/** 保存済みの全体ランキングを読む。空なら計算して保存する(初回) */
export async function readGlobalRanking(
  env: Env,
  metric: Metric,
  period: Period,
  now = new Date(),
): Promise<RankingResult> {
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(rankingSnapshots)
    .where(
      and(
        eq(rankingSnapshots.period, period),
        eq(rankingSnapshots.metric, metric),
        isNull(rankingSnapshots.orgId),
      ),
    )
    .orderBy(rankingSnapshots.rank)
    .limit(TOP_N);
  const first = rows[0];
  if (first) {
    return {
      entries: rows.map((r) => ({
        rank: r.rank,
        userId: r.userId,
        userName: r.userName,
        value: r.value,
      })),
      computedAt: first.computedAt.toISOString(),
    };
  }
  // まだ Cron が回っていない(または該当なし)。その場で計算して次回に備える
  const fresh = await aggregate(db, metric, period, now);
  if (fresh.length > 0) {
    await db.insert(rankingSnapshots).values(
      fresh.map((r) => ({
        period,
        metric,
        orgId: null,
        rank: r.rank,
        userId: r.userId,
        userName: r.userName,
        value: r.value,
        computedAt: now,
      })),
    );
  }
  return { entries: fresh, computedAt: now.toISOString() };
}

/** 組織内ランキング。対象が少ないのでその場で計算する */
/**
 * **自分 1 人ぶんの、いまの値**を計算する(S-026)。
 *
 * 全体ランキングは Cron で 1 日 1 回しか更新しない(D-010)。そのため、問題を
 * クリアした直後に見ると**自分が一覧に載っていない**。記録されていないように
 * 見えるので、「あなたのいま」は別に出す。
 *
 * 対象が 1 人なので読み取り行数は自分のぶんだけ。全体集計とは費用がまるで違う。
 */
export async function computeUserValue(
  env: Env,
  userId: string,
  metric: Metric,
  period: Period,
  now = new Date(),
): Promise<number> {
  const rows = await aggregate(drizzle(env.DB), metric, period, now, [userId]);
  return rows.find((r) => r.userId === userId)?.value ?? 0;
}

export async function computeOrgRanking(
  env: Env,
  memberIds: string[],
  metric: Metric,
  period: Period,
  now = new Date(),
): Promise<RankingRow[]> {
  return aggregate(drizzle(env.DB), metric, period, now, memberIds);
}

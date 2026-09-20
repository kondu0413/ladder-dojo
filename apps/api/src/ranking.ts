import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
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

/**
 * 集計の範囲。`orgId` はその組織のメンバーだけ(組織内ランキング)、`userId` は 1 人だけ
 * (「あなたのいま」、S-026)。どちらも無ければ全員
 */
type Scope = { orgId?: string; userId?: string };

/**
 * ユーザー id の列 `column` を範囲で絞る where 句の断片。
 *
 * **メンバーの id は SQL に並べない**(S-054)。D1 は 1 クエリの束縛パラメータが 100 まで
 * (COST.md §1.2)で、id を並べると 49 人の組織で 500 になっていた。副問い合わせで絞る
 */
function scopeSql(column: SQL, scope: Scope | undefined): SQL {
  if (scope?.orgId) {
    return sql` and ${column} in (select user_id from org_members where org_id = ${scope.orgId})`;
  }
  if (scope?.userId) return sql` and ${column} = ${scope.userId}`;
  return sql``;
}

/** 指標ごとの集計 */
async function aggregate(
  db: Db,
  metric: Metric,
  period: Period,
  now: Date,
  scope?: Scope,
): Promise<RankingRow[]> {
  const since = periodStartMs(period, now);
  const limit = TOP_N;
  const memberFilter = scopeSql(sql`user_id`, scope);
  const memberFilterOf = (column: SQL) => scopeSql(column, scope);

  if (metric === "streak") {
    return streakRanking(db, now, scope);
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
            where a.cleared_at is not null and a.cleared_at >= ${since}${memberFilterOf(sql`a.user_id`)}
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
              and p.hidden = 0${memberFilterOf(sql`u.id`)}
            group by u.id, u.name
            order by value desc, u.name asc
            limit ${limit}
          `
        : sql`
            select u.id as user_id, u.name as user_name, count(*) as value
            from problem_likes l
            join posted_problems p on p.id = l.problem_id
            join user u on u.id = p.author_id
            where l.created_at >= ${since} and p.hidden = 0${memberFilterOf(sql`u.id`)}
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
async function streakRanking(db: Db, now: Date, scope?: Scope): Promise<RankingRow[]> {
  const since = jstDate(new Date(now.getTime() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const today = jstDate(now);
  const yesterday = jstDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const filter = scopeSql(sql`a.user_id`, scope);
  // 「いまの連続」は今日か昨日に活動があった人にしか無い。先にその人たちに絞り、
  // 20000 行の上限で活動の多い人が切れないようにする(S-054)
  const rows = await db.all<{ user_id: string; user_name: string; date_jst: string }>(sql`
    select a.user_id, u.name as user_name, a.date_jst
    from activity_days a
    join user u on u.id = a.user_id
    where a.date_jst >= ${since}${filter}
      and a.user_id in (select user_id from activity_days where date_jst in (${today}, ${yesterday}))
    order by a.user_id asc, a.date_jst desc
    limit 20000
  `);
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
      await writeGlobalSnapshot(db, metric, period, rows, now);
      written += rows.length;
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
  if (fresh.length > 0) await writeGlobalSnapshot(db, metric, period, fresh, now);
  return { entries: fresh, computedAt: now.toISOString() };
}

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
  const rows = await aggregate(drizzle(env.DB), metric, period, now, { userId });
  return rows.find((r) => r.userId === userId)?.value ?? 0;
}

/** 組織内ランキング。対象が少ないのでその場で計算する */
export async function computeOrgRanking(
  env: Env,
  orgId: string,
  metric: Metric,
  period: Period,
  now = new Date(),
): Promise<RankingRow[]> {
  return aggregate(drizzle(env.DB), metric, period, now, { orgId });
}

/** 1 回の insert に入れる行数。1 行 8 パラメータ × 12 = 96 で D1 の上限 100 に収める(S-054) */
const SNAPSHOT_INSERT_ROWS = 12;

/**
 * 全体スナップショットを書き直す。**消す・入れるを 1 つの batch(トランザクション)にする**。
 * 以前は 1 回の insert に 50 行(400 パラメータ)を入れていて 13 人以上で失敗し、
 * 消したあとの空のスナップショットが残って、読むたびに計算し直しては失敗していた。
 * 別々の文で消して入れていたので、同時に 2 つ走ると同じ順位が 2 行入ることもあった
 */
async function writeGlobalSnapshot(
  db: Db,
  metric: Metric,
  period: Period,
  rows: RankingRow[],
  now: Date,
): Promise<void> {
  const del = db
    .delete(rankingSnapshots)
    .where(
      and(
        eq(rankingSnapshots.period, period),
        eq(rankingSnapshots.metric, metric),
        isNull(rankingSnapshots.orgId),
      ),
    );
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
  const inserts = [];
  for (let i = 0; i < values.length; i += SNAPSHOT_INSERT_ROWS) {
    inserts.push(db.insert(rankingSnapshots).values(values.slice(i, i + SNAPSHOT_INSERT_ROWS)));
  }
  await db.batch([del, ...inserts]);
}

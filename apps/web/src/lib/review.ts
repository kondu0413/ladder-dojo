import type { ProgressMap } from "./progress.js";

/**
 * 復習の提案(改善候補 5)。
 *
 * クリアしてから日が経った問題を「もう一度やってみませんか」と出す。
 * 覚えたつもりのまま放っておくと忘れるので、間隔をあけて出し直す。
 *
 * サーバーには何も足していない。手元にある進捗(クリア日時と最後に挑戦した日時)
 * だけで決まるので、未ログインでも、電波が無くても動く。
 */

/**
 * 何日あけてから出すか(S-012)。
 *
 * 1 回目は 7 日、2 回目は 21 日、3 回目以降は 60 日。
 * 思い出せた回数が増えるほど間隔を広げる(いわゆる間隔反復)。
 * 「思い出せた回数」はクリア後に成功した挑戦の回数で近似する。
 */
export const REVIEW_INTERVALS_DAYS = [7, 21, 60] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewItem = {
  problemId: string;
  /** 最後に触ってから経った日数(切り捨て) */
  daysSince: number;
};

export type DueForReviewOptions = {
  /** 何件まで出すか。既定 3。多いと「やることリスト」になって重い */
  limit?: number;
  /** 判定に使う「いま」。テスト用 */
  now?: Date;
  /** 出題対象にする問題 ID。指定すると、その中のものだけ返す */
  known?: ReadonlySet<string>;
};

/**
 * 復習に出す問題を、放置の長い順に返す。
 *
 * 対象はクリア済みの問題だけ。まだクリアしていない問題は「復習」ではなく
 * 「まだ解いていない問題」なので、一覧の側で見えている。
 */
export function dueForReview(
  progress: ProgressMap,
  options: DueForReviewOptions = {},
): ReviewItem[] {
  const limit = options.limit ?? 3;
  const now = options.now ?? new Date();
  const items: ReviewItem[] = [];

  for (const [problemId, p] of Object.entries(progress)) {
    if (!p.cleared) continue;
    if (options.known && !options.known.has(problemId)) continue;
    const touched = lastTouchedAt(p);
    if (touched === undefined) continue;
    const elapsed = now.getTime() - touched;
    if (elapsed < 0) continue;
    if (elapsed < intervalFor(p) * DAY_MS) continue;
    items.push({ problemId, daysSince: Math.floor(elapsed / DAY_MS) });
  }

  // 放置が長い順。同じなら ID 順にして、並びが毎回変わらないようにする
  items.sort((a, b) => b.daysSince - a.daysSince || a.problemId.localeCompare(b.problemId));
  return items.slice(0, limit);
}

/** 最後に触った時刻(ms)。挑戦の記録が無ければクリア日時で代用する */
function lastTouchedAt(p: ProgressMap[string]): number | undefined {
  const raw = p?.lastAttemptAt ?? p?.clearedAt;
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : t;
}

/**
 * この問題に使う間隔(日)。
 *
 * 「思い出せた回数」= クリア後も含めた成功回数 = attempts - failures。
 * 1 回成功しただけなら 7 日、2 回なら 21 日、3 回以上なら 60 日。
 */
function intervalFor(p: ProgressMap[string]): number {
  const successes = Math.max(1, (p?.attempts ?? 0) - (p?.failures ?? 0));
  const index = Math.min(successes - 1, REVIEW_INTERVALS_DAYS.length - 1);
  return REVIEW_INTERVALS_DAYS[index] ?? REVIEW_INTERVALS_DAYS[0];
}

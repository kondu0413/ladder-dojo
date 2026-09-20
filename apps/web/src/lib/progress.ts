/**
 * 未ログイン時の進捗(DECISIONS.md S-002)。
 * ブラウザの localStorage に持ち、ログイン時にサーバーへマージする(マージは次の段階)。
 * localStorage は使えないことがある(プライベートウィンドウ等)ので、必ず握りつぶす。
 */

const KEY = "ladder-dojo:progress:v1";

export type ProblemProgress = {
  cleared: boolean;
  clearedAt?: string;
  attempts: number;
  failures: number;
  lastAttemptAt?: string;
};

export type ProgressMap = Record<string, ProblemProgress>;

const EMPTY: ProblemProgress = { cleared: false, attempts: 0, failures: 0 };

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as ProgressMap;
  } catch {
    return {};
  }
}

export function getProblemProgress(map: ProgressMap, problemId: string): ProblemProgress {
  return map[problemId] ?? EMPTY;
}

/** 1 回の挑戦を記録して、新しい進捗全体を返す。一度クリアした問題は取り消さない */
export function recordAttempt(problemId: string, passed: boolean): ProgressMap {
  const map = loadProgress();
  const cur = getProblemProgress(map, problemId);
  const now = new Date().toISOString();
  const next: ProblemProgress = {
    cleared: cur.cleared || passed,
    attempts: cur.attempts + 1,
    failures: cur.failures + (passed ? 0 : 1),
    lastAttemptAt: now,
    ...(cur.clearedAt ? { clearedAt: cur.clearedAt } : passed ? { clearedAt: now } : {}),
  };
  const updated = { ...map, [problemId]: next };
  save(updated);
  return updated;
}

export function clearAllProgress(): ProgressMap {
  save({});
  return {};
}

/** 引き継ぎで送り終えた分だけ端末から消す(S-053)。途中で失敗しても、済んだ分を二重に送らない */
export function removeProgress(problemIds: readonly string[]): ProgressMap {
  const map = loadProgress();
  for (const id of problemIds) delete map[id];
  save(map);
  return map;
}

/**
 * ログイン中に送れなかった挑戦の控え(S-053)。
 *
 * オフラインやサーバーの失敗で POST が通らなかった挑戦は、以前は画面にしか残らず、
 * 読み込み直すと消えていた。ユーザーごとに端末に控え、つながったら送り直す
 */
export type QueuedAttempt = { problemId: string; passed: boolean; at: string };

const QUEUE_KEY = "ladder-dojo:attempt-queue:v1:";

export function loadQueue(userId: string): QueuedAttempt[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY + userId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAttempt[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(userId: string, items: readonly QueuedAttempt[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY + userId);
    else localStorage.setItem(QUEUE_KEY + userId, JSON.stringify(items));
  } catch {
    // 保存できなくても学習は続けられる
  }
}

function save(map: ProgressMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても学習は続けられる
  }
}

/**
 * まとめて送るために分割する(S-032)。
 *
 * 1 回のマージで送れる件数には上限がある(D1 の 1 リクエスト 50 クエリ)。
 * **入り切らない分を捨てない**ために、分けて全部送る
 */
export function chunkEntries<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`分割数が不正: ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

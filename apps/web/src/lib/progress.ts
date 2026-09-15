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

function save(map: ProgressMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても学習は続けられる
  }
}

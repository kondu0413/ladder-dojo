import type { Problem, ProblemMode, ProblemStage } from "@ladder-dojo/core";
import { comboProblems } from "./combo.js";
import { counterProblems } from "./counter.js";
import { interlockProblems } from "./interlock.js";
import { selfholdProblems } from "./selfhold.js";
import { timerProblems } from "./timer.js";

/**
 * 公式問題(SPEC.md §3.3)。リポジトリ内に持ってビルドに同梱する(DECISIONS.md D-005)。
 * 未ログインでも解けるようにするため、DB には置かない。
 *
 * 記述は素の JSON ではなく TypeScript(`packages/core` のビルダーを使う)。型チェックが効き、
 * 模範解答が自分のテストケースを通ることを `problems.test.ts` が毎回検証する。
 */
export const PROBLEMS: Problem[] = [
  ...selfholdProblems,
  ...timerProblems,
  ...counterProblems,
  ...interlockProblems,
  ...comboProblems,
];

/** 出題順: 段階(自己保持 → タイマ → カウンタ → インターロック → 組み合わせ)→ 読む → 直す → 書く */
const STAGE_ORDER: ProblemStage[] = ["selfhold", "timer", "counter", "interlock", "combo"];
const MODE_ORDER: ProblemMode[] = ["read", "fix", "write"];

export function sortedProblems(problems: Problem[] = PROBLEMS): Problem[] {
  return [...problems].sort(
    (a, b) =>
      STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) ||
      MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode) ||
      a.difficulty - b.difficulty ||
      a.id.localeCompare(b.id),
  );
}

export function findProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

export { MODE_ORDER, STAGE_ORDER };

export const STAGE_LABELS: Record<ProblemStage, string> = {
  selfhold: "自己保持",
  timer: "タイマ",
  counter: "カウンタ",
  interlock: "インターロック",
  combo: "組み合わせ",
};

export const MODE_LABELS: Record<ProblemMode, string> = {
  read: "読む",
  fix: "直す",
  write: "書く",
};

/**
 * 次に解く問題(S-038)。
 *
 * いまの問題より後ろで、まだクリアしていない最初の問題。後ろに無ければ先頭から探す
 * (前のほうに飛ばした問題が残っていることがある)。全部クリア済みなら undefined
 */
export function nextProblem(
  currentId: string,
  isCleared: (id: string) => boolean,
  problems: Problem[] = sortedProblems(),
): Problem | undefined {
  const index = problems.findIndex((p) => p.id === currentId);
  const after = problems.slice(index + 1).find((p) => p.id !== currentId && !isCleared(p.id));
  if (after) return after;
  return problems.slice(0, Math.max(index, 0)).find((p) => !isCleared(p.id));
}

/** 一覧で勧める「次の 1 問」。出題順でいちばん手前の未クリア */
export function recommendedProblem(
  isCleared: (id: string) => boolean,
  problems: Problem[] = sortedProblems(),
): Problem | undefined {
  return problems.find((p) => !isCleared(p.id));
}

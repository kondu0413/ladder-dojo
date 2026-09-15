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

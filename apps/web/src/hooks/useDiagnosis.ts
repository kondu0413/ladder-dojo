import type { Circuit, Diagnosis, JudgeResult, TestCase } from "@ladder-dojo/core";
import { diagnose } from "@ladder-dojo/core";
import { useEffect, useState } from "react";

export type DiagnosisState = {
  /** "working" のあいだは結果がまだ無い */
  state: "idle" | "working" | "done";
  diagnoses: Diagnosis[];
  /** この診断がどの判定結果のものか。別の結果の診断を「済み」と誤認しないため(S-053) */
  for?: JudgeResult | undefined;
};

const IDLE: DiagnosisState = { state: "idle", diagnoses: [] };

/**
 * つまずき診断を、画面を止めずに計算する(S-009)。
 *
 * 計算は最大で 1 秒近くかかる(組み合わせ問題で候補を総当たりするため)。
 * そのまま呼ぶと「答え合わせ」を押してから判定結果が出るまで固まって見えるので、
 * 判定結果を先に描いてから 1 フレーム遅らせて計算する。
 *
 * 表示するかどうかとは切り離してある。表示しない場合でも、
 * 「みんながつまずくところ」(§3.5)の集計に種類を送るために結果が要るため。
 */
export function useDiagnosis(
  circuit: Circuit | undefined,
  testCases: readonly TestCase[],
  result: JudgeResult | undefined,
): DiagnosisState {
  const [state, setState] = useState<DiagnosisState>(IDLE);

  useEffect(() => {
    if (!circuit || !result) {
      setState(IDLE);
      return;
    }
    if (result.passed) {
      setState({ state: "done", diagnoses: [], for: result });
      return;
    }
    setState({ state: "working", diagnoses: [], for: result });
    let alive = true;
    const id = setTimeout(() => {
      const found = diagnose(circuit, testCases, result);
      if (alive) setState({ state: "done", diagnoses: found, for: result });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [circuit, testCases, result]);

  /**
   * 判定結果が新しくなった描画では、まだ前の結果の診断しか持っていない(effect は
   * 描画のあとに走る)。それを「済み」として返すと、2 回目以降の答え合わせで
   * **前回の診断が提出に付いて送られていた**(S-053)。結果が違えば「計算中」として返す
   */
  if (!result) return IDLE;
  if (state.for !== result) return { state: "working", diagnoses: [], for: result };
  return state;
}

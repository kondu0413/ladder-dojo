import type { Circuit, Diagnosis, JudgeResult, TestCase } from "@ladder-dojo/core";
import { diagnose } from "@ladder-dojo/core";
import { useEffect, useState } from "react";
import { LadderView } from "./LadderView.js";

export type DiagnosisPanelProps = {
  circuit: Circuit;
  testCases: readonly TestCase[];
  result: JudgeResult;
  /** この問題で失敗した回数。1 回目は自分で考えてもらうので出さない */
  failures: number;
  deviceLabels?: Record<string, string> | undefined;
};

/** これ以上失敗したら診断を出す(S-009) */
export const DIAGNOSIS_AFTER_FAILURES = 2;

/**
 * つまずき診断(改善候補 1)。判定が通らなかったときに「どこを見ればいいか」を出す。
 *
 * 1 回目の失敗では出さない。すぐ手がかりを出すと、自分で考える機会を奪ってしまうため。
 *
 * 計算は最大で 1 秒近くかかることがある(組み合わせ問題で候補を総当たりするため)。
 * そのまま呼ぶと「答え合わせ」を押してから判定結果が出るまで固まって見えるので、
 * 判定結果を先に描いてから 1 フレーム遅らせて計算する。
 */
export function DiagnosisPanel({
  circuit,
  testCases,
  result,
  failures,
  deviceLabels,
}: DiagnosisPanelProps) {
  const show = !result.passed && failures >= DIAGNOSIS_AFTER_FAILURES;
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);

  useEffect(() => {
    if (!show) {
      setState("idle");
      setDiagnoses([]);
      return;
    }
    setState("working");
    let alive = true;
    // 判定結果を先に画面へ出してから計算する
    const id = setTimeout(() => {
      const found = diagnose(circuit, testCases, result);
      if (!alive) return;
      setDiagnoses(found);
      setState("done");
    }, 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [show, circuit, testCases, result]);

  if (!show) return null;

  if (state !== "done") {
    return (
      <p data-testid="diagnosis-working" className="text-sm text-slate-500">
        つまずいているところを探しています…
      </p>
    );
  }

  if (diagnoses.length === 0) {
    return (
      <p data-testid="diagnosis-empty" className="text-sm text-slate-500">
        自動で見つけられる原因はありませんでした。失敗したテストケースの操作を、動かしながら 1
        つずつ追ってみてください。
      </p>
    );
  }

  return (
    <section
      data-testid="diagnosis"
      className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
    >
      <p className="text-sm font-bold text-amber-900">ここを見てみましょう</p>
      <ul className="flex flex-col gap-3">
        {diagnoses.map((d) => (
          <li key={`${d.id}-${d.cells.map((c) => `${c.row},${c.col}`).join("-")}`}>
            <p data-testid={`diagnosis-${d.id}`} className="text-sm font-semibold text-slate-800">
              {d.title}
            </p>
            <p className="mt-0.5 text-sm text-slate-700">{d.detail}</p>
          </li>
        ))}
      </ul>
      {diagnoses.some((d) => d.cells.length > 0) && (
        <div className="overflow-x-auto rounded-lg bg-white p-2">
          <LadderView
            circuit={circuit}
            deviceLabels={deviceLabels}
            highlight={diagnoses.flatMap((d) => d.cells)}
          />
        </div>
      )}
      <p className="text-xs text-amber-800">
        直し方までは言いません。囲ったところを見て、自分で考えてみてください。
      </p>
    </section>
  );
}

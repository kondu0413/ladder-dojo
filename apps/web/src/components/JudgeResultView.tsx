import type { CaseResult, Circuit, JudgeResult, Problem } from "@ladder-dojo/core";
import { runTestCase } from "@ladder-dojo/core";
import { useMemo } from "react";
import { describeStep, diffOutputs, labelMap, onOff } from "../lib/describe.js";
import { useNotation } from "../lib/notation-context.jsx";
import { TimeChart } from "./TimeChart.js";

export type JudgeResultViewProps = {
  result: JudgeResult;
  problem: Problem;
  /** 学習者の回路。渡すと、通らなかったテストのタイムチャートを出す */
  circuit?: Circuit | undefined;
};

/**
 * 判定結果(SPEC.md §3.3)。
 * 不正解のときは「どのテストケースの、どの操作のあとで、何がどう違ったか」を具体的に出す。
 */
export function JudgeResultView({ result, problem, circuit }: JudgeResultViewProps) {
  const failed = result.cases.find((c) => !c.passed);
  const passedCount = result.cases.filter((c) => c.passed).length;

  if (result.passed) {
    return (
      <div
        data-testid="judge-result"
        data-passed="true"
        className="rounded-xl border border-emerald-300 bg-emerald-50 p-4"
      >
        <p className="text-base font-bold text-emerald-800">正解です</p>
        <p className="mt-1 text-sm text-emerald-700">
          {result.cases.length} 件のテストケースをすべて通りました。
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="judge-result"
      data-passed="false"
      className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4"
    >
      <div>
        <p className="text-base font-bold text-red-800">まだ通っていません</p>
        <p className="mt-1 text-sm text-red-700">
          {result.cases.length} 件中 {passedCount} 件が成功しました。
        </p>
      </div>
      {failed && <FailureDetail result={failed} problem={problem} circuit={circuit} />}
    </div>
  );
}

function FailureDetail({
  result,
  problem,
  circuit,
}: {
  result: CaseResult;
  problem: Problem;
  circuit: Circuit | undefined;
}) {
  const labels = labelMap(problem.deviceLabels);
  const notation = useNotation();
  const failure = result.failure;

  // 通らなかったケースだけ、波形を記録しながらもう一度流す。
  // 判定そのもので毎回記録すると、つまずき診断の総当たりが重くなるので分けている
  const timeline = useMemo(() => {
    if (!circuit) return undefined;
    const testCase = problem.testCases.find((t) => t.id === result.caseId);
    if (!testCase) return undefined;
    return runTestCase(circuit, testCase, { recordTimeline: true }).timeline;
  }, [circuit, problem.testCases, result.caseId]);

  if (!failure) return null;

  if (failure.kind === "unstable") {
    return (
      <p className="rounded-lg bg-white p-3 text-sm text-slate-700">
        「{result.title}
        」で、回路の状態が落ち着きませんでした。出力が自分の接点で自分を反転させていないか確かめてください(例:
        b 接点の M0 でコイル M0 を動かしている)。
      </p>
    );
  }
  if (failure.kind === "limit") {
    return (
      <p className="rounded-lg bg-white p-3 text-sm text-slate-700">
        「{result.title}
        」の処理が長すぎて打ち切られました。タイマの設定値が大きすぎないか確かめてください。
      </p>
    );
  }

  const diffs = diffOutputs(failure.expected, failure.actual);
  const operations = result.trace
    .slice(0, failure.stepIndex)
    .filter((t) => t.step.type !== "expect")
    .map((t) => ({ key: t.index, text: describeStep(t.step, labels, notation.notation) }));

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-3">
      <p className="text-sm font-semibold text-slate-800" data-testid="failed-case-title">
        通らなかったテスト: {result.title}
      </p>

      {operations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500">ここまでの操作</p>
          <ol className="mt-1 list-decimal pl-5 text-sm text-slate-700">
            {operations.map((op) => (
              <li key={op.key}>{op.text}</li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-500">この時点で期待される状態</p>
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">デバイス</th>
              <th className="py-1">期待</th>
              <th className="py-1">実際</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr
                key={d.device}
                data-testid={`diff-${d.device}`}
                className="border-t border-slate-100"
              >
                <td className="py-1 font-mono">
                  {notation.device(d.device)}
                  {labels[d.device] && (
                    <span className="ml-1 text-xs text-slate-400">{labels[d.device]}</span>
                  )}
                </td>
                <td className="py-1 font-medium text-emerald-700">{onOff(d.expected)}</td>
                <td className="py-1 font-medium text-red-700">{onOff(d.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {timeline && (
        <div>
          <p className="text-xs font-semibold text-slate-500">時間の流れ</p>
          <TimeChart
            timeline={timeline}
            deviceLabels={labels}
            mismatched={diffs.map((d) => d.device)}
          />
        </div>
      )}

      {failure.note && <p className="text-sm text-slate-600">ヒント: {failure.note}</p>}
    </div>
  );
}

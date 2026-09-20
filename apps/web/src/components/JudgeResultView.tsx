import type { CaseResult, Circuit, JudgeResult, Problem } from "@ladder-dojo/core";
import { runTestCase } from "@ladder-dojo/core";
import { useMemo } from "react";
import { describeStep, diffOutputs, labelMap, onOff } from "../lib/describe.js";
import { useNotation } from "../lib/notation-context.jsx";
import { TimeChart } from "./TimeChart.js";
import { Icon, Label } from "./ui.js";

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
        className="rise-in flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_0_0_4px_rgb(16_185_129/0.2)]">
          <Icon name="check" className="h-6 w-6" strokeWidth={2.5} />
        </span>
        <div>
          <p className="text-base font-bold text-emerald-900">正解です</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            {result.cases.length} 件のテストケースをすべて通りました。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="judge-result"
      data-passed="false"
      className="rise-in flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
          <Icon name="close" className="h-6 w-6" strokeWidth={2.5} />
        </span>
        <div>
          <p className="text-base font-bold text-rose-900">まだ通っていません</p>
          <p className="mt-0.5 text-sm text-rose-800">
            {result.cases.length} 件中 {passedCount} 件が成功しました。
          </p>
        </div>
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
      <p className="rounded-xl border border-rose-100 bg-white p-3.5 text-sm leading-relaxed text-slate-700">
        「{notation.text(result.title)}
        」で、回路の状態が落ち着きませんでした。出力が自分の接点で自分を反転させていないか確かめてください(例:
        {notation.text(" b 接点の M0 でコイル M0 を動かしている")})。
      </p>
    );
  }
  if (failure.kind === "limit") {
    return (
      <p className="rounded-xl border border-rose-100 bg-white p-3.5 text-sm leading-relaxed text-slate-700">
        「{notation.text(result.title)}
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
    <div className="flex flex-col gap-4 rounded-xl border border-rose-100 bg-white p-4">
      <p className="text-sm font-bold text-slate-900" data-testid="failed-case-title">
        通らなかったテスト: {notation.text(result.title)}
      </p>

      {operations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>ここまでの操作</Label>
          <ol className="flex flex-col gap-1 text-sm text-slate-700">
            {operations.map((op, i) => (
              <li key={op.key} className="flex items-baseline gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                  {i + 1}
                </span>
                {op.text}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>この時点で期待される状態</Label>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-slate-500">
              <th className="pb-1.5 font-semibold">デバイス</th>
              <th className="pb-1.5 font-semibold">期待</th>
              <th className="pb-1.5 font-semibold">実際</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.device} data-testid={`diff-${d.device}`}>
                <td className="border-t border-slate-100 py-1.5 font-mono font-semibold text-slate-800">
                  {notation.device(d.device)}
                  {labels[d.device] && (
                    <span className="ml-1.5 font-sans text-xs font-normal text-slate-400">
                      {labels[d.device]}
                    </span>
                  )}
                </td>
                <td className="border-t border-slate-100 py-1.5">
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">
                    {onOff(d.expected)}
                  </span>
                </td>
                <td className="border-t border-slate-100 py-1.5">
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 font-mono text-xs font-bold text-rose-800">
                    {onOff(d.actual)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {timeline && (
        <div className="flex flex-col gap-1.5">
          <Label>時間の流れ</Label>
          <TimeChart
            timeline={timeline}
            deviceLabels={labels}
            mismatched={diffs.map((d) => d.device)}
          />
        </div>
      )}

      {failure.note && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>ヒント: {notation.text(failure.note)}</span>
        </p>
      )}
    </div>
  );
}

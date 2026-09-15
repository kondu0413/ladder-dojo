import { type Circuit, circuitMetrics, type Problem } from "@ladder-dojo/core";
import { labelMap } from "../lib/describe.js";
import { LadderView } from "./LadderView.js";

export type SolutionCompareProps = {
  problem: Problem;
  yours: Circuit;
};

/**
 * 正解後に「あなたの回路」と「模範解答」を並べて見せる(SPEC.md §3.3)。
 * 指標は比較の補助であって、正誤には一切影響しない。
 */
export function SolutionCompare({ problem, yours }: SolutionCompareProps) {
  const labels = labelMap(problem.deviceLabels);
  const mine = circuitMetrics(yours);
  const model = circuitMetrics(problem.solution);

  const rows = [
    { label: "ラング数", mine: mine.rungs, model: model.rungs },
    { label: "接点の数", mine: mine.contacts, model: model.contacts },
    { label: "コイルの数", mine: mine.coils, model: model.coils },
    { label: "使ったマス", mine: mine.cells, model: model.cells },
  ];
  const leaner = rows.some((r) => r.mine > r.model);

  return (
    <section className="flex flex-col gap-3" data-testid="solution-compare">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">あなたの回路</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
          <LadderView circuit={yours} deviceLabels={labels} />
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">模範解答</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
          <LadderView circuit={problem.solution} deviceLabels={labels} />
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">くらべてみる</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">指標</th>
              <th className="py-1">あなた</th>
              <th className="py-1">模範解答</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100">
                <td className="py-1 text-slate-600">{r.label}</td>
                <td
                  className={`py-1 font-mono ${r.mine > r.model ? "text-amber-700" : "text-slate-800"}`}
                  data-testid={`metric-mine-${r.label}`}
                >
                  {r.mine}
                </td>
                <td className="py-1 font-mono text-slate-800">{r.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          {leaner
            ? "模範解答の方が少ない部品で書けています。どこを減らせるか見てみましょう(正誤には影響しません)。"
            : "模範解答と同じか、それよりコンパクトに書けています。"}
        </p>
      </div>
    </section>
  );
}

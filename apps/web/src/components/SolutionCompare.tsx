import type { Circuit, Problem } from "@ladder-dojo/core";
import { labelMap } from "../lib/describe.js";
import { circuitMetricsRows } from "../lib/metrics-view.js";
import { LadderView } from "./LadderView.js";
import { Card, Icon, SectionTitle } from "./ui.js";

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
  const rows = circuitMetricsRows(yours, problem.solution);
  const leaner = rows.some((r) => r.mine > r.model);

  return (
    <section className="rise-in flex flex-col gap-4" data-testid="solution-compare">
      <SectionTitle icon="layers">回路をくらべる</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-slate-700">あなたの回路</h3>
          <Card className="overflow-x-auto p-2">
            <LadderView circuit={yours} deviceLabels={labels} />
          </Card>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-slate-700">模範解答</h3>
          <Card className="overflow-x-auto border-amber-200 p-2">
            <LadderView circuit={problem.solution} deviceLabels={labels} />
          </Card>
        </div>
      </div>

      <Card padded className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700">指標でくらべる</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-slate-500">
              <th className="pb-1.5 font-semibold">指標</th>
              <th className="pb-1.5 text-right font-semibold">あなた</th>
              <th className="pb-1.5 text-right font-semibold">模範解答</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="border-t border-slate-100 py-1.5 text-slate-600">{r.label}</td>
                <td
                  className={`border-t border-slate-100 py-1.5 text-right font-mono tabular-nums ${
                    r.mine > r.model ? "font-bold text-amber-700" : "text-slate-800"
                  }`}
                  data-testid={`metric-mine-${r.label}`}
                >
                  {r.mine}
                </td>
                <td className="border-t border-slate-100 py-1.5 text-right font-mono tabular-nums text-slate-800">
                  {r.model}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {leaner
              ? "模範解答の方が少ない部品で書けています。どこを減らせるか見てみましょう(正誤には影響しません)。"
              : "模範解答と同じか、それよりコンパクトに書けています。"}
          </span>
        </p>
      </Card>
    </section>
  );
}

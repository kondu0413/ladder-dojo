import { type Circuit, circuitMetrics } from "@ladder-dojo/core";

/** 指標の比較表の行(SPEC.md §3.3。正誤には影響しない) */
export function circuitMetricsRows(
  yours: Circuit,
  model: Circuit,
): Array<{ label: string; mine: number; model: number }> {
  const mine = circuitMetrics(yours);
  const theirs = circuitMetrics(model);
  return [
    { label: "ラング数", mine: mine.rungs, model: theirs.rungs },
    { label: "接点の数", mine: mine.contacts, model: theirs.contacts },
    { label: "コイルの数", mine: mine.coils, model: theirs.coils },
    { label: "使ったマス", mine: mine.cells, model: theirs.cells },
  ];
}

import type { Circuit } from "./schema/circuit.js";
import { splitRungs } from "./sim/simulator.js";

/** 模範解答との比較に使う軽い指標(SPEC.md §3.3)。正誤には使わない */
export type CircuitMetrics = {
  /** コイルを含むラング数 */
  rungs: number;
  contacts: number;
  coils: number;
  /** 使用セル数(横線を含む) */
  cells: number;
};

export function circuitMetrics(circuit: Circuit): CircuitMetrics {
  let contacts = 0;
  let coils = 0;
  let cells = 0;
  const coilRows = new Set<number>();
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (!el) continue;
    cells++;
    if (el.type === "contact") contacts++;
    if (el.type === "coil") {
      coils++;
      coilRows.add(cell.row);
    }
  }
  const rungs = splitRungs(circuit).filter((r) => r.rows.some((row) => coilRows.has(row))).length;
  return { rungs, contacts, coils, cells };
}

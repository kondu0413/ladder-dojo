import type { Cell, Circuit, Element } from "./schema/circuit.js";

/**
 * 回路の指紋(fingerprint)。同じ回路なら常に同じ文字列になる。
 *
 * **保存形式ではない**。セルを配列に畳んだ比較専用の表現で、ここから Circuit には戻せない。
 * 用途は提出履歴の重複判定(S-003)と「同じ回路か」の比較だけ。保存するときは zod 検証済みの
 * Circuit をそのまま JSON にする。
 */
export function circuitFingerprint(circuit: Circuit): string {
  const cells = [...circuit.cells]
    .filter((c) => c.element !== undefined || c.vline === true)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(canonicalCell);
  return JSON.stringify({
    schemaVersion: circuit.schemaVersion,
    cols: circuit.cols,
    rows: circuit.rows,
    cells,
  });
}

function canonicalCell(cell: Cell): unknown[] {
  return [
    cell.row,
    cell.col,
    cell.element ? canonicalElement(cell.element) : null,
    cell.vline === true,
  ];
}

function canonicalElement(el: Element): unknown[] {
  switch (el.type) {
    case "wire":
      return ["wire"];
    case "contact":
      return ["contact", el.kind, el.device];
    case "coil":
      switch (el.kind) {
        case "timer":
        case "offdelay":
          return ["coil", el.kind, el.device, el.presetMs];
        case "counter":
          return ["coil", el.kind, el.device, el.preset];
        default:
          return ["coil", el.kind, el.device];
      }
  }
}

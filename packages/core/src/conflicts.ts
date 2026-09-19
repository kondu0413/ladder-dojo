import { DEFAULT_NOTATION, formatDevice, type Notation } from "./notation.js";
import type { Circuit, CoilElement } from "./schema/circuit.js";
import { type DeviceId, deviceType } from "./schema/device.js";
import type { PowerMap } from "./sim/simulator.js";

/**
 * 同じデバイスに複数のコイルが書いている(S-049)。
 *
 * PLC は上から順に実行するので、**あとに実行された行の結果が残る**。
 * SET と RST の両方に通電したとき、二重コイルのとき、図の上では両方のコイルが
 * 通電して見えるのに片方の結果しか残らないので、学習者には「なぜ」が見えない。
 * ここで衝突を見つけ、図には「残る」「上書き」の印を、文章には理由を出す。
 */

export type CoilWrite = {
  row: number;
  col: number;
  kind: "out" | "set" | "reset";
  /** このコイルが書いた値 */
  value: boolean;
};

export type CoilConflict = {
  device: DeviceId;
  /** 実行順(上から)。最後の 1 つが残る */
  writes: CoilWrite[];
  /** 残った値(最後の書き込み) */
  result: boolean;
};

/**
 * このスキャンで同じデバイスに違う値を書いたコイルを集める。
 *
 * 書き込みの規則は Simulator.applyCoil と同じ:
 * - 出力コイルは通電の有無にかかわらず毎スキャン書く(通電なし = OFF を書く)
 * - SET / RST は通電したときだけ書く(SET = ON、RST = OFF)
 * 全部が同じ値なら衝突ではない(見た目どおりの結果になる)
 */
export function findCoilConflicts(circuit: Circuit, power: PowerMap): CoilConflict[] {
  const byDevice = new Map<DeviceId, CoilWrite[]>();
  const coils = circuit.cells
    .filter((c) => c.element?.type === "coil")
    .sort((a, b) => a.row - b.row || a.col - b.col);
  for (const cell of coils) {
    const el = cell.element as CoilElement;
    const write = writeOf(el, power.cells[cell.row]?.[cell.col] ?? false);
    if (!write) continue;
    const list = byDevice.get(el.device) ?? [];
    list.push({ row: cell.row, col: cell.col, ...write });
    byDevice.set(el.device, list);
  }
  const out: CoilConflict[] = [];
  for (const [device, writes] of byDevice) {
    if (writes.length < 2) continue;
    const last = writes[writes.length - 1];
    if (!last || writes.every((w) => w.value === last.value)) continue;
    out.push({ device, writes, result: last.value });
  }
  return out;
}

function writeOf(
  el: CoilElement,
  energized: boolean,
): { kind: CoilWrite["kind"]; value: boolean } | undefined {
  switch (el.kind) {
    case "out":
      return { kind: "out", value: energized };
    case "set":
      return energized ? { kind: "set", value: true } : undefined;
    case "reset":
      // カウンタの RST は数を戻すだけで、ビットの書き込みとは別物
      if (deviceType(el.device) === "C") return undefined;
      return energized ? { kind: "reset", value: false } : undefined;
    default:
      return undefined;
  }
}

const KIND_NAMES: Record<CoilWrite["kind"], string> = {
  out: "出力コイル",
  set: "SET",
  reset: "RST",
};

/**
 * 衝突の理由を一言で。
 * 「1 行目の SET と 2 行目の RST が両方通電しています。PLC は上から順に実行するので、
 *   あとの 2 行目(RST)の結果が残り、Y0 は OFF です。」
 */
export function describeCoilConflict(
  conflict: CoilConflict,
  labels?: Record<string, string>,
  notation: Notation = DEFAULT_NOTATION,
): string {
  const shown = formatDevice(conflict.device, notation);
  const label = labels?.[conflict.device];
  const name = label ? `${shown}(${label})` : shown;
  const last = conflict.writes[conflict.writes.length - 1];
  if (!last) return "";
  // 英字の名前(SET / RST)の前には空白を入れ、日本語(出力コイル)には入れない
  const where = (w: CoilWrite) => {
    const kind = KIND_NAMES[w.kind];
    return `${w.row + 1} 行目の${/^[A-Z]/.test(kind) ? " " : ""}${kind}`;
  };
  const onlySetReset = conflict.writes.every((w) => w.kind !== "out");
  const head = onlySetReset
    ? `${conflict.writes.map(where).join(" と ")} が両方通電しています。`
    : `${conflict.writes.map((w) => `${where(w)}(${w.value ? "ON" : "OFF"})`).join(" と ")} が同じ ${name} に書いています。`;
  return `${head}PLC は上から順に実行するので、あとの ${last.row + 1} 行目(${KIND_NAMES[last.kind]})の結果が残り、${name} は ${conflict.result ? "ON" : "OFF"} です。`;
}

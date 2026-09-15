import {
  type Cell,
  type Circuit,
  type CoilElement,
  type ContactElement,
  circuitSchema,
  type Element,
  SCHEMA_VERSION,
  type WireElement,
} from "./schema/circuit.js";
import type { DeviceId } from "./schema/device.js";

/**
 * 回路を簡潔に組み立てるためのビルダー(テスト・公式問題の記述用)。
 *
 * ```ts
 * // 自己保持: X0 で起動、X1 で停止
 * ladder(6)
 *   .row(no("X0"), nc("X1"), out("Y0"))  // 要素は左から順に置き、コイルは最右列。間は横線で埋める
 *   .row(no("Y0"))                        // 並列枝
 *   .v(0, 0)                              // 行 0 の列 0 の右端から下へ縦線
 *   .build();
 * ```
 */

export const wire: WireElement = { type: "wire" };
export const no = (device: DeviceId): ContactElement => ({ type: "contact", kind: "no", device });
export const nc = (device: DeviceId): ContactElement => ({ type: "contact", kind: "nc", device });
export const rise = (device: DeviceId): ContactElement => ({
  type: "contact",
  kind: "rise",
  device,
});
export const out = (device: DeviceId): CoilElement => ({ type: "coil", kind: "out", device });
export const pulse = (device: DeviceId): CoilElement => ({ type: "coil", kind: "pulse", device });
export const timer = (device: DeviceId, presetMs: number): CoilElement => ({
  type: "coil",
  kind: "timer",
  device,
  presetMs,
});
export const counter = (device: DeviceId, preset: number): CoilElement => ({
  type: "coil",
  kind: "counter",
  device,
  preset,
});
export const reset = (device: DeviceId): CoilElement => ({ type: "coil", kind: "reset", device });

/** 行の要素。null は空セル(位置合わせ用) */
export type RowItem = Element | null;

export class LadderBuilder {
  private readonly cells = new Map<string, Cell>();
  private rowCount = 0;

  constructor(private readonly cols: number) {}

  /**
   * 1 行追加する。要素は列 0 から順に置く。
   * 末尾がコイルなら最右列に置き、直前の要素との間を横線で埋める。
   */
  row(...items: RowItem[]): this {
    const r = this.rowCount++;
    const last = items[items.length - 1];
    const hasCoil = last !== null && last !== undefined && last.type === "coil";
    const body = hasCoil ? items.slice(0, -1) : items;
    if (body.length > (hasCoil ? this.cols - 1 : this.cols)) {
      throw new Error(`行 ${r} の要素数が列数 ${this.cols} を超えています`);
    }
    body.forEach((item, c) => {
      if (item) this.set(r, c, { element: item });
    });
    if (hasCoil) {
      const coil = last as CoilElement;
      for (let c = body.length; c < this.cols - 1; c++) {
        if (c === 0 && body.length === 0) continue; // 先頭が空の行は母線につながない
        this.set(r, c, { element: wire });
      }
      this.set(r, this.cols - 1, { element: coil });
    }
    return this;
  }

  /** 任意の位置に要素を置く(行は必要に応じて増える) */
  at(row: number, col: number, element: Element): this {
    this.rowCount = Math.max(this.rowCount, row + 1);
    this.set(row, col, { element });
    return this;
  }

  /** 行 row の列 col の右端から 1 つ下の行へ縦線を引く */
  v(row: number, col: number): this {
    this.rowCount = Math.max(this.rowCount, row + 2);
    this.set(row, col, { vline: true });
    return this;
  }

  private set(row: number, col: number, patch: Partial<Cell>): void {
    const key = `${row},${col}`;
    const cur = this.cells.get(key) ?? { row, col };
    this.cells.set(key, { ...cur, ...patch });
  }

  build(): Circuit {
    const cells = [...this.cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
    return circuitSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      cols: this.cols,
      rows: Math.max(1, this.rowCount),
      cells,
    });
  }
}

export function ladder(cols = 8): LadderBuilder {
  return new LadderBuilder(cols);
}

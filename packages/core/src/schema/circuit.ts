import { z } from "zod";
import {
  bitCoilDeviceSchema,
  counterDeviceSchema,
  deviceIdSchema,
  timerDeviceSchema,
} from "./device.js";

/** 回路 JSON のスキーマバージョン。互換性のない変更で上げる(D-005) */
export const SCHEMA_VERSION = 1 as const;

export const MAX_COLS = 16;
export const MAX_ROWS = 64;
/** タイマ設定値の上限(ms)。学習用途で 10 分あれば十分 */
export const MAX_TIMER_PRESET_MS = 600_000;
export const MAX_COUNTER_PRESET = 9_999;

// ---------------------------------------------------------------------------
// 要素(セルに置くもの)
// ---------------------------------------------------------------------------

/** 横線。左右を無条件に導通させる */
export const wireElementSchema = z.object({ type: z.literal("wire") });

/**
 * 接点。
 * - no: a 接点(常開)。デバイスが ON のとき導通
 * - nc: b 接点(常閉)。デバイスが OFF のとき導通
 * - rise: 立ち上がり接点。デバイスが OFF → ON になったスキャンだけ導通
 * T / C を参照した場合は「設定値到達(done)」を読む
 */
export const contactElementSchema = z.object({
  type: z.literal("contact"),
  kind: z.enum(["no", "nc", "rise"]),
  device: deviceIdSchema,
});

/** 出力コイル(Y / M)。通電中 ON */
export const outCoilSchema = z.object({
  type: z.literal("coil"),
  kind: z.literal("out"),
  device: bitCoilDeviceSchema,
});

/** 立ち上がり微分(PLS)。通電の立ち上がりで 1 スキャンだけ対象を ON */
export const pulseCoilSchema = z.object({
  type: z.literal("coil"),
  kind: z.literal("pulse"),
  device: bitCoilDeviceSchema,
});

/** オンディレイタイマ。通電が presetMs 続くと T が ON。通電が切れるとリセット */
export const timerCoilSchema = z.object({
  type: z.literal("coil"),
  kind: z.literal("timer"),
  device: timerDeviceSchema,
  presetMs: z.number().int().min(1).max(MAX_TIMER_PRESET_MS),
});

/** アップカウンタ。通電の立ち上がりを数え、preset 回に達すると C が ON。RST でリセット */
export const counterCoilSchema = z.object({
  type: z.literal("coil"),
  kind: z.literal("counter"),
  device: counterDeviceSchema,
  preset: z.number().int().min(1).max(MAX_COUNTER_PRESET),
});

/** カウンタのリセット(RST)。通電中、対象カウンタの現在値と done を 0 にする */
export const resetCoilSchema = z.object({
  type: z.literal("coil"),
  kind: z.literal("reset"),
  device: counterDeviceSchema,
});

export const coilElementSchema = z.discriminatedUnion("kind", [
  outCoilSchema,
  pulseCoilSchema,
  timerCoilSchema,
  counterCoilSchema,
  resetCoilSchema,
]);

export const elementSchema = z.union([wireElementSchema, contactElementSchema, coilElementSchema]);

export type WireElement = z.infer<typeof wireElementSchema>;
export type ContactElement = z.infer<typeof contactElementSchema>;
export type ContactKind = ContactElement["kind"];
export type CoilElement = z.infer<typeof coilElementSchema>;
export type CoilKind = CoilElement["kind"];
export type Element = z.infer<typeof elementSchema>;

// ---------------------------------------------------------------------------
// セルと回路
// ---------------------------------------------------------------------------

/**
 * グリッドの 1 マス。
 * - element: このマスに置かれた要素(省略 = 空)
 * - vline: このマスの右端から、1 つ下の行の同じ位置へ縦線をつなぐ(並列分岐・合流)
 * 各行の左端は常に左母線につながる。コイルは最右列にのみ置け、右母線に直結する。
 */
export const cellSchema = z.object({
  row: z
    .number()
    .int()
    .min(0)
    .max(MAX_ROWS - 1),
  col: z
    .number()
    .int()
    .min(0)
    .max(MAX_COLS - 1),
  element: elementSchema.optional(),
  vline: z.boolean().optional(),
});
export type Cell = z.infer<typeof cellSchema>;

export const circuitSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    cols: z.number().int().min(2).max(MAX_COLS),
    rows: z.number().int().min(1).max(MAX_ROWS),
    cells: z.array(cellSchema),
  })
  .superRefine((circuit, ctx) => {
    const seen = new Set<string>();
    circuit.cells.forEach((cell, i) => {
      const key = `${cell.row},${cell.col}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["cells", i],
          message: `セル (${key}) が重複しています`,
        });
      }
      seen.add(key);
      if (cell.row >= circuit.rows || cell.col >= circuit.cols) {
        ctx.addIssue({ code: "custom", path: ["cells", i], message: `セル (${key}) が範囲外です` });
      }
      if (cell.element?.type === "coil" && cell.col !== circuit.cols - 1) {
        ctx.addIssue({
          code: "custom",
          path: ["cells", i],
          message: `コイルは最右列(col=${circuit.cols - 1})にのみ置けます`,
        });
      }
      if (cell.vline && cell.row === circuit.rows - 1) {
        ctx.addIssue({
          code: "custom",
          path: ["cells", i],
          message: "最終行から下への縦線は置けません",
        });
      }
      if (cell.vline && cell.col === circuit.cols - 1) {
        ctx.addIssue({
          code: "custom",
          path: ["cells", i],
          message: "最右列(コイル列)の右端に縦線は置けません",
        });
      }
    });
  });

export type Circuit = z.infer<typeof circuitSchema>;

/** 検証して Circuit を返す。壊れていれば ZodError を投げる */
export function parseCircuit(input: unknown): Circuit {
  return circuitSchema.parse(input);
}

/** 空の回路 */
export function emptyCircuit(cols = 8, rows = 4): Circuit {
  return { schemaVersion: SCHEMA_VERSION, cols, rows, cells: [] };
}

/** セルを (row, col) で引くためのマップ */
export function cellMap(circuit: Circuit): Map<string, Cell> {
  const m = new Map<string, Cell>();
  for (const cell of circuit.cells) m.set(cellKey(cell.row, cell.col), cell);
  return m;
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

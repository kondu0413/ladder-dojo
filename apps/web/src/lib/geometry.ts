import type { Circuit } from "@ladder-dojo/core";

/**
 * ラダー図の SVG レイアウト(DECISIONS.md D-004 / S-006)。
 * セルはスマホのタップ領域として十分な大きさ(44px 以上)を確保する。
 */
export const CELL_W = 76;
export const CELL_H = 64;
/** 左右の母線の余白。左には行番号(S-049)が入る */
export const RAIL_PAD = 22;
/** 右側に「残る / 上書き」の印(S-049)を出すときに足す幅 */
export const NOTE_W = 44;

export function svgWidth(circuit: Circuit): number {
  return RAIL_PAD * 2 + circuit.cols * CELL_W;
}

export function svgHeight(circuit: Circuit): number {
  return circuit.rows * CELL_H + 16;
}

/** セル (row, col) の左上座標 */
export function cellOrigin(row: number, col: number): { x: number; y: number } {
  return { x: RAIL_PAD + col * CELL_W, y: 8 + row * CELL_H };
}

/** セルの中心の y(配線が通る高さ) */
export function wireY(row: number): number {
  return 8 + row * CELL_H + CELL_H / 2;
}

/** ノード(セル境界)の x */
export function nodeX(col: number): number {
  return RAIL_PAD + col * CELL_W;
}

import { DEFAULT_NOTATION, formatDevice, type Notation } from "./notation.js";
import type { Circuit, CoilElement, ContactElement, DeviceId } from "./schema/index.js";
import { cellKey, cellMap } from "./schema/index.js";
import type { PowerMap } from "./sim/simulator.js";

/**
 * ラダー図を読み上げ用の文章にする(改善候補 14 / S-018)。
 *
 * ラダー図は SVG で描いている。線と丸の集まりなので、そのままでは
 * スクリーンリーダーに「ラダー図」としか伝わらず、**目で見ない人には
 * 回路の中身が一切分からない**。ここで行ごとの文章を組み立てる。
 *
 * core に置いているのは、判定や診断と同じで **DOM に依存しないほうが
 * テストで固めやすい**ため(D-002)。画面側は返ってきた文字列を
 * `aria-label` に載せるだけにする。
 */

/**
 * 日本語の文をつなぐ。**英数字と日本語の境目にだけ空白を入れる**。
 *
 * 「X0 の a 接点」は読みやすいが、「X0(起動ボタン) の 立ち上がり接点」は
 * 空白が余る。どちらかが英数字で始まる / 終わるときだけ空ける。
 */
function ja(...parts: string[]): string {
  return parts.reduce((left, right) => {
    if (left === "" || right === "") return left + right;
    const needsSpace = /[A-Za-z0-9]$/.test(left) || /^[A-Za-z0-9]/.test(right);
    return needsSpace ? `${left} ${right}` : left + right;
  });
}

const CONTACT_LABELS: Record<ContactElement["kind"], string> = {
  no: "a 接点",
  nc: "b 接点",
  rise: "立ち上がり接点",
};

/** 接点 1 つを読む。「X0 の a 接点」 */
function describeContact(el: ContactElement, labels: Labels, notation: Notation): string {
  return ja(deviceWithLabel(el.device, labels, notation), "の", CONTACT_LABELS[el.kind]);
}

/** コイル 1 つを読む。種類ごとに設定値も添える */
function describeCoil(el: CoilElement, labels: Labels, notation: Notation): string {
  const device = deviceWithLabel(el.device, labels, notation);
  switch (el.kind) {
    case "out":
      return ja(device, "の出力コイル");
    case "pulse":
      return ja(device, "の立ち上がり微分コイル");
    case "timer":
      return ja(device, `のタイマコイル、設定 ${formatSeconds(el.presetMs)} 秒`);
    case "counter":
      return ja(device, `のカウンタコイル、設定 ${el.preset} 回`);
    case "reset":
      return ja(device, "のリセットコイル");
  }
}

/** 「1.5」のように、余計な 0 を付けずに秒を書く */
function formatSeconds(ms: number): string {
  return String(Math.round(ms / 100) / 10);
}

type Labels = Record<string, string> | undefined;

/** 「X0(起動ボタン)」。説明が無ければデバイス名だけ */
function deviceWithLabel(device: string, labels: Labels, notation: Notation): string {
  const name = formatDevice(device as DeviceId, notation);
  const label = labels?.[device];
  return label ? `${name}(${label})` : name;
}

export type DescribeOptions = {
  /** デバイス名の説明(例: X0 →「起動ボタン」) */
  deviceLabels?: Record<string, string> | undefined;
  /** 動かしているときの通電状態。あれば各行に「通電中 / 無電圧」を添える */
  power?: PowerMap | undefined;
  /** デバイス名の書き方(S-028)。既定は X0 / Y0 形式 */
  notation?: Notation | undefined;
};

/**
 * 1 行ぶんの文章。「1 行目、X0 の a 接点、Y0 の出力コイル」
 *
 * 空の行は「何も置かれていません」と言う。黙って飛ばすと、
 * 何行目の話をしているのか分からなくなる。
 */
export function describeRow(circuit: Circuit, row: number, options: DescribeOptions = {}): string {
  const notation = options.notation ?? DEFAULT_NOTATION;
  const cells = cellMap(circuit);
  const parts: string[] = [];

  for (let col = 0; col < circuit.cols; col++) {
    const cell = cells.get(cellKey(row, col));
    const el = cell?.element;
    if (el?.type === "contact") parts.push(describeContact(el, options.deviceLabels, notation));
    else if (el?.type === "coil") parts.push(describeCoil(el, options.deviceLabels, notation));
    // 配線(wire)は読まない。「つながっている」ことは順番で分かるので、
    // 一つずつ読み上げると要素の間に「配線」が挟まって聞き取りにくくなる

    // 縦線は分岐なので、これは言う。並列は回路の意味そのもの
    if (cell?.vline) parts.push(`ここから ${row + 2} 行目へ分岐`);
  }

  const head = `${row + 1} 行目`;
  if (parts.length === 0) return `${head}、何も置かれていません`;

  const flowing = rowIsFlowing(options.power, row, circuit.cols);
  const state = flowing === undefined ? "" : flowing ? "、通電中" : "、無電圧";
  return `${head}、${parts.join("、")}${state}`;
}

/** その行に電流が流れているか。power が無ければ undefined(止まっている・編集中) */
function rowIsFlowing(power: PowerMap | undefined, row: number, cols: number): boolean | undefined {
  if (!power) return undefined;
  const cells = power.cells[row];
  if (!cells) return false;
  for (let col = 0; col < cols; col++) {
    if (cells[col]) return true;
  }
  return false;
}

/**
 * 回路全体の文章。SVG の `aria-label` に載せる。
 *
 * 「3 行 4 列のラダー図。1 行目、…。2 行目、…」
 */
export function describeCircuit(circuit: Circuit, options: DescribeOptions = {}): string {
  const rows = Array.from({ length: circuit.rows }, (_, row) => describeRow(circuit, row, options));
  return `${circuit.rows} 行 ${circuit.cols} 列のラダー図。${rows.join("。")}`;
}

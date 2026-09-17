import { type DeviceId, deviceNumber, deviceType } from "./schema/device.js";

/**
 * 表記(アドレス体系と記号の書き方)の切り替え(S-028)。
 *
 * **回路データそのものは変えない。** 内部のデバイス名は `X0` / `Y0` のままで、
 * 画面に出すときだけ別の書き方に変換する。判定・問題データ・API に影響しない。
 *
 * タブ名に**メーカー名は使わない**(SPEC.md §3.1: 特定メーカーの製品名・画面
 * デザインは模倣しない)。「どこの会社の書き方か」ではなく「どういう書き方か」で名付ける。
 * 番地の割り付けは**よくある一例**であって、特定機種の仕様書ではない。
 */
export const NOTATIONS = ["standard", "cio", "iec"] as const;
export type Notation = (typeof NOTATIONS)[number];

export type NotationInfo = {
  id: Notation;
  /** タブに出す短い名前 */
  label: string;
  /** どういう書き方かの説明 */
  description: string;
};

export const NOTATION_INFO: Record<Notation, NotationInfo> = {
  standard: {
    id: "standard",
    label: "X0 / Y0",
    description:
      "国内の PLC でよく見る書き方。入力 X・出力 Y・内部リレー M・タイマ T・カウンタ C に番号を付ける。",
  },
  cio: {
    id: "cio",
    label: "0.00 / 100.00",
    description:
      "入出力を「ワード.ビット」で表す書き方。入力は 0.00 から、出力は 100.00 から、内部リレーは W0.00 から割り付けた例。設定値は # 付きで書く。",
  },
  iec: {
    id: "iec",
    label: "IEC 61131-3",
    description:
      "国際規格 IEC 61131-3(JIS B 3503)の書き方。立ち上がり接点は P、設定値は PT(時間)・PV(回数)で書く。",
  },
};

/** 「ワード.ビット」形式。16 点で 1 ワード繰り上がる */
function wordBit(offset: number, n: number): string {
  const word = offset + Math.floor(n / 16);
  const bit = String(n % 16).padStart(2, "0");
  return `${word}.${bit}`;
}

/**
 * デバイス名を表示用の文字列にする。
 *
 * IEC はデバイス名の書き方を決めていない(変数名は利用者が付ける)ので、
 * `X0` をそのまま変数名として使う
 */
export function formatDevice(id: DeviceId, notation: Notation): string {
  if (notation !== "cio") return id;
  const n = deviceNumber(id);
  switch (deviceType(id)) {
    case "X":
      return wordBit(0, n);
    case "Y":
      return wordBit(100, n);
    case "M":
      return `W${wordBit(0, n)}`;
    case "T":
      return `T${String(n).padStart(4, "0")}`;
    case "C":
      return `C${String(n).padStart(4, "0")}`;
  }
}

/** タイマの設定値。ラダー図のコイルの脇に出す */
export function formatTimerPreset(presetMs: number, notation: Notation): string {
  const sec = presetMs / 1000;
  switch (notation) {
    case "standard":
      return `${sec.toFixed(1)}s`;
    // 0.1 秒を 1 として数える書き方。3 秒なら #0030
    case "cio":
      return `#${String(Math.round(presetMs / 100)).padStart(4, "0")}`;
    case "iec":
      return `PT ${sec.toFixed(1)}s`;
  }
}

/** カウンタの設定値 */
export function formatCounterPreset(preset: number, notation: Notation): string {
  switch (notation) {
    case "standard":
      return `×${preset}`;
    case "cio":
      return `#${String(preset).padStart(4, "0")}`;
    case "iec":
      return `PV ${preset}`;
  }
}

/** 立ち上がり接点の中に描く文字 */
export function risingMark(notation: Notation): string {
  return notation === "iec" ? "P" : "↑";
}

/** 文章の中のデバイス名(`X0` など)を、その表記に置き換える */
export function formatDeviceNames(text: string, notation: Notation): string {
  if (notation !== "cio") return text;
  return text.replace(/\b([XYMTC])(\d{1,3})\b/g, (whole, type: string, num: string) => {
    const id = `${type}${Number(num)}` as DeviceId;
    // 前後に数字が付いた別の語(X1000 など)は置き換えない
    return Number(num) > 999 ? whole : formatDevice(id, notation);
  });
}

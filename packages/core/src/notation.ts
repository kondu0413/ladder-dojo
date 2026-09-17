import { type DeviceId, deviceNumber, deviceType } from "./schema/device.js";

/**
 * 表記(アドレス体系と記号の書き方)の切り替え(S-028)。
 *
 * **回路データそのものは変えない。** 内部のデバイス名は `X0` / `Y0` のままで、
 * 画面に出すときだけ別の書き方に変換する。判定・問題データ・API に影響しない。
 *
 * 選択肢の名前には**メーカー名を使う**(SPEC.md §3.1、2026-09-17 改訂)。
 * 「どういう書き方か」だけでは、自分の現場がどれに当たるのか分からないため。
 * ただし**製品の画面・ロゴ・UI は模倣しない**。ここでやるのは、その系統の現場で
 * よく使われる**書き方**に表示を合わせることだけで、特定機種の仕様書どおりではない。
 */
export const NOTATIONS = ["mitsubishi", "omron", "iec"] as const;
export type Notation = (typeof NOTATIONS)[number];

/** 既定の表記。国内の教材で最もよく見る書き方 */
export const DEFAULT_NOTATION: Notation = "mitsubishi";

export type NotationInfo = {
  id: Notation;
  /** タブに出す短い名前 */
  label: string;
  /** どういう書き方かの説明 */
  description: string;
};

export const NOTATION_INFO: Record<Notation, NotationInfo> = {
  mitsubishi: {
    id: "mitsubishi",
    label: "三菱系",
    description:
      "入力 X・出力 Y・内部リレー M・タイマ T・カウンタ C に番号を付ける書き方。設定値は K 付きで、タイマは 0.1 秒を 1 として数える(3 秒なら K30)。",
  },
  omron: {
    id: "omron",
    label: "オムロン系",
    description:
      "入出力を「ワード.ビット」で表す書き方。入力は 0.00 から、出力は 100.00 から、内部リレーは W0.00 から割り付けた例。設定値は # 付きで、タイマは 0.1 秒を 1 として数える(3 秒なら #0030)。",
  },
  iec: {
    id: "iec",
    label: "IEC 61131-3",
    description:
      "国際規格 IEC 61131-3(JIS B 3503)に寄せた書き方。立ち上がり接点は P、設定値は PT(時間)・PV(回数)と呼ぶ。規格どおりならタイマ・カウンタは TON / CTU の箱で描くところを、ここではコイルのまま出している。",
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
  if (notation !== "omron") return id;
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

/**
 * タイマの設定値。ラダー図のコイルの脇に出す。
 *
 * 三菱系・オムロン系とも **0.1 秒を 1 として数える**書き方にしている
 * (3 秒 = 30)。タイマの種類によって刻みが違う機種もあるが、ここでは
 * 最もよく使われる 100ms 刻みに揃える
 */
export function formatTimerPreset(presetMs: number, notation: Notation): string {
  const sec = presetMs / 1000;
  /**
   * 0.1 秒を 1 として数えた値。**0 にはしない**(S-034)。
   * スキーマはタイマを 1ms から許すので、素直に丸めると 0.05 秒が「K0」になり、
   * 設定されていないように読めてしまう。0.1 秒未満は 1 に寄せる
   */
  const tenths = Math.max(1, Math.round(presetMs / 100));
  switch (notation) {
    case "mitsubishi":
      return `K${tenths}`;
    case "omron":
      return `#${String(tenths).padStart(4, "0")}`;
    case "iec":
      // IEC は秒で書くので丸めずに済む。0.1 秒未満はそのまま細かく出す
      return `PT ${sec < 0.1 ? sec : sec.toFixed(1)}s`;
  }
}

/** カウンタの設定値 */
export function formatCounterPreset(preset: number, notation: Notation): string {
  switch (notation) {
    case "mitsubishi":
      return `K${preset}`;
    case "omron":
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
  if (notation !== "omron") return text;
  return text.replace(/\b([XYMTC])(\d{1,3})\b/g, (whole, type: string, num: string) => {
    const id = `${type}${Number(num)}` as DeviceId;
    // 前後に数字が付いた別の語(X1000 など)は置き換えない
    return Number(num) > 999 ? whole : formatDevice(id, notation);
  });
}

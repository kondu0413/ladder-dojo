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
 * 表示用の書き方からデバイス名に戻す(S-050)。`formatDevice` の逆。
 *
 * 編集画面の番号の欄は内部の番号(X100)で動いていて、オムロン系では「6.04」と
 * 表示されるので、「100.00」(= Y0)を置きたい人には壊れて見えた。表記のままの
 * 名前を打てるようにする。どの表記でも内部の書き方(X0 / Y0)は受け付ける。
 * 空白と大文字小文字は気にしない。読めなければ undefined
 */
export function parseDevice(text: string, notation: Notation): DeviceId | undefined {
  // 全角(Ｘ０、１００．００)も読む(日本語入力のまま打つことがある、S-053)
  const t = text.normalize("NFKC").trim().toUpperCase();
  const inRange = (n: number) => n >= 0 && n <= 999;
  const plain = /^([XYMTC])(\d{1,3})$/.exec(t);
  if (plain?.[1] && plain[2] !== undefined) {
    const n = Number(plain[2]);
    return inRange(n) ? (`${plain[1]}${n}` as DeviceId) : undefined;
  }
  if (notation !== "omron") return undefined;
  // ワード.ビット(入力は 0〜、出力は 100〜、内部リレーは W0〜)。ビットは 00〜15
  const wb = /^(W?)(\d{1,3})\.(\d{1,2})$/.exec(t);
  if (wb?.[2] !== undefined && wb[3] !== undefined) {
    const word = Number(wb[2]);
    const bit = Number(wb[3]);
    if (bit > 15) return undefined;
    if (wb[1] === "W") {
      const n = word * 16 + bit;
      return inRange(n) ? (`M${n}` as DeviceId) : undefined;
    }
    if (word >= 100) {
      const n = (word - 100) * 16 + bit;
      return inRange(n) ? (`Y${n}` as DeviceId) : undefined;
    }
    const n = word * 16 + bit;
    return inRange(n) ? (`X${n}` as DeviceId) : undefined;
  }
  // T0000 / C0005
  const tc = /^([TC])(\d{1,4})$/.exec(t);
  if (tc?.[1] && tc[2] !== undefined) {
    const n = Number(tc[2]);
    return inRange(n) ? (`${tc[1]}${n}` as DeviceId) : undefined;
  }
  return undefined;
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

/** 立ち下がり接点の中に描く文字(S-044)。IEC は N(negative transition) */
export function fallingMark(notation: Notation): string {
  return notation === "iec" ? "N" : "↓";
}

/** 文章の中のデバイス名(`X0` など)を、その表記に置き換える */
export function formatDeviceNames(text: string, notation: Notation): string {
  if (notation !== "omron") return text;
  // 4 桁以上の番号(X1000 など)や英字が続く語は \b と \d{1,3} の組で除かれる
  return text.replace(/\b([XYMTC])(\d{1,3})\b/g, (_whole, type: string, num: string) =>
    formatDevice(`${type}${Number(num)}` as DeviceId, notation),
  );
}

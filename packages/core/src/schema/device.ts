import { z } from "zod";

/** デバイス種別: X 入力 / Y 出力 / M 内部リレー / T タイマ / C カウンタ(SPEC.md §3.1) */
export const DEVICE_TYPES = ["X", "Y", "M", "T", "C"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** デバイス名。`X0`, `Y12`, `M3`, `T0`, `C1` のように「種別 + 10 進番号(0〜999)」 */
export type DeviceId = `${DeviceType}${number}`;

const DEVICE_RE = /^[XYMTC](0|[1-9]\d{0,2})$/;

export function isDeviceId(value: unknown): value is DeviceId {
  return typeof value === "string" && DEVICE_RE.test(value);
}

export function deviceType(id: DeviceId): DeviceType {
  return id[0] as DeviceType;
}

export function deviceNumber(id: DeviceId): number {
  return Number(id.slice(1));
}

function deviceSchemaOf(types: readonly DeviceType[], label: string) {
  return z.custom<DeviceId>((v) => isDeviceId(v) && types.includes(deviceType(v)), {
    message: `${label}(${types.join("/")} + 番号)の形式ではありません`,
  });
}

/** 任意のデバイス(接点の参照先) */
export const deviceIdSchema = deviceSchemaOf(DEVICE_TYPES, "デバイス名");
/** 入力デバイス(ユーザーが操作できるもの) */
export const inputDeviceSchema = deviceSchemaOf(["X"], "入力デバイス");
/** 出力コイルの対象(Y または M) */
export const bitCoilDeviceSchema = deviceSchemaOf(["Y", "M"], "コイルの対象");
/** タイマ */
export const timerDeviceSchema = deviceSchemaOf(["T"], "タイマ");
/** カウンタ */
export const counterDeviceSchema = deviceSchemaOf(["C"], "カウンタ");
/** RST の対象。カウンタのほか、SET で保持したビット(Y / M)も戻せる(S-044) */
export const resettableDeviceSchema = deviceSchemaOf(["Y", "M", "C"], "リセットの対象");
/** 期待値として指定できるデバイス(X 以外) */
export const observableDeviceSchema = deviceSchemaOf(["Y", "M", "T", "C"], "観測デバイス");

/** 種別ごとの並び順で比較する(X0, X1, ..., Y0, ...) */
export function compareDeviceId(a: DeviceId, b: DeviceId): number {
  const ta = DEVICE_TYPES.indexOf(deviceType(a));
  const tb = DEVICE_TYPES.indexOf(deviceType(b));
  if (ta !== tb) return ta - tb;
  return deviceNumber(a) - deviceNumber(b);
}

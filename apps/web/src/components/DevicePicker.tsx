import {
  type Circuit,
  compareDeviceId,
  DEVICE_TYPES,
  type DeviceId,
  type DeviceType,
  deviceNumber,
  deviceType,
  formatDevice,
  isDeviceId,
  listDevices,
  parseDevice,
} from "@ladder-dojo/core";
import { useEffect, useMemo, useState } from "react";
import { useNotation } from "../lib/notation-context.jsx";
import { Label, Segmented } from "./ui.js";

/**
 * 置く部品のデバイスを選ぶ(S-050)。
 *
 * 以前は「種類 + 内部の番号を +/− で 1 ずつ」だった。オムロン系の表記では内部の
 * 番号(X100)と画面の名前(6.04)が食い違い、「100.00」(= Y0)を置きたい人には
 * 壊れて見えた。100 まで +/− を押すのも大変だった(人間の指摘)。
 *
 * - **回路にあるデバイス(と問題のデバイス)をタップで選ぶ**。自己保持の接点など、
 *   同じデバイスをもう一度使うのがいちばん多い
 * - **表記のままの名前を直接打つ**。オムロン系で 100.00 と打てば Y0 になり、種類も変わる
 * - +/− は残す(隣の番号に動かすとき)
 */
export type DevicePickerProps = {
  circuit: Circuit;
  value: DeviceId;
  onChange: (device: DeviceId) => void;
  /** 問題のデバイスの説明。あればそのデバイスも候補に出す */
  deviceLabels?: Record<string, string> | undefined;
};

export function DevicePicker({ circuit, value, onChange, deviceLabels }: DevicePickerProps) {
  const { notation } = useNotation();
  const type = deviceType(value);
  const number = deviceNumber(value);
  const shown = formatDevice(value, notation);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // 外(+/−、チップ、表記の切り替え)で変わったら欄も合わせる。打っている最中は触らない
  useEffect(() => {
    if (focused) return;
    setText(shown);
    setInvalid(false);
  }, [shown, focused]);

  const candidates = useMemo(() => {
    const ids = new Set<DeviceId>(listDevices(circuit));
    for (const key of Object.keys(deviceLabels ?? {})) if (isDeviceId(key)) ids.add(key);
    return [...ids].sort(compareDeviceId);
  }, [circuit, deviceLabels]);

  /** いまの種類で、まだ使っていないいちばん小さい番号 */
  const nextFree = useMemo(() => {
    const used = new Set(
      candidates.filter((d) => deviceType(d) === type).map((d) => deviceNumber(d)),
    );
    let n = 0;
    while (used.has(n)) n++;
    return `${type}${n}` as DeviceId;
  }, [candidates, type]);

  const apply = (raw: string): boolean => {
    const trimmed = raw.trim();
    // 数字だけなら、いまの種類の番号として読む
    const parsed =
      parseDevice(trimmed, notation) ??
      (/^\d{1,3}$/.test(trimmed) ? (`${type}${Number(trimmed)}` as DeviceId) : undefined);
    if (!parsed) return false;
    if (parsed !== value) onChange(parsed);
    return true;
  };

  const stepBtn =
    "flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40";

  return (
    <section className="flex flex-col gap-2">
      <Label>デバイス</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<DeviceType>
          mono
          label="デバイスの種類"
          value={type}
          onChange={(t) => onChange(`${t}${number}` as DeviceId)}
          options={DEVICE_TYPES.map((t) => ({
            value: t,
            label: t,
            testId: `device-type-${t}`,
          }))}
        />
        <div
          className={`inline-flex items-stretch overflow-hidden rounded-lg border bg-white ${
            invalid ? "border-rose-400" : "border-slate-300"
          }`}
        >
          <button
            type="button"
            data-testid="device-number-dec"
            aria-label="番号を減らす"
            disabled={number <= 0}
            onClick={() => onChange(`${type}${number - 1}` as DeviceId)}
            className={stepBtn}
          >
            <span aria-hidden="true" className="text-base leading-none">
              −
            </span>
          </button>
          <input
            data-testid="current-device"
            aria-label="デバイス名(表記のまま打てます)"
            aria-invalid={invalid || undefined}
            value={text}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            size={8}
            onFocus={(e) => {
              setFocused(true);
              e.currentTarget.select();
            }}
            onChange={(e) => {
              setText(e.target.value);
              setInvalid(!apply(e.target.value));
            }}
            onBlur={() => {
              setFocused(false);
              setText(shown);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              // 日本語入力の確定の Enter で欄を閉じない(閉じると入力途中の文字が残って壊れる、S-053)
              if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
            }}
            onCompositionEnd={(e) => {
              setText(e.currentTarget.value);
              setInvalid(!apply(e.currentTarget.value));
            }}
            className="w-24 border-x border-slate-200 bg-slate-50 px-2 text-center font-mono text-sm font-semibold text-slate-900 outline-none focus:bg-amber-50"
          />
          <button
            type="button"
            data-testid="device-number-inc"
            aria-label="番号を増やす"
            disabled={number >= 999}
            onClick={() => onChange(`${type}${number + 1}` as DeviceId)}
            className={stepBtn}
          >
            <span aria-hidden="true" className="text-base leading-none">
              ＋
            </span>
          </button>
        </div>
      </div>
      {invalid && (
        <p className="text-xs text-rose-700" data-testid="device-invalid">
          読めない名前です。例: {formatDevice(value, notation)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5" data-testid="device-chips">
        {candidates.map((d) => {
          const active = d === value;
          const label = deviceLabels?.[d];
          return (
            <button
              key={d}
              type="button"
              data-testid={`device-chip-${d}`}
              aria-pressed={active}
              onClick={() => onChange(d)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
                active
                  ? "border-amber-400 bg-amber-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              <span className="font-mono font-semibold">{formatDevice(d, notation)}</span>
              {label && <span className="text-slate-500">{label}</span>}
            </button>
          );
        })}
        <button
          type="button"
          data-testid="device-chip-next"
          onClick={() => onChange(nextFree)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 text-xs text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
        >
          <span>次の空き</span>
          <span className="font-mono font-semibold">{formatDevice(nextFree, notation)}</span>
        </button>
      </div>
    </section>
  );
}

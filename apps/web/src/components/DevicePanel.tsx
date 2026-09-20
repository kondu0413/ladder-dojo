import type { Circuit, DeviceId, Snapshot } from "@ladder-dojo/core";
import { devicePresets } from "@ladder-dojo/core";
import { useMemo } from "react";
import type { InputControl } from "../hooks/useSimulator.js";
import { useNotation } from "../lib/notation-context.jsx";
import { Label } from "./ui.js";

export type DevicePanelProps = {
  devices: DeviceId[];
  snapshot: Snapshot;
  /** タイマ・カウンタの設定値を「3 / 5」と出すために使う。省略すると現在値だけ */
  circuit?: Circuit | undefined;
  deviceLabels?: Record<string, string> | undefined;
  /**
   * 入力の操作。**省略すると読み取り専用**になる。
   * 再生中(ScenarioReplay)は駒どおりの状態を見せているので、
   * ここで触れると表示と中身がずれる
   */
  input?: InputControl | undefined;
};

/**
 * デバイスの状態一覧。
 *
 * 入力(X)は**押しボタン**として扱う。押している間だけ ON で、離すと OFF になる(S-027)。
 * ずっと ON にしたいときは「保持」を使う。スマホでの操作を前提にしている(SPEC.md §3.1)
 */
export function DevicePanel({ devices, snapshot, circuit, deviceLabels, input }: DevicePanelProps) {
  const inputs = devices.filter((d) => d.startsWith("X"));
  const outputs = devices.filter((d) => !d.startsWith("X"));
  const presets = useMemo(() => (circuit ? devicePresets(circuit) : undefined), [circuit]);
  const notation = useNotation();

  return (
    <div className="flex flex-col gap-4">
      {inputs.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>{input ? "入力(押している間だけ ON)" : "入力"}</Label>
          <div className="flex flex-wrap gap-2">
            {inputs.map((d) => {
              const on = snapshot.bits[d] ?? false;
              const cls = `flex min-h-12 min-w-[5.5rem] flex-col items-start justify-center rounded-xl border-2 px-3 py-1.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-100 ${
                on
                  ? "theme-fixed border-amber-400 bg-amber-300 text-slate-950 shadow-glow"
                  : "border-slate-300 bg-white text-slate-700"
              }`;
              const body = (
                <>
                  <span className="font-mono text-sm font-semibold leading-tight">
                    {notation.device(d)}
                  </span>
                  {deviceLabels?.[d] && (
                    <span className="text-[11px] font-normal leading-tight opacity-70">
                      {deviceLabels[d]}
                    </span>
                  )}
                </>
              );
              // 押せないときはボタンにしない。見た目だけ押せそうなものを置くと、
              // 押しても何も起きなくて壊れていると思われる
              if (!input) {
                return (
                  <span key={d} data-device={d} data-on={on} className={cls}>
                    {body}
                  </span>
                );
              }
              return (
                <InputButton
                  key={d}
                  device={d}
                  shown={notation.device(d)}
                  on={on}
                  input={input}
                  className={`${cls} cursor-pointer select-none active:translate-y-px hover:border-slate-400`}
                  body={body}
                />
              );
            })}
          </div>
        </section>
      )}

      {outputs.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>出力・内部</Label>
          <div className="flex flex-wrap gap-2">
            {outputs.map((d) => (
              <DeviceChip
                key={d}
                device={d}
                shown={notation.device(d)}
                snapshot={snapshot}
                presets={presets}
                label={deviceLabels?.[d]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * 入力 1 つぶんのボタン。
 *
 * 押している間だけ ON にする(S-027)。キーボードでも押しっぱなしにできるように
 * Space / Enter の押し下げと離しも拾う。ずっと ON にしたいときは「保持」。
 */
function InputButton({
  device,
  shown,
  on,
  input,
  className,
  body,
}: {
  device: DeviceId;
  /** 表記に合わせた名前(読み上げ用、S-052) */
  shown: string;
  on: boolean;
  input: InputControl;
  className: string;
  body: React.ReactNode;
}) {
  const held = input.held.includes(device);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid={`input-${device}`}
        data-on={on}
        aria-pressed={on}
        onPointerDown={() => input.press(device)}
        onPointerUp={() => input.release(device)}
        onPointerLeave={() => input.release(device)}
        onPointerCancel={() => input.release(device)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            // キーの長押しは押すを繰り返さない(記録が溢れる、S-053)
            if (e.repeat) return;
            input.press(device);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") input.release(device);
        }}
        className={className}
      >
        {body}
      </button>
      <button
        type="button"
        data-testid={`hold-${device}`}
        aria-pressed={held}
        aria-label={`押したままにする(${shown})`}
        onClick={() => input.toggleHold(device)}
        className={`min-h-9 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
          held
            ? "border-amber-400 bg-amber-100 text-amber-900"
            : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
        }`}
      >
        {held ? "保持中" : "保持"}
      </button>
    </div>
  );
}

function DeviceChip({
  device,
  shown,
  snapshot,
  presets,
  label,
}: {
  device: DeviceId;
  /** 表記に合わせた表示名(S-028) */
  shown: string;
  snapshot: Snapshot;
  presets?: { timers: Record<string, number>; counters: Record<string, number> } | undefined;
  label?: string | undefined;
}) {
  const timer = snapshot.timers[device];
  const counter = snapshot.counters[device];
  const on = timer?.done ?? counter?.done ?? snapshot.bits[device] ?? false;
  // 現在値だけだと「あと何回で完了するのか」が読めないので、設定値も並べて出す(S-027)
  const timerPreset = presets?.timers[device];
  const counterPreset = presets?.counters[device];
  const detail = timer
    ? `${(timer.elapsedMs / 1000).toFixed(1)}${
        timerPreset === undefined ? "" : ` / ${(timerPreset / 1000).toFixed(1)}`
      }s`
    : counter
      ? `${counter.count}${counterPreset === undefined ? "" : ` / ${counterPreset}`} 回`
      : label;

  return (
    <div
      data-testid={`device-${device}`}
      data-on={on}
      className={`flex min-h-12 min-w-[5.5rem] items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-colors ${
        on
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full transition-[background-color,box-shadow] ${
          on ? "bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.3)]" : "bg-slate-300"
        }`}
      />
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-sm font-semibold">{shown}</span>
        {detail && <span className="text-[11px] tabular-nums opacity-70">{detail}</span>}
      </span>
    </div>
  );
}

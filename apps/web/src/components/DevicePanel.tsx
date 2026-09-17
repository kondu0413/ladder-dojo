import type { Circuit, DeviceId, Snapshot } from "@ladder-dojo/core";
import { devicePresets } from "@ladder-dojo/core";
import { useMemo } from "react";
import type { InputControl } from "../hooks/useSimulator.js";

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

  return (
    <div className="flex flex-col gap-3">
      {inputs.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-slate-500">
            {input ? "入力(押している間だけ ON)" : "入力"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {inputs.map((d) => {
              const on = snapshot.bits[d] ?? false;
              const cls = `min-h-11 min-w-20 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                on
                  ? "border-amber-500 bg-amber-400 text-amber-950"
                  : "border-slate-300 bg-white text-slate-600"
              }`;
              const body = (
                <>
                  <span className="block font-mono">{d}</span>
                  {deviceLabels?.[d] && (
                    <span className="block text-[10px] font-normal opacity-70">
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
                <InputButton key={d} device={d} on={on} input={input} className={cls} body={body} />
              );
            })}
          </div>
        </section>
      )}

      {outputs.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-slate-500">出力・内部</h3>
          <div className="flex flex-wrap gap-2">
            {outputs.map((d) => (
              <DeviceChip
                key={d}
                device={d}
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
  on,
  input,
  className,
  body,
}: {
  device: DeviceId;
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
        aria-label={`押したままにする(${device})`}
        onClick={() => input.toggleHold(device)}
        className={`min-h-11 rounded-lg border px-2 text-[11px] font-medium ${
          held
            ? "border-amber-500 bg-amber-100 text-amber-900"
            : "border-slate-200 bg-slate-50 text-slate-500"
        }`}
      >
        保持
      </button>
    </div>
  );
}

function DeviceChip({
  device,
  snapshot,
  presets,
  label,
}: {
  device: DeviceId;
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
      className={`min-h-11 min-w-20 rounded-lg border px-3 py-2 text-sm ${
        on
          ? "border-amber-500 bg-amber-100 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span className="block font-mono font-medium">{device}</span>
      {detail && <span className="block text-[10px] opacity-70">{detail}</span>}
    </div>
  );
}

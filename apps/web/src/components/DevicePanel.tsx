import type { DeviceId, Snapshot } from "@ladder-dojo/core";

export type DevicePanelProps = {
  devices: DeviceId[];
  snapshot: Snapshot;
  deviceLabels?: Record<string, string>;
  onToggleInput: (device: DeviceId) => void;
};

/** デバイスの状態一覧。入力(X)はタップで ON/OFF できる(スマホ操作を前提、SPEC.md §3.1) */
export function DevicePanel({ devices, snapshot, deviceLabels, onToggleInput }: DevicePanelProps) {
  const inputs = devices.filter((d) => d.startsWith("X"));
  const outputs = devices.filter((d) => !d.startsWith("X"));

  return (
    <div className="flex flex-col gap-3">
      {inputs.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-slate-500">入力(タップで操作)</h3>
          <div className="flex flex-wrap gap-2">
            {inputs.map((d) => {
              const on = snapshot.bits[d] ?? false;
              return (
                <button
                  key={d}
                  type="button"
                  onPointerDown={() => onToggleInput(d)}
                  aria-pressed={on}
                  className={`min-h-11 min-w-20 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    on
                      ? "border-amber-500 bg-amber-400 text-amber-950"
                      : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  <span className="block font-mono">{d}</span>
                  {deviceLabels?.[d] && (
                    <span className="block text-[10px] font-normal opacity-70">
                      {deviceLabels[d]}
                    </span>
                  )}
                </button>
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
              <DeviceChip key={d} device={d} snapshot={snapshot} label={deviceLabels?.[d]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DeviceChip({
  device,
  snapshot,
  label,
}: {
  device: DeviceId;
  snapshot: Snapshot;
  label?: string | undefined;
}) {
  const timer = snapshot.timers[device];
  const counter = snapshot.counters[device];
  const on = timer?.done ?? counter?.done ?? snapshot.bits[device] ?? false;
  const detail = timer
    ? `${(timer.elapsedMs / 1000).toFixed(1)}s`
    : counter
      ? `${counter.count}`
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

import type { SimSpeed } from "../hooks/useSimulator.js";

export type SimulatorControlsProps = {
  speed: SimSpeed;
  running: boolean;
  onSpeed: (speed: SimSpeed) => void;
  onRunning: (running: boolean) => void;
  onReset: () => void;
};

const SPEEDS: Array<{ value: SimSpeed; label: string }> = [
  { value: 1, label: "1x" },
  { value: 5, label: "5x" },
  { value: "instant", label: "即時" },
];

/** シミュレータの操作(SPEC.md §5: タイマ速度は 1x / 5x / 即時) */
export function SimulatorControls({
  speed,
  running,
  onSpeed,
  onRunning,
  onReset,
}: SimulatorControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="sim-toggle-run"
        onClick={() => onRunning(!running)}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
      >
        {running ? "一時停止" : "再開"}
      </button>
      <button
        type="button"
        data-testid="sim-reset"
        onClick={onReset}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
      >
        リセット
      </button>
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {SPEEDS.map((s) => (
          <button
            key={String(s.value)}
            type="button"
            data-testid={`sim-speed-${s.value}`}
            onClick={() => onSpeed(s.value)}
            aria-pressed={speed === s.value}
            className={`min-h-11 px-3 text-sm font-medium ${
              speed === s.value ? "bg-slate-700 text-white" : "bg-white text-slate-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

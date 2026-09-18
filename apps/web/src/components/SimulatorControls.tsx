import type { SimSpeed } from "../hooks/useSimulator.js";
import { Button, Segmented } from "./ui.js";

export type SimulatorControlsProps = {
  speed: SimSpeed;
  running: boolean;
  onSpeed: (speed: SimSpeed) => void;
  onRunning: (running: boolean) => void;
  onReset: () => void;
};

type SpeedKey = "1" | "5" | "instant";

const SPEEDS: ReadonlyArray<{ value: SpeedKey; label: string }> = [
  { value: "1", label: "1x" },
  { value: "5", label: "5x" },
  { value: "instant", label: "即時" },
];

function toSpeed(key: SpeedKey): SimSpeed {
  return key === "instant" ? "instant" : key === "5" ? 5 : 1;
}

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
      <Button
        tone="secondary"
        icon={running ? "pause" : "play"}
        data-testid="sim-toggle-run"
        onClick={() => onRunning(!running)}
      >
        {running ? "一時停止" : "再開"}
      </Button>
      <Button tone="secondary" icon="reset" data-testid="sim-reset" onClick={onReset}>
        リセット
      </Button>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">タイマ</span>
        <Segmented<SpeedKey>
          label="タイマの速さ"
          value={String(speed) as SpeedKey}
          onChange={(v) => onSpeed(toSpeed(v))}
          options={SPEEDS.map((s) => ({
            value: s.value,
            label: s.label,
            testId: `sim-speed-${s.value}`,
          }))}
        />
      </div>
    </div>
  );
}

import type { SimSpeed } from "../hooks/useSimulator.js";
import { Button, Segmented } from "./ui.js";

export type SimulatorControlsProps = {
  speed: SimSpeed;
  running: boolean;
  onSpeed: (speed: SimSpeed) => void;
  onRunning: (running: boolean) => void;
  onReset: () => void;
  /** 一時停止中に 1 スキャン進める(S-038) */
  onStep: () => void;
  /** ここまでのスキャン数。1 スキャンずつ進めるときの目安 */
  scans: number;
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
  onStep,
  scans,
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
      {/* 止めている間だけ押せる。上から下へ評価される順番を、1 スキャンずつ目で追える */}
      <Button
        tone="secondary"
        icon="chevronRight"
        data-testid="sim-step"
        disabled={running}
        title={running ? "一時停止すると 1 スキャンずつ進められます" : "1 スキャン進める"}
        onClick={onStep}
      >
        1 スキャン
      </Button>
      <Button tone="secondary" icon="reset" data-testid="sim-reset" onClick={onReset}>
        リセット
      </Button>
      <span
        className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] tabular-nums text-slate-500"
        data-testid="sim-scans"
        title="ここまでのスキャン数"
      >
        {scans} scan
      </span>
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

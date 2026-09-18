import type { RecorderState } from "../hooks/useRecorder.js";
import { Button, Icon } from "./ui.js";

/**
 * 操作の記録(S-042)。「動かす」の下に置く。
 * 記録中は赤い点と手数を出し、「いまの出力を確認」と「終えてテストにする」を並べる。
 */
export function RecorderBar({
  recorder,
  disabled,
  onStop,
}: {
  recorder: RecorderState;
  /** 即時モードでは時間が記録できないので止める */
  disabled: boolean;
  onStop: () => void;
}) {
  if (!recorder.recording) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2">
        <Button
          tone="secondary"
          size="sm"
          icon="record"
          data-testid="record-start"
          disabled={disabled}
          title={disabled ? "「即時」では時間を記録できません。1x か 5x にしてください" : undefined}
          onClick={recorder.start}
        >
          操作を記録してテストにする
        </Button>
        <p className="text-xs leading-relaxed text-slate-500">
          回路を初期状態に戻してから、押した順番と時間をそのまま手順にします。
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="record-status"
      className="rise-in flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-rose-800">
        <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
        記録中
        <span className="font-mono text-xs font-normal tabular-nums text-rose-700">
          {recorder.count} 手
        </span>
      </span>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {recorder.hasOutputs && (
          <Button
            tone="success"
            size="sm"
            icon="check"
            data-testid="record-expect"
            onClick={recorder.expect}
          >
            いまの出力を確認に入れる
          </Button>
        )}
        <Button size="sm" data-testid="record-stop" onClick={onStop}>
          終えてテストにする
          <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </Button>
        <Button tone="ghost" size="sm" data-testid="record-cancel" onClick={recorder.cancel}>
          やめる
        </Button>
      </div>
    </div>
  );
}

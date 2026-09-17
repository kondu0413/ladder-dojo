import {
  type Circuit,
  describeStep,
  listDevices,
  replayScenario,
  type Step,
} from "@ladder-dojo/core";
import { useMemo, useState } from "react";
import { DevicePanel } from "./DevicePanel.js";
import { LadderView } from "./LadderView.js";
import { buttonClass } from "./ui.js";

/**
 * 設問の操作列をそのまま再生して見せる(S-022 / SPEC.md §3.2 (1))。
 *
 * 「読む」は予測して選ぶだけでは身につかない。**予測どおりになるのを目で見る**
 * ところまでが 1 つの学習で、そこが狙い(回路を目で追って動作を予測する力)。
 *
 * ここまでは自由操作のシミュレータしか無く、学習者が設問と同じ操作を自分で
 * 組み立て直す必要があった。設問には操作列(`scenario`)が入っているので、
 * そのまま流す。
 *
 * **1 駒ずつ手で送る**。自動再生だと、変わった瞬間を見逃したときに戻れない。
 */

export type ScenarioReplayProps = {
  circuit: Circuit;
  steps: readonly Step[];
  deviceLabels?: Record<string, string> | undefined;
};

export function ScenarioReplay({ circuit, steps, deviceLabels }: ScenarioReplayProps) {
  const { frames, stopped } = useMemo(() => replayScenario(circuit, steps), [circuit, steps]);
  // 自由操作のほうと同じ一覧にする。並びが変わると見比べにくい
  const devices = useMemo(() => listDevices(circuit), [circuit]);
  const [index, setIndex] = useState(0);
  const frame = frames[Math.min(index, frames.length - 1)];
  const last = index >= frames.length - 1;

  if (!frame) return null;

  const caption = frame.step ? describeStep(frame.step, deviceLabels) : "何も操作していない状態";

  return (
    <div className="flex flex-col gap-3" data-testid="scenario-replay">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700" data-testid="replay-caption">
          <span className="mr-2 text-xs font-semibold text-slate-400" data-testid="replay-position">
            {index + 1} / {frames.length}
          </span>
          {caption}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="replay-prev"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className={buttonClass("secondary", "px-3 disabled:opacity-40")}
          >
            戻る
          </button>
          <button
            type="button"
            data-testid="replay-next"
            disabled={last}
            onClick={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
            className={buttonClass("primary", "px-4 disabled:opacity-40")}
          >
            次の操作
          </button>
          <button
            type="button"
            data-testid="replay-restart"
            onClick={() => setIndex(0)}
            className={buttonClass("ghost", "px-3")}
          >
            最初から
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white p-2">
        <LadderView circuit={circuit} power={frame.power} deviceLabels={deviceLabels} />
      </div>

      <DevicePanel
        devices={devices}
        snapshot={frame.snapshot}
        circuit={circuit}
        deviceLabels={deviceLabels}
      />

      {stopped && (
        <p data-testid="replay-stopped" className="text-xs text-amber-800">
          {stopped === "unstable"
            ? "この回路は状態が落ち着かないため、途中で止めました。"
            : "スキャン数の上限に達したため、途中で止めました。"}
        </p>
      )}
    </div>
  );
}

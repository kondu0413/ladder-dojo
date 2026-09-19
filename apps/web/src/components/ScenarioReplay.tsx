import {
  type Circuit,
  describeFrame,
  describeRungTrace,
  findCoilConflicts,
  listDevices,
  replayScenario,
  type Step,
  startFrameIndex,
} from "@ladder-dojo/core";
import { useMemo, useState } from "react";
import { snapshotStates } from "../hooks/useSimulator.js";
import { useNotation } from "../lib/notation-context.jsx";
import { CoilConflictNote } from "./CoilConflictNote.js";
import { DevicePanel } from "./DevicePanel.js";
import { LadderView } from "./LadderView.js";
import { Button, Card } from "./ui.js";

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
 *
 * 同じデバイスに複数のコイルが書いている駒(SET と RST の両方に通電、二重コイル)では、
 * 図に「残る / 上書き」の印と理由を出し、**「1 行ずつ見る」でスキャンの中**
 * (1 行目のあとに ON、2 行目のあとに OFF)まで見せる(S-049)。
 */

export type ScenarioReplayProps = {
  circuit: Circuit;
  steps: readonly Step[];
  deviceLabels?: Record<string, string> | undefined;
  /**
   * steps の先頭いくつが設問の前提(済んでいる操作)か(S-048)。
   * 「そのあと X1 を押すと」の設問は、X0 の操作を済ませた駒から再生を始める。
   * 前の駒にも戻れる(前提の操作がどう効いたかを見返せる)
   */
  premiseSteps?: number | undefined;
};

export function ScenarioReplay({
  circuit,
  steps,
  deviceLabels,
  premiseSteps = 0,
}: ScenarioReplayProps) {
  const { frames, stopped } = useMemo(() => replayScenario(circuit, steps), [circuit, steps]);
  const start = useMemo(() => startFrameIndex(frames, premiseSteps), [frames, premiseSteps]);
  // 自由操作のほうと同じ一覧にする。並びが変わると見比べにくい
  const devices = useMemo(() => listDevices(circuit), [circuit]);
  const { notation } = useNotation();
  const [index, setIndex] = useState(start);
  /** スキャンの中を見ているときの行の位置。null なら見ていない(S-049) */
  const [rungAt, setRungAt] = useState<number | null>(null);
  const frame = frames[Math.min(index, frames.length - 1)];
  const last = index >= frames.length - 1;
  const conflicts = useMemo(
    () => (frame ? findCoilConflicts(circuit, frame.power) : []),
    [circuit, frame],
  );

  if (!frame) return null;

  const caption = describeFrame(frame, deviceLabels, notation);
  // 前提の駒には印を付ける。設問が問うている操作はスタート時点より後
  const phase = index < start ? "前提" : start > 0 && index === start ? "スタート時点" : undefined;
  // 駒を送ったらスキャンの中を見るのは閉じる
  const go = (i: number) => {
    setRungAt(null);
    setIndex(i);
  };
  const trace = rungAt === null ? undefined : frame.rungs[rungAt];
  const pendingRows =
    rungAt === null ? undefined : frame.rungs.slice(rungAt + 1).flatMap((r) => r.rows);
  const snapshot = trace ? trace.snapshot : frame.snapshot;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="scenario-replay"
      data-tracing={rungAt !== null}
    >
      {/* 図が先。操作のボタンは図の直下に置いて、押しながら変化を見られるようにする(S-046) */}
      <Card className="overflow-x-auto p-2 ring-2 ring-amber-400/40">
        <LadderView
          circuit={circuit}
          power={trace ? trace.power : frame.power}
          states={snapshotStates(snapshot)}
          deviceLabels={deviceLabels}
          conflicts={trace ? undefined : conflicts}
          focusRows={trace?.rows}
          pendingRows={pendingRows}
        />
      </Card>

      {trace && rungAt !== null ? (
        <div
          data-testid="rung-trace"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2"
        >
          <p
            className="flex items-center gap-2 text-sm font-medium text-amber-950"
            data-testid="rung-caption"
          >
            <span
              className="theme-fixed rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-300"
              data-testid="rung-position"
            >
              {rungAt + 1} / {frame.rungs.length}
            </span>
            {describeRungTrace(frame.rungs, rungAt, frame.snapshot, deviceLabels, notation)}
          </p>
          <div className="flex gap-2">
            <Button
              tone="secondary"
              size="sm"
              icon="arrowLeft"
              data-testid="rung-prev"
              disabled={rungAt === 0}
              onClick={() => setRungAt(rungAt - 1)}
            >
              前の行
            </Button>
            <Button
              tone="accent"
              size="sm"
              icon="arrowRight"
              data-testid="rung-next"
              disabled={rungAt >= frame.rungs.length - 1}
              onClick={() => setRungAt(rungAt + 1)}
            >
              次の行
            </Button>
            <Button
              tone="ghost"
              size="sm"
              icon="close"
              data-testid="rung-close"
              onClick={() => setRungAt(null)}
            >
              閉じる
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className="flex items-center gap-2 text-sm font-medium text-slate-800"
            data-testid="replay-caption"
          >
            <span
              className="theme-fixed rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-300"
              data-testid="replay-position"
            >
              {index + 1} / {frames.length}
            </span>
            {phase && (
              <span
                data-testid="replay-phase"
                className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900"
              >
                {phase}
              </span>
            )}
            {caption}
          </p>
          <div className="flex gap-2">
            <Button
              tone="secondary"
              size="sm"
              icon="arrowLeft"
              data-testid="replay-prev"
              disabled={index === 0}
              onClick={() => go(Math.max(0, index - 1))}
            >
              戻る
            </Button>
            <Button
              tone="accent"
              size="sm"
              icon="play"
              data-testid="replay-next"
              disabled={last}
              onClick={() => go(Math.min(frames.length - 1, index + 1))}
            >
              次の操作
            </Button>
            <Button
              tone="ghost"
              size="sm"
              icon="reset"
              data-testid="replay-restart"
              onClick={() => go(start)}
            >
              最初から
            </Button>
          </div>
        </div>
      )}

      <CoilConflictNote
        conflicts={conflicts}
        deviceLabels={deviceLabels}
        onTrace={rungAt === null && frame.rungs.length > 0 ? () => setRungAt(0) : undefined}
      />

      <DevicePanel
        devices={devices}
        snapshot={snapshot}
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

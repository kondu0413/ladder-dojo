import { type JudgeOptions, StepRunner } from "./judge/judge.js";
import { DEFAULT_NOTATION, formatDevice, type Notation } from "./notation.js";
import type { Circuit, DeviceId, Step } from "./schema/index.js";
import { type PowerMap, Simulator, type Snapshot } from "./sim/simulator.js";

/**
 * 操作列を 1 ステップずつ流し、その都度の通電状態を返す(S-022)。
 *
 * 「読む」問題の答え合わせで、**予測したあとに実際に動かして見せる**ために使う
 * (SPEC.md §3.2 (1))。画面はここが返した `power` を `LadderView` に渡すだけでよい。
 *
 * **自分でスキャンを回してはいけない**。判定は「時間を進めたあと、状態が落ち着くまで
 * 回す」(S-005 の settle)。1 スキャンだけ見ると、まだ反映されていない途中の値を
 * 読んでしまう。実際、監査用に手で回したときに正しい問題を誤判定しかけた。
 * ここでは判定そのものと同じ `StepRunner` を通すので、答え合わせと判定がずれない。
 */

export type ReplayFrame = {
  /** 何番目の操作か。-1 は操作前(初期状態) */
  index: number;
  /** この駒に至った操作。初期状態では undefined */
  step: Step | undefined;
  /** この時点の通電状態。ラダー図に渡す */
  power: PowerMap;
  snapshot: Snapshot;
  /** 仮想時間(ms) */
  elapsedMs: number;
};

export type ReplayResult = {
  frames: ReplayFrame[];
  /**
   * 途中で打ち切ったか。
   * - "unstable": 発振して落ち着かない
   * - "limit": スキャン数の上限に達した
   */
  stopped?: "unstable" | "limit";
};

/** 操作列を流して、各ステップ後の通電状態を集める */
export function replayScenario(
  circuit: Circuit,
  steps: readonly Step[],
  options: JudgeOptions = {},
): ReplayResult {
  const runner = new StepRunner(new Simulator(circuit), {
    scanMs: 10,
    recordTimeline: false,
    maxSettleScans: 100,
    maxScansPerCase: 200_000,
    // 再生は 1 つの操作列しか流さないので、合計の上限は使わない
    maxScansTotal: Number.POSITIVE_INFINITY,
    ...options,
  });

  // 最初に一度落ち着かせる。電源投入直後から ON になる回路があるので、
  // 「何も操作していない状態」も正しく見せる必要がある
  runner.settle();
  const frames: ReplayFrame[] = [
    {
      index: -1,
      step: undefined,
      power: runner.sim.power,
      snapshot: runner.sim.snapshot(),
      elapsedMs: runner.elapsedMs,
    },
  ];

  for (const [i, step] of steps.entries()) {
    // expect は答え合わせ用の印で、操作ではない。見せる意味がないので飛ばす
    if (step.type === "expect") continue;
    const outcome = runner.run(step);
    frames.push({
      index: i,
      step,
      power: runner.sim.power,
      snapshot: runner.sim.snapshot(),
      elapsedMs: runner.elapsedMs,
    });
    if (outcome !== "ok") return { frames, stopped: outcome };
  }
  return { frames };
}

/** 操作を日本語の一言にする(「X0 を押す」)。画面と読み上げの両方で使う */
export function describeStep(
  step: Step,
  labels?: Record<string, string>,
  notation: Notation = DEFAULT_NOTATION,
): string {
  const name = (device: string) => {
    const shown = formatDevice(device as DeviceId, notation);
    const label = labels?.[device];
    return label ? `${shown}(${label})` : shown;
  };
  switch (step.type) {
    case "set": {
      const parts = Object.entries(step.inputs).map(
        ([device, on]) => `${name(device)} を ${on ? "ON" : "OFF"} にする`,
      );
      return parts.join("、");
    }
    case "press":
      return `${name(step.device)} を押して離す`;
    case "wait":
      return `${formatMs(step.ms)} 待つ`;
    case "expect":
      return "答え合わせ";
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ミリ秒`;
  return `${Math.round(ms / 100) / 10} 秒`;
}

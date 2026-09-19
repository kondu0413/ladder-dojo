import { type JudgeOptions, StepRunner } from "./judge/judge.js";
import { DEFAULT_NOTATION, formatDevice, type Notation } from "./notation.js";
import { type Circuit, DEFAULT_HOLD_MS, type DeviceId, type Step } from "./schema/index.js";
import { type PowerMap, type RungTrace, Simulator, type Snapshot } from "./sim/simulator.js";

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
  /**
   * 「押して離す」は 2 駒に分ける(S-047)。down = 押している間、up = 離したあと。
   * 押している間しか通電しない回路(SET / RST・カウンタ・立ち上がり)で、
   * 離したあとの駒だけだと「何も起きていない」ように見える
   */
  phase?: "down" | "up";
  /** この時点の通電状態。ラダー図に渡す */
  power: PowerMap;
  snapshot: Snapshot;
  /** 仮想時間(ms) */
  elapsedMs: number;
  /**
   * この駒の状態で 1 スキャンを行ごとに区切った記録(S-049)。
   * 「1 行目まで実行 → Y0 は ON、2 行目まで実行 → OFF」と、スキャンの中を見せるために使う。
   * 落ち着いた状態からのスキャンなので、最後の要素の状態はこの駒と同じ
   */
  rungs: RungTrace[];
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
  // 駒の通電状態を先に取ってから traceScan を回す(traceScan は新しい通電マップを作る)
  const capture = (index: number, step: Step | undefined, phase?: "down" | "up"): ReplayFrame => {
    const power = runner.sim.power;
    const snapshot = runner.sim.snapshot();
    return {
      index,
      step,
      ...(phase ? { phase } : {}),
      power,
      snapshot,
      elapsedMs: runner.elapsedMs,
      rungs: runner.sim.traceScan(),
    };
  };
  const frames: ReplayFrame[] = [capture(-1, undefined)];

  for (const [i, step] of steps.entries()) {
    // expect は答え合わせ用の印で、操作ではない。見せる意味がないので飛ばす
    if (step.type === "expect") continue;
    if (step.type === "press") {
      // 押している間と離したあとを別の駒にする(S-047)。判定と同じ手順を半分ずつ通す
      const down = runner.pressDown(step.device);
      frames.push(capture(i, step, "down"));
      if (down !== "ok") return { frames, stopped: down };
      const up = runner.pressUp(step.device, step.holdMs ?? DEFAULT_HOLD_MS);
      frames.push(capture(i, step, "up"));
      if (up !== "ok") return { frames, stopped: up };
      continue;
    }
    const outcome = runner.run(step);
    frames.push(capture(i, step));
    if (outcome !== "ok") return { frames, stopped: outcome };
  }
  return { frames };
}

/** 駒の説明。「押して離す」は前半・後半で言い分ける(S-047) */
export function describeFrame(
  frame: Pick<ReplayFrame, "step" | "phase">,
  labels?: Record<string, string>,
  notation: Notation = DEFAULT_NOTATION,
): string {
  if (!frame.step) return "何も操作していない状態";
  if (frame.step.type === "press" && frame.phase) {
    const shown = formatDevice(frame.step.device, notation);
    const label = labels?.[frame.step.device];
    const name = label ? `${shown}(${label})` : shown;
    return frame.phase === "down" ? `${name} を押している` : `${name} を離した`;
  }
  return describeStep(frame.step, labels, notation);
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
      // 入力は押しボタン(S-027)。ON にする = 押したまま、OFF にする = 離す(S-049)
      const on = Object.entries(step.inputs)
        .filter(([, v]) => v)
        .map(([d]) => name(d));
      const off = Object.entries(step.inputs)
        .filter(([, v]) => !v)
        .map(([d]) => name(d));
      const parts: string[] = [];
      if (on.length > 0) parts.push(`${on.join(" と ")} を押したまま`);
      if (off.length > 0) parts.push(`${off.join(" と ")} を離す`);
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

/**
 * 設問のスタート時点の駒(S-048)。
 *
 * `scenario` の先頭 `premiseSteps` 個は、設問の時点で**すでに済んでいる操作**
 * (「そのあと X1 を押すと」の「そのあと」)。その操作を流し終えた駒がスタート時点で、
 * 静止した図にはこの駒の状態を出し、再生もここから始める。
 * 返すのは `frames` の添字。premiseSteps が 0 なら 0(操作前の駒)
 */
export function startFrameIndex(frames: readonly ReplayFrame[], premiseSteps: number): number {
  let at = 0;
  frames.forEach((frame, i) => {
    if (frame.index < premiseSteps) at = i;
  });
  return at;
}

/**
 * 操作列をひとつながりの文にする(「X0 を押して離す ×2 → X1 を押して離す」)。
 * 設問のスタート時点までに済んだ操作の説明に使う(S-048)。
 * 同じ操作が続くときは回数でまとめる。expect は操作ではないので飛ばす。空なら ""
 */
export function describeSteps(
  steps: readonly Step[],
  labels?: Record<string, string>,
  notation: Notation = DEFAULT_NOTATION,
): string {
  const parts: { text: string; count: number }[] = [];
  for (const step of steps) {
    if (step.type === "expect") continue;
    const text = describeStep(step, labels, notation);
    const last = parts[parts.length - 1];
    if (last && last.text === text) last.count += 1;
    else parts.push({ text, count: 1 });
  }
  return parts.map((p) => (p.count > 1 ? `${p.text} ×${p.count}` : p.text)).join(" → ");
}

/** 行の並びを「1 行目」「1〜2 行目」にする */
export function describeRows(rows: readonly number[]): string {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) return "";
  return first === last ? `${first + 1} 行目` : `${first + 1}〜${last + 1} 行目`;
}

/** ビット・タイマ完了・カウンタ完了をまとめた ON / OFF の表 */
function statesOf(snapshot: Snapshot): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(snapshot.bits)) out[k] = v;
  for (const [k, v] of Object.entries(snapshot.timers)) out[k] = v.done;
  for (const [k, v] of Object.entries(snapshot.counters)) out[k] = v.done;
  return out;
}

/**
 * スキャンの中の 1 駒の説明(S-049)。「1 行目まで実行 → Y0 は ON」「2 行目まで実行 → 変化なし」。
 * 変化は直前の駒(index が 0 なら操作の駒の状態 `before`)との差
 */
export function describeRungTrace(
  rungs: readonly RungTrace[],
  index: number,
  before: Snapshot,
  labels?: Record<string, string>,
  notation: Notation = DEFAULT_NOTATION,
): string {
  const trace = rungs[index];
  if (!trace) return "";
  const prev = index === 0 ? before : (rungs[index - 1]?.snapshot ?? before);
  const was = statesOf(prev);
  const now = statesOf(trace.snapshot);
  const changes = Object.entries(now)
    .filter(([device, value]) => was[device] !== value)
    .map(([device, value]) => {
      const shown = formatDevice(device as DeviceId, notation);
      const label = labels?.[device];
      return `${label ? `${shown}(${label})` : shown} は ${value ? "ON" : "OFF"}`;
    });
  return `${describeRows(trace.rows)}まで実行 → ${changes.length > 0 ? changes.join("、") : "変化なし"}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ミリ秒`;
  return `${Math.round(ms / 100) / 10} 秒`;
}

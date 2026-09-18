import { DEFAULT_HOLD_MS, type DeviceId, type Step } from "@ladder-dojo/core";

/**
 * 操作の記録をテストケースの手順に直す(S-042)。
 *
 * 「動かす」で実際に押した順番と時間をそのまま手順にする。手で 1 手ずつ
 * 組み立てるより速く、実機での確認のしかたに近い。
 *
 * - 押してすぐ離した(PRESS_MAX_MS 以内、間に確認が無い)→「押して離す」1 手
 * - それ以外の押す / 離す → 「ON にする」「OFF にする」
 * - 手と手の間の時間は WAIT_UNIT_MS 単位に丸めて「待つ」にする(半分未満は省く)
 * - 「いまの出力を確認」→ そのときの出力を期待値にする
 */
export type RecordedEvent =
  | { t: number; kind: "press" | "release"; device: DeviceId }
  | { t: number; kind: "expect"; outputs: Record<string, boolean> };

export const WAIT_UNIT_MS = 100;
export const PRESS_MAX_MS = 300;

function roundWait(ms: number): number {
  return Math.round(ms / WAIT_UNIT_MS) * WAIT_UNIT_MS;
}

export function eventsToSteps(events: RecordedEvent[]): Step[] {
  const steps: Step[] = [];
  const merged = new Set<number>();
  /** 判定側の時計。ここまでの手で進んだ仮想時間。「押して離す」は holdMs ぶん進むので、戻さない */
  let cursor = 0;

  events.forEach((event, i) => {
    if (merged.has(i)) return;
    const wait = roundWait(event.t - cursor);
    if (wait > 0) steps.push({ type: "wait", ms: wait });

    if (event.kind === "expect") {
      steps.push({ type: "expect", outputs: { ...event.outputs } });
      cursor = Math.max(cursor, event.t);
      return;
    }

    if (event.kind === "press") {
      // 同じ入力の次の出来事が「すぐ離す」なら 1 手にまとめる。間に確認があれば分ける
      const j = events.findIndex(
        (e, k) =>
          k > i && ((e.kind !== "expect" && e.device === event.device) || e.kind === "expect"),
      );
      const next = j >= 0 ? events[j] : undefined;
      if (next && next.kind === "release" && next.t - event.t <= PRESS_MAX_MS) {
        merged.add(j);
        steps.push({ type: "press", device: event.device });
        cursor = Math.max(cursor, event.t) + DEFAULT_HOLD_MS;
        return;
      }
      steps.push({ type: "set", inputs: { [event.device]: true } });
      cursor = Math.max(cursor, event.t);
      return;
    }

    steps.push({ type: "set", inputs: { [event.device]: false } });
    cursor = Math.max(cursor, event.t);
  });

  return steps;
}

import type { DeviceId, Snapshot, TestCase } from "@ladder-dojo/core";
import { useCallback, useRef, useState } from "react";
import { eventsToSteps, type RecordedEvent } from "../lib/recorder.js";
import type { InputControl, SimulatorState } from "./useSimulator.js";

export type RecorderState = {
  recording: boolean;
  /** 記録した手の数(表示用) */
  count: number;
  /** 回路を初期状態に戻して記録を始める */
  start: () => void;
  /** いまの出力を「確認」として記録する */
  expect: () => void;
  /** 記録を終えてテストケースにする。最後が確認でなければ、いまの出力の確認を足す */
  stop: (title: string) => TestCase;
  cancel: () => void;
  /** 記録中はこれを LadderView / DevicePanel に渡す(操作を横取りして記録する) */
  input: InputControl;
  /** 確認できる出力があるか(無ければ確認ボタンを出さない) */
  hasOutputs: boolean;
};

function readOutput(snapshot: Snapshot, device: DeviceId): boolean {
  if (device.startsWith("T")) return snapshot.timers[device]?.done ?? false;
  if (device.startsWith("C")) return snapshot.counters[device]?.done ?? false;
  return snapshot.bits[device] ?? false;
}

/**
 * 「動かす」の操作を記録してテストケースにする(S-042)。
 *
 * 時刻はシミュレータの仮想時間(`elapsedMs`)で取る。実時間ではなく
 * タイマが見ている時間なので、5x で記録しても判定と同じ時間軸になる。
 */
export function useRecorder(sim: SimulatorState): RecorderState {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const events = useRef<RecordedEvent[]>([]);
  const outputs = sim.devices.filter((d) => !d.startsWith("X"));

  const push = (event: RecordedEvent) => {
    events.current.push(event);
    setCount(events.current.length);
  };

  const snapshotOutputs = () => {
    const out: Record<string, boolean> = {};
    for (const d of outputs) out[d] = readOutput(sim.snapshot, d);
    return out;
  };

  const start = useCallback(() => {
    sim.reset();
    events.current = [];
    setCount(0);
    setRecording(true);
  }, [sim.reset]);

  const expect = () => {
    if (!recording) return;
    push({ t: sim.elapsedMs, kind: "expect", outputs: snapshotOutputs() });
  };

  const stop = (title: string): TestCase => {
    const last = events.current[events.current.length - 1];
    if (!last || last.kind !== "expect") {
      events.current.push({ t: sim.elapsedMs, kind: "expect", outputs: snapshotOutputs() });
    }
    const steps = eventsToSteps(events.current);
    events.current = [];
    setCount(0);
    setRecording(false);
    return { id: `rec-${Date.now().toString(36)}`, title, steps };
  };

  const cancel = () => {
    events.current = [];
    setCount(0);
    setRecording(false);
  };

  const base = sim.input;
  const input: InputControl = recording
    ? {
        held: base.held,
        press: (device) => {
          push({ t: sim.elapsedMs, kind: "press", device });
          base.press(device);
        },
        release: (device) => {
          // 保持中の離すはシミュレータも無視する。記録にも残さない
          if (!base.held.includes(device)) push({ t: sim.elapsedMs, kind: "release", device });
          base.release(device);
        },
        toggleHold: (device) => {
          push({
            t: sim.elapsedMs,
            kind: base.held.includes(device) ? "release" : "press",
            device,
          });
          base.toggleHold(device);
        },
      }
    : base;

  return { recording, count, start, expect, stop, cancel, input, hasOutputs: outputs.length > 0 };
}

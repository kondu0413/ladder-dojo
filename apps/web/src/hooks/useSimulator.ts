import {
  type Circuit,
  type DeviceId,
  listDevices,
  type PowerMap,
  Simulator,
  type Snapshot,
} from "@ladder-dojo/core";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

/** タイマの進み方(SPEC.md §5 の暫定値: 1x / 5x / 即時) */
export type SimSpeed = 1 | 5 | "instant";

export type SimulatorState = {
  snapshot: Snapshot;
  power: PowerMap;
  devices: DeviceId[];
  inputs: DeviceId[];
  speed: SimSpeed;
  running: boolean;
  scans: number;
  setSpeed: (speed: SimSpeed) => void;
  setRunning: (running: boolean) => void;
  toggleInput: (device: DeviceId) => void;
  setInput: (device: DeviceId, value: boolean) => void;
  reset: () => void;
};

/**
 * 回路をブラウザ上で走らせる(SPEC.md §6: シミュレータはクライアント側)。
 *
 * `Simulator` は可変オブジェクトなので React の state には入れず、フレームごとに
 * 再描画を促して値を読み直す。requestAnimationFrame ごとに 1 スキャンし、
 * 経過時間を speed 倍してタイマに渡す。
 */
export function useSimulator(circuit: Circuit): SimulatorState {
  const [speed, setSpeed] = useState<SimSpeed>(1);
  const [running, setRunning] = useState(true);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const sim = useMemo(
    () => new Simulator(circuit, { timerMode: speed === "instant" ? "instant" : "realtime" }),
    [circuit, speed],
  );
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const devices = useMemo(() => listDevices(circuit), [circuit]);
  const inputs = useMemo(() => devices.filter((d) => d.startsWith("X")), [devices]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const factor = speedRef.current === "instant" ? 1 : speedRef.current;
      // 最初のフレームの now は直前の performance.now() より前になることがあるので下限 0 で丸める。
      // 上限は、タブが裏に回っていた間の時間が一気に入らないようにするため
      const dt = Math.min(Math.max(now - last, 0), 100) * factor;
      last = now;
      sim.scan(dt);
      forceRender();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sim, running]);

  const toggleInput = useCallback(
    (device: DeviceId) => {
      sim.setInput(device, !sim.read(device));
      forceRender();
    },
    [sim],
  );

  const setInput = useCallback(
    (device: DeviceId, value: boolean) => {
      sim.setInput(device, value);
      forceRender();
    },
    [sim],
  );

  const reset = useCallback(() => {
    sim.reset();
    forceRender();
  }, [sim]);

  return {
    snapshot: sim.snapshot(),
    power: sim.power,
    devices,
    inputs,
    speed,
    running,
    scans: sim.scans,
    setSpeed,
    setRunning,
    toggleInput,
    setInput,
    reset,
  };
}

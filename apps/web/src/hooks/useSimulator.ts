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

/**
 * 入力の操作一式(S-027)。`DevicePanel` と `LadderView` にそのまま渡す。
 *
 * 入力は**押しボタン**として扱う。押している間だけ ON で、離すと OFF。
 * センサやスイッチのようにずっと ON にしたいときだけ `toggleHold` で保持する。
 */
export type InputControl = {
  press: (device: DeviceId) => void;
  release: (device: DeviceId) => void;
  toggleHold: (device: DeviceId) => void;
  /** 保持中の入力 */
  held: readonly DeviceId[];
};

export type SimulatorState = {
  snapshot: Snapshot;
  /** デバイスの ON / OFF(T / C は done)。ラダー図で名前を光らせる(S-047) */
  states: Record<string, boolean>;
  power: PowerMap;
  devices: DeviceId[];
  inputs: DeviceId[];
  speed: SimSpeed;
  running: boolean;
  scans: number;
  /** リセットからの仮想時間(ms)。タイマが見ている時間と同じ(速度倍率込み)。操作の記録に使う(S-042) */
  elapsedMs: number;
  /** 入力の操作。押している間だけ ON になる(S-027) */
  input: InputControl;
  setSpeed: (speed: SimSpeed) => void;
  setRunning: (running: boolean) => void;
  setInput: (device: DeviceId, value: boolean) => void;
  /** 一時停止中に 1 スキャンだけ進める(S-038)。評価の順番を目で追うためのもの */
  step: () => void;
  reset: () => void;
};

/** 手で 1 スキャン進めるときに進める時間(ms)。判定の 1 スキャンと同じ */
const STEP_MS = 10;

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
  const [held, setHeld] = useState<DeviceId[]>([]);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  /**
   * **速度を変えてもシミュレータは作り直さない**(S-029)。
   * 作り直すと、数えた回数や点いているランプが全部消える
   */
  const sim = useMemo(() => new Simulator(circuit), [circuit]);
  useEffect(() => {
    sim.setTimerMode(speed === "instant" ? "instant" : "realtime");
  }, [sim, speed]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const heldRef = useRef(held);
  heldRef.current = held;

  /**
   * 押した時点のスキャン数と、離す予約。
   *
   * タップは一瞬なので、押してすぐ離すと**同じスキャンの中で ON と OFF が起きて**
   * 立ち上がりが消える。カウンタが数えないのはこれが原因だった。
   * 離すのは「押した値が 1 回スキャンされたあと」まで待つ
   */
  const pressedAtScan = useRef(new Map<DeviceId, number>());
  const pendingRelease = useRef(new Set<DeviceId>());
  /**
   * いま押されている入力(S-053)。押していないものの「離す」は何もしない。
   * pointerleave はタップ直後にも飛んでくるので、以前は押していない入力の
   * 「離す」が記録に混ざり、キーの長押しでは押すが何度も入っていた
   */
  const pressed = useRef(new Set<DeviceId>());
  /** リセットからの仮想時間。scan に渡した dt の合計 */
  const elapsedRef = useRef(0);

  const devices = useMemo(() => listDevices(circuit), [circuit]);
  const inputs = useMemo(() => devices.filter((d) => d.startsWith("X")), [devices]);

  /** 1 スキャン回して、押し終わった入力を離す。自動でも手動でも同じ道を通す */
  const tick = useCallback(
    (dt: number) => {
      sim.scan(dt);
      elapsedRef.current += dt;
      // 1 スキャン ON になったものから離していく
      for (const device of [...pendingRelease.current]) {
        if (sim.scans > (pressedAtScan.current.get(device) ?? 0)) {
          sim.setInput(device, false);
          pendingRelease.current.delete(device);
        }
      }
      forceRender();
    },
    [sim],
  );

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
      tick(dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [tick, running]);

  /** 一時停止中に 1 スキャンだけ進める(S-038)。動いている間は自動で進むので何もしない */
  const step = useCallback(() => {
    if (running) return;
    const factor = speedRef.current === "instant" ? 1 : speedRef.current;
    tick(STEP_MS * factor);
  }, [tick, running]);

  // 回路が差し替わったら押しっぱなしの記録も捨てる。
  // sim は本文で使わないが、**差し替わったこと**が起動条件なので依存に要る
  // biome-ignore lint/correctness/useExhaustiveDependencies: sim の差し替えが起動条件
  useEffect(() => {
    pendingRelease.current.clear();
    pressedAtScan.current.clear();
    pressed.current.clear();
    elapsedRef.current = 0;
    setHeld([]);
  }, [sim]);

  const press = useCallback(
    (device: DeviceId) => {
      // 押しっぱなし(キーの長押しなど)の 2 回目以降は何もしない
      if (pressed.current.has(device)) return;
      pressed.current.add(device);
      pendingRelease.current.delete(device);
      pressedAtScan.current.set(device, sim.scans);
      sim.setInput(device, true);
      forceRender();
    },
    [sim],
  );

  const release = useCallback((device: DeviceId) => {
    // 保持中はボタンから指を離しても ON のまま
    if (heldRef.current.includes(device)) return;
    // 押していないものは離せない(pointerleave が押していないボタンにも来る)
    if (!pressed.current.has(device)) return;
    pressed.current.delete(device);
    pendingRelease.current.add(device);
    forceRender();
  }, []);

  const toggleHold = useCallback(
    (device: DeviceId) => {
      // 更新関数の中でシミュレータを触らない。StrictMode で 2 回呼ばれる
      if (heldRef.current.includes(device)) {
        pressed.current.delete(device);
        pendingRelease.current.add(device);
        setHeld(heldRef.current.filter((d) => d !== device));
      } else {
        pressed.current.add(device);
        pendingRelease.current.delete(device);
        pressedAtScan.current.set(device, sim.scans);
        sim.setInput(device, true);
        setHeld([...heldRef.current, device]);
      }
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
    pendingRelease.current.clear();
    pressedAtScan.current.clear();
    pressed.current.clear();
    elapsedRef.current = 0;
    setHeld([]);
    forceRender();
  }, [sim]);

  const snapshot = sim.snapshot();
  return {
    snapshot,
    states: snapshotStates(snapshot),
    power: sim.power,
    devices,
    inputs,
    speed,
    running,
    scans: sim.scans,
    elapsedMs: elapsedRef.current,
    input: { press, release, toggleHold, held },
    setSpeed,
    setRunning,
    setInput,
    step,
    reset,
  };
}

/** スナップショットを「デバイス名 → ON か」に潰す。T / C は設定値到達(done)を ON とする */
export function snapshotStates(snapshot: Snapshot): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(snapshot.bits)) out[k] = v;
  for (const [k, v] of Object.entries(snapshot.timers)) out[k] = v.done;
  for (const [k, v] of Object.entries(snapshot.counters)) out[k] = v.done;
  return out;
}

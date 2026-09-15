import {
  type Cell,
  type Circuit,
  type CoilElement,
  type ContactElement,
  cellKey,
  circuitSchema,
} from "../schema/circuit.js";
import { type DeviceId, deviceType, isDeviceId } from "../schema/device.js";

/**
 * ラダーシミュレータ(SPEC.md §3.1)。
 *
 * スキャン方式(DECISIONS.md S-004):
 * - 入力 X はスキャン開始時点の値で固定(スキャン中に setInput しても次のスキャンから)
 * - ラング(縦線でつながった行のまとまり)を上から順に評価する
 * - コイルの結果は即座にデバイスに書き込まれ、同じスキャンの後続ラングから見える(実機の PLC と同じ)
 * - 1 ラング内は左母線からの通電を幅優先で求め、そのラングのコイルは同じ通電状態から決まる
 * - 接点は左 → 右にしか導通しない。縦線は上下どちらにも導通する
 */

export type TimerState = { elapsedMs: number; done: boolean };
export type CounterState = { count: number; done: boolean };

/** 全デバイスのスナップショット(UI 表示・判定用) */
export type Snapshot = {
  bits: Record<string, boolean>;
  timers: Record<string, TimerState>;
  counters: Record<string, CounterState>;
};

/** 通電状態(強調表示用) */
export type PowerMap = {
  /** nodes[row][col]: 行 row の列 col の左端(col = cols は右端)が通電しているか */
  nodes: boolean[][];
  /** cells[row][col]: セルの要素が通電しているか(接点は導通中、コイルは励磁中、横線は通電中) */
  cells: boolean[][];
};

export type SimulatorOptions = {
  /** タイマの進め方。instant は通電した瞬間に設定値到達 */
  timerMode?: "realtime" | "instant";
};

type Rung = { rows: number[] };

export class Simulator {
  readonly circuit: Circuit;
  private readonly cells: Map<string, Cell>;
  private readonly rungs: Rung[];
  private readonly timerMode: "realtime" | "instant";

  private bits = new Map<DeviceId, boolean>();
  private timers = new Map<DeviceId, TimerState>();
  private counters = new Map<DeviceId, CounterState>();
  /** 次のスキャンで反映する入力 */
  private pendingInputs = new Map<DeviceId, boolean>();
  /** セルごとの前回値(立ち上がり検出用) */
  private prevByCell = new Map<string, boolean>();
  private lastPower: PowerMap;
  private scanCount = 0;

  constructor(circuit: Circuit, options: SimulatorOptions = {}) {
    this.circuit = circuitSchema.parse(circuit);
    this.timerMode = options.timerMode ?? "realtime";
    this.cells = new Map();
    for (const cell of this.circuit.cells) this.cells.set(cellKey(cell.row, cell.col), cell);
    this.rungs = splitRungs(this.circuit);
    this.lastPower = emptyPower(this.circuit);
    this.initDevices();
  }

  /** 回路中に現れる全デバイスを OFF / 0 で初期化する */
  private initDevices(): void {
    for (const cell of this.circuit.cells) {
      const el = cell.element;
      if (!el || el.type === "wire") continue;
      this.ensureDevice(el.device);
      if (el.type === "coil" && el.kind === "timer") {
        this.timers.set(el.device, { elapsedMs: 0, done: false });
      }
      if (el.type === "coil" && el.kind === "counter") {
        this.counters.set(el.device, { count: 0, done: false });
      }
    }
  }

  private ensureDevice(id: DeviceId): void {
    const t = deviceType(id);
    if (t === "T") {
      if (!this.timers.has(id)) this.timers.set(id, { elapsedMs: 0, done: false });
    } else if (t === "C") {
      if (!this.counters.has(id)) this.counters.set(id, { count: 0, done: false });
    } else if (!this.bits.has(id)) {
      this.bits.set(id, false);
    }
  }

  /** 全デバイスを初期状態に戻す(回路はそのまま) */
  reset(): void {
    this.bits.clear();
    this.timers.clear();
    this.counters.clear();
    this.pendingInputs.clear();
    this.prevByCell.clear();
    this.lastPower = emptyPower(this.circuit);
    this.scanCount = 0;
    this.initDevices();
  }

  /** 入力 X を設定する。次のスキャンから反映される */
  setInput(device: DeviceId, value: boolean): void {
    if (!isDeviceId(device) || deviceType(device) !== "X") {
      throw new Error(`入力デバイスではありません: ${device}`);
    }
    this.pendingInputs.set(device, value);
  }

  /** デバイスの ON/OFF を読む(T / C は done) */
  read(device: DeviceId): boolean {
    const t = deviceType(device);
    if (t === "T") return this.timers.get(device)?.done ?? false;
    if (t === "C") return this.counters.get(device)?.done ?? false;
    const pending = t === "X" ? this.pendingInputs.get(device) : undefined;
    return pending ?? this.bits.get(device) ?? false;
  }

  timer(device: DeviceId): TimerState | undefined {
    const s = this.timers.get(device);
    return s ? { ...s } : undefined;
  }

  counter(device: DeviceId): CounterState | undefined {
    const s = this.counters.get(device);
    return s ? { ...s } : undefined;
  }

  get scans(): number {
    return this.scanCount;
  }

  /** 直近のスキャンの通電状態 */
  get power(): PowerMap {
    return this.lastPower;
  }

  snapshot(): Snapshot {
    const bits: Record<string, boolean> = {};
    for (const [k, v] of this.bits) bits[k] = v;
    for (const [k, v] of this.pendingInputs) bits[k] = v;
    const timers: Record<string, TimerState> = {};
    for (const [k, v] of this.timers) timers[k] = { ...v };
    const counters: Record<string, CounterState> = {};
    for (const [k, v] of this.counters) counters[k] = { ...v };
    return { bits, timers, counters };
  }

  /**
   * 1 スキャン実行する。
   * @param dtMs 前回スキャンからの経過時間(タイマに加算)。0 なら時間を進めない
   */
  scan(dtMs = 0): PowerMap {
    if (!(dtMs >= 0)) throw new Error(`dtMs が不正: ${dtMs}`);
    // 入力の反映
    for (const [k, v] of this.pendingInputs) this.bits.set(k, v);
    this.pendingInputs.clear();

    const { cols } = this.circuit;
    const power = emptyPower(this.circuit);
    const nextPrev = new Map<string, boolean>();

    for (const rung of this.rungs) {
      const nodes = this.evaluateRung(rung, nextPrev);
      // 通電マップに書き込み
      for (const r of rung.rows) {
        const rowNodes = nodes.get(r);
        if (!rowNodes) continue;
        const prow = power.nodes[r];
        const crow = power.cells[r];
        if (!prow || !crow) continue;
        for (let c = 0; c <= cols; c++) prow[c] = rowNodes[c] ?? false;
        for (let c = 0; c < cols; c++) {
          const cell = this.cells.get(cellKey(r, c));
          const el = cell?.element;
          if (!el) continue;
          if (el.type === "coil") crow[c] = rowNodes[c] ?? false;
          else crow[c] = (rowNodes[c] ?? false) && (rowNodes[c + 1] ?? false);
        }
      }
      // コイルの書き込み(このラングの評価結果を即時反映)
      for (const r of rung.rows) {
        const cell = this.cells.get(cellKey(r, cols - 1));
        const el = cell?.element;
        if (!cell || el?.type !== "coil") continue;
        const energized = nodes.get(r)?.[cols - 1] ?? false;
        this.applyCoil(cell, el, energized, dtMs, nextPrev);
      }
    }
    this.prevByCell = nextPrev;
    this.lastPower = power;
    this.scanCount++;
    return power;
  }

  /** ラング内の各ノードの通電を幅優先で求める。返り値: row → nodes[cols+1] */
  private evaluateRung(rung: Rung, nextPrev: Map<string, boolean>): Map<number, boolean[]> {
    const { cols } = this.circuit;
    const nodes = new Map<number, boolean[]>();
    for (const r of rung.rows) nodes.set(r, new Array<boolean>(cols + 1).fill(false));

    // 接点の導通は、このスキャンの評価時点のデバイス値で固定する
    const conducts = new Map<string, boolean>();
    for (const r of rung.rows) {
      for (let c = 0; c < cols; c++) {
        const key = cellKey(r, c);
        const el = this.cells.get(key)?.element;
        if (!el) continue;
        if (el.type === "wire") conducts.set(key, true);
        else if (el.type === "contact") conducts.set(key, this.contactConducts(key, el, nextPrev));
      }
    }

    const queue: Array<[number, number]> = [];
    const mark = (r: number, c: number) => {
      const row = nodes.get(r);
      if (!row || row[c]) return;
      row[c] = true;
      queue.push([r, c]);
    };
    for (const r of rung.rows) mark(r, 0); // 左母線

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const [r, c] = item;
      // 右へ: セル (r, c) の要素が導通していれば (r, c+1)
      if (c < cols && conducts.get(cellKey(r, c))) mark(r, c + 1);
      // 縦線: セル (r, c-1) の右端 = ノード (r, c) と (r+1, c)、およびその逆
      if (c > 0) {
        if (this.cells.get(cellKey(r, c - 1))?.vline) mark(r + 1, c);
        if (this.cells.get(cellKey(r - 1, c - 1))?.vline) mark(r - 1, c);
      }
    }
    return nodes;
  }

  private contactConducts(
    key: string,
    el: ContactElement,
    nextPrev: Map<string, boolean>,
  ): boolean {
    const value = this.readInternal(el.device);
    switch (el.kind) {
      case "no":
        return value;
      case "nc":
        return !value;
      case "rise": {
        const prev = this.prevByCell.get(key) ?? false;
        nextPrev.set(key, value);
        return value && !prev;
      }
    }
  }

  private readInternal(device: DeviceId): boolean {
    const t = deviceType(device);
    if (t === "T") return this.timers.get(device)?.done ?? false;
    if (t === "C") return this.counters.get(device)?.done ?? false;
    return this.bits.get(device) ?? false;
  }

  private applyCoil(
    cell: Cell,
    el: CoilElement,
    energized: boolean,
    dtMs: number,
    nextPrev: Map<string, boolean>,
  ): void {
    const key = cellKey(cell.row, cell.col);
    switch (el.kind) {
      case "out":
        this.bits.set(el.device, energized);
        break;
      case "pulse": {
        const prev = this.prevByCell.get(key) ?? false;
        nextPrev.set(key, energized);
        this.bits.set(el.device, energized && !prev);
        break;
      }
      case "timer": {
        const st = this.timers.get(el.device) ?? { elapsedMs: 0, done: false };
        if (energized) {
          const elapsed = this.timerMode === "instant" ? el.presetMs : st.elapsedMs + dtMs;
          const capped = Math.min(elapsed, el.presetMs);
          this.timers.set(el.device, { elapsedMs: capped, done: capped >= el.presetMs });
        } else {
          this.timers.set(el.device, { elapsedMs: 0, done: false });
        }
        break;
      }
      case "counter": {
        const prev = this.prevByCell.get(key) ?? false;
        nextPrev.set(key, energized);
        const st = this.counters.get(el.device) ?? { count: 0, done: false };
        if (energized && !prev && st.count < el.preset) {
          const count = st.count + 1;
          this.counters.set(el.device, { count, done: count >= el.preset });
        } else {
          this.counters.set(el.device, { ...st, done: st.count >= el.preset });
        }
        break;
      }
      case "reset":
        if (energized) this.counters.set(el.device, { count: 0, done: false });
        break;
    }
  }
}

function emptyPower(circuit: Circuit): PowerMap {
  return {
    nodes: Array.from({ length: circuit.rows }, () =>
      new Array<boolean>(circuit.cols + 1).fill(false),
    ),
    cells: Array.from({ length: circuit.rows }, () => new Array<boolean>(circuit.cols).fill(false)),
  };
}

/** 縦線でつながった行をまとめてラングにする(上から順) */
export function splitRungs(circuit: Circuit): Rung[] {
  const linked = new Set<number>();
  for (const cell of circuit.cells) if (cell.vline) linked.add(cell.row);
  const rungs: Rung[] = [];
  let current: number[] = [];
  for (let r = 0; r < circuit.rows; r++) {
    current.push(r);
    if (!linked.has(r)) {
      rungs.push({ rows: current });
      current = [];
    }
  }
  if (current.length > 0) rungs.push({ rows: current });
  return rungs;
}

/** 回路が参照するデバイスを種別ごとに列挙する(重複なし、番号順) */
export function listDevices(circuit: Circuit): DeviceId[] {
  const set = new Set<DeviceId>();
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el && el.type !== "wire") set.add(el.device);
  }
  return [...set];
}

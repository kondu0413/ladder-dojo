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
  /**
   * cells[row][col]: **その要素を電流が流れているか**。
   * 接点・横線は「左が通電していて、かつ導通している」。コイルは励磁中。
   * 並列枝のせいで右側だけ通電している開いた接点は false になる(現場のモニタ表示と同じ)。
   */
  cells: boolean[][];
  /** conducts[row][col]: 通電の有無と無関係に、要素自体が閉じている(導通できる)か */
  conducts: boolean[][];
};

export type SimulatorOptions = {
  /** タイマの進め方。instant は通電した瞬間に設定値到達 */
  timerMode?: "realtime" | "instant";
  /**
   * 通電マップを組み立てるか(既定 true)。
   *
   * **判定は通電マップを見ない**。見るのは画面だけ。1 スキャンごとに
   * 行 × 列の配列を 3 枚作り直すのは、何万スキャンも回す判定では丸ごと無駄で、
   * ここが判定の所要時間の大半を占める。Workers の CPU 10ms/リクエスト
   * (COST.md §1.1)に収めるため、判定側では切る(S-030)
   */
  trackPower?: boolean;
};

type Rung = { rows: number[] };

export class Simulator {
  readonly circuit: Circuit;
  private readonly cells: Map<string, Cell>;
  /**
   * 行 × 列で引けるセルの表(S-030)。
   *
   * 1 スキャンごとに `"1,2"` のような文字列キーを作って Map を引くと、
   * 何万スキャンも回す判定では文字列の生成だけで時間を食う。
   * セルの配置はスキャン中に変わらないので、最初に表にしておく
   */
  private readonly grid: Array<Array<Cell | undefined>>;
  private readonly rungs: Rung[];
  /**
   * タイマの進め方。**あとから変えられる**(S-029)。
   * 作り直すとデバイスの状態が全部消えるので、速度を変えるだけで
   * 数えた回数やランプが初期化されてしまう
   */
  private timerMode: "realtime" | "instant";
  private readonly trackPower: boolean;

  private bits = new Map<DeviceId, boolean>();
  private timers = new Map<DeviceId, TimerState>();
  private counters = new Map<DeviceId, CounterState>();
  /** 次のスキャンで反映する入力 */
  private pendingInputs = new Map<DeviceId, boolean>();
  private lastPower: PowerMap;
  private scanCount = 0;
  /** 使い回す作業用バッファ(S-030)。毎スキャン作り直さない */
  private readonly nodesBuf: boolean[][];
  private readonly conductsBuf: boolean[][];
  /** セルごとの前回値(立ち上がり検出用)。今回ぶんと入れ替えて使う */
  private prevCell: boolean[][];
  private nextCell: boolean[][];
  /** 幅優先探索の待ち行列(行・列を別々に持って、確保し直さない) */
  private readonly queueRow: number[] = [];
  private readonly queueCol: number[] = [];

  constructor(circuit: Circuit, options: SimulatorOptions = {}) {
    this.circuit = circuitSchema.parse(circuit);
    this.timerMode = options.timerMode ?? "realtime";
    this.trackPower = options.trackPower ?? true;
    this.cells = new Map();
    const { rows, cols } = this.circuit;
    this.grid = Array.from({ length: rows }, () =>
      new Array<Cell | undefined>(cols).fill(undefined),
    );
    for (const cell of this.circuit.cells) {
      this.cells.set(cellKey(cell.row, cell.col), cell);
      const row = this.grid[cell.row];
      if (row && cell.col < cols) row[cell.col] = cell;
    }
    this.rungs = splitRungs(this.circuit);
    this.lastPower = emptyPower(this.circuit);
    this.nodesBuf = Array.from({ length: rows }, () => new Array<boolean>(cols + 1).fill(false));
    this.conductsBuf = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    this.prevCell = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    this.nextCell = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
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

  /** タイマの進め方を変える。デバイスの状態はそのまま(S-029) */
  setTimerMode(mode: "realtime" | "instant"): void {
    this.timerMode = mode;
  }

  /** 全デバイスを初期状態に戻す(回路はそのまま) */
  reset(): void {
    this.bits.clear();
    this.timers.clear();
    this.counters.clear();
    this.pendingInputs.clear();
    for (const row of this.prevCell) row.fill(false);
    for (const row of this.nextCell) row.fill(false);
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
    const power = this.trackPower ? emptyPower(this.circuit) : this.lastPower;
    const next = this.nextCell;
    for (const row of next) row.fill(false);

    for (const rung of this.rungs) {
      this.evaluateRung(rung);
      if (this.trackPower) {
        for (const r of rung.rows) {
          const rowNodes = this.nodesBuf[r];
          const rowConducts = this.conductsBuf[r];
          const gridRow = this.grid[r];
          const prow = power.nodes[r];
          const crow = power.cells[r];
          const drow = power.conducts[r];
          if (!rowNodes || !rowConducts || !gridRow || !prow || !crow || !drow) continue;
          for (let c = 0; c <= cols; c++) prow[c] = rowNodes[c] ?? false;
          for (let c = 0; c < cols; c++) {
            const el = gridRow[c]?.element;
            if (!el) continue;
            if (el.type === "coil") {
              const energized = rowNodes[c] ?? false;
              crow[c] = energized;
              drow[c] = energized;
            } else {
              const closed = rowConducts[c] ?? false;
              drow[c] = closed;
              crow[c] = closed && (rowNodes[c] ?? false);
            }
          }
        }
      }
      // コイルの書き込み(このラングの評価結果を即時反映)
      for (const r of rung.rows) {
        const cell = this.grid[r]?.[cols - 1];
        const el = cell?.element;
        if (!cell || el?.type !== "coil") continue;
        const energized = this.nodesBuf[r]?.[cols - 1] ?? false;
        this.applyCoil(r, cols - 1, el, energized, dtMs, next);
      }
    }
    // 今回値を次の前回値にする(配列は入れ替えるだけで作り直さない)
    this.nextCell = this.prevCell;
    this.prevCell = next;
    this.lastPower = power;
    this.scanCount++;
    return power;
  }

  /**
   * ラング内の各ノードの通電を幅優先で求め、`nodesBuf` / `conductsBuf` に書く。
   * バッファは使い回すので、対象の行だけ先に消す
   */
  private evaluateRung(rung: Rung): void {
    const { cols } = this.circuit;
    const next = this.nextCell;

    for (const r of rung.rows) {
      this.nodesBuf[r]?.fill(false);
      const rowConducts = this.conductsBuf[r];
      const gridRow = this.grid[r];
      if (!rowConducts || !gridRow) continue;
      // 接点の導通は、このスキャンの評価時点のデバイス値で固定する
      for (let c = 0; c < cols; c++) {
        const el = gridRow[c]?.element;
        if (!el) {
          rowConducts[c] = false;
        } else if (el.type === "wire") {
          rowConducts[c] = true;
        } else if (el.type === "contact") {
          rowConducts[c] = this.contactConducts(r, c, el, next);
        } else {
          rowConducts[c] = false;
        }
      }
    }

    const queueRow = this.queueRow;
    const queueCol = this.queueCol;
    queueRow.length = 0;
    queueCol.length = 0;
    const mark = (r: number, c: number) => {
      const row = this.nodesBuf[r];
      // ラングに含まれない行は nodesBuf を消していないので、ここで弾く
      if (!row || !rung.rows.includes(r) || row[c]) return;
      row[c] = true;
      queueRow.push(r);
      queueCol.push(c);
    };
    for (const r of rung.rows) mark(r, 0); // 左母線

    for (let head = 0; head < queueRow.length; head++) {
      const r = queueRow[head] as number;
      const c = queueCol[head] as number;
      // 右へ: セル (r, c) の要素が導通していれば (r, c+1)
      if (c < cols && this.conductsBuf[r]?.[c]) mark(r, c + 1);
      // 縦線: セル (r, c-1) の右端 = ノード (r, c) と (r+1, c)、およびその逆
      if (c > 0) {
        if (this.grid[r]?.[c - 1]?.vline) mark(r + 1, c);
        if (this.grid[r - 1]?.[c - 1]?.vline) mark(r - 1, c);
      }
    }
  }

  private contactConducts(
    row: number,
    col: number,
    el: ContactElement,
    next: boolean[][],
  ): boolean {
    const value = this.readInternal(el.device);
    switch (el.kind) {
      case "no":
        return value;
      case "nc":
        return !value;
      case "rise": {
        const prev = this.prevCell[row]?.[col] ?? false;
        const nextRow = next[row];
        if (nextRow) nextRow[col] = value;
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
    row: number,
    col: number,
    el: CoilElement,
    energized: boolean,
    dtMs: number,
    next: boolean[][],
  ): void {
    const prevCell = this.prevCell[row]?.[col] ?? false;
    const nextRow = next[row];
    switch (el.kind) {
      case "out":
        this.bits.set(el.device, energized);
        break;
      case "pulse": {
        if (nextRow) nextRow[col] = energized;
        this.bits.set(el.device, energized && !prevCell);
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
        if (nextRow) nextRow[col] = energized;
        const st = this.counters.get(el.device) ?? { count: 0, done: false };
        if (energized && !prevCell && st.count < el.preset) {
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
  const row = () => new Array<boolean>(circuit.cols).fill(false);
  return {
    nodes: Array.from({ length: circuit.rows }, () =>
      new Array<boolean>(circuit.cols + 1).fill(false),
    ),
    cells: Array.from({ length: circuit.rows }, row),
    conducts: Array.from({ length: circuit.rows }, row),
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

/**
 * タイマ・カウンタの設定値を集める。
 *
 * 現在値だけを出しても「あと何回で完了するのか」が分からない。
 * 画面で「3 / 5」と出すために使う(S-027)
 */
export function devicePresets(circuit: Circuit): {
  timers: Record<string, number>;
  counters: Record<string, number>;
} {
  const timers: Record<string, number> = {};
  const counters: Record<string, number> = {};
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el?.type !== "coil") continue;
    if (el.kind === "timer") timers[el.device] = el.presetMs;
    if (el.kind === "counter") counters[el.device] = el.preset;
  }
  return { timers, counters };
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

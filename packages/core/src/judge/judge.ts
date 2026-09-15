import type { Circuit } from "../schema/circuit.js";
import type { DeviceId } from "../schema/device.js";
import { DEFAULT_HOLD_MS, type Step, type TestCase } from "../schema/testcase.js";
import { Simulator, type Snapshot } from "../sim/simulator.js";

/**
 * 振る舞い判定(SPEC.md §3.3)。シミュレータをそのまま使い、判定用の別実装は持たない(§6)。
 *
 * 時間の扱い:
 * - 判定は仮想時間で行う。1 スキャン = scanMs(既定 10 ms)
 * - set / press の後は「時間を進めずに」状態が変化しなくなるまでスキャンする(settle)。
 *   ラングの並び順による 1〜数スキャンの伝播遅れで正誤が変わらないようにするため
 * - wait は ms ぶんスキャンしてタイマを進め、その後 settle する
 */

export type JudgeOptions = {
  scanMs?: number;
  /** settle の最大スキャン数(発振する回路の打ち切り) */
  maxSettleScans?: number;
  /** 1 ケースあたりの総スキャン数の上限(CPU 保護) */
  maxScansPerCase?: number;
};

export type StepTrace = {
  index: number;
  step: Step;
  /** ステップ実行後の観測値(Y / M / T / C の ON/OFF) */
  after: Record<string, boolean>;
};

export type CaseFailure =
  | {
      kind: "mismatch";
      stepIndex: number;
      expected: Record<string, boolean>;
      actual: Record<string, boolean>;
      note?: string;
    }
  | { kind: "unstable"; stepIndex: number }
  | { kind: "limit"; stepIndex: number };

export type CaseResult = {
  caseId: string;
  title: string;
  passed: boolean;
  failure?: CaseFailure;
  /** 実行したステップの記録(失敗ステップまで) */
  trace: StepTrace[];
};

export type JudgeResult = {
  passed: boolean;
  cases: CaseResult[];
};

const DEFAULTS: Required<JudgeOptions> = {
  scanMs: 10,
  maxSettleScans: 50,
  maxScansPerCase: 50_000,
};

export function judge(
  circuit: Circuit,
  testCases: readonly TestCase[],
  options: JudgeOptions = {},
): JudgeResult {
  const cases = testCases.map((tc) => runTestCase(circuit, tc, options));
  return { passed: cases.every((c) => c.passed), cases };
}

export function runTestCase(
  circuit: Circuit,
  testCase: TestCase,
  options: JudgeOptions = {},
): CaseResult {
  const opt = { ...DEFAULTS, ...options };
  const sim = new Simulator(circuit);
  const runner = new StepRunner(sim, opt);
  const trace: StepTrace[] = [];
  const base = { caseId: testCase.id, title: testCase.title };

  // 初期状態を安定させる(b 接点だけのラングなど、電源投入直後に ON になる出力を反映)
  if (!runner.settle()) {
    return { ...base, passed: false, failure: { kind: "unstable", stepIndex: -1 }, trace };
  }

  for (let i = 0; i < testCase.steps.length; i++) {
    const step = testCase.steps[i] as Step;
    const r = runner.run(step);
    trace.push({ index: i, step, after: runner.observe() });
    if (r === "unstable") {
      return { ...base, passed: false, failure: { kind: "unstable", stepIndex: i }, trace };
    }
    if (r === "limit") {
      return { ...base, passed: false, failure: { kind: "limit", stepIndex: i }, trace };
    }
    if (step.type === "expect") {
      const actual: Record<string, boolean> = {};
      let ok = true;
      for (const [dev, want] of Object.entries(step.outputs)) {
        const got = sim.read(dev as DeviceId);
        actual[dev] = got;
        if (got !== want) ok = false;
      }
      if (!ok) {
        const failure: CaseFailure = {
          kind: "mismatch",
          stepIndex: i,
          expected: { ...step.outputs },
          actual,
        };
        if (step.note !== undefined) failure.note = step.note;
        return { ...base, passed: false, failure, trace };
      }
    }
  }
  return { ...base, passed: true, trace };
}

type RunOutcome = "ok" | "unstable" | "limit";

/** テストケースのステップをシミュレータに流す。UI の「答え合わせ」でも使う */
export class StepRunner {
  private scans = 0;

  constructor(
    readonly sim: Simulator,
    private readonly opt: Required<JudgeOptions>,
  ) {}

  run(step: Step): RunOutcome {
    switch (step.type) {
      case "set":
        for (const [dev, v] of Object.entries(step.inputs)) this.sim.setInput(dev as DeviceId, v);
        return this.settleOutcome();
      case "press": {
        this.sim.setInput(step.device, true);
        const r1 = this.settleOutcome();
        if (r1 !== "ok") return r1;
        const r2 = this.advance(step.holdMs ?? DEFAULT_HOLD_MS);
        if (r2 !== "ok") return r2;
        this.sim.setInput(step.device, false);
        return this.settleOutcome();
      }
      case "wait":
        return this.advance(step.ms);
      case "expect":
        return "ok";
    }
  }

  /** 時間を ms 進める(スキャンを繰り返す)。その後 settle */
  advance(ms: number): RunOutcome {
    if (ms <= 0) return this.settleOutcome();
    const n = Math.ceil(ms / this.opt.scanMs);
    let remaining = ms;
    for (let i = 0; i < n; i++) {
      const dt = Math.min(this.opt.scanMs, remaining);
      remaining -= dt;
      if (!this.tick(dt)) return "limit";
    }
    return this.settleOutcome();
  }

  /** 時間を進めずに状態が変化しなくなるまでスキャンする。false = 発振または上限 */
  settle(): boolean {
    let prev = JSON.stringify(this.sim.snapshot());
    for (let i = 0; i < this.opt.maxSettleScans; i++) {
      if (!this.tick(0)) return false;
      const cur = JSON.stringify(this.sim.snapshot());
      if (cur === prev) return true;
      prev = cur;
    }
    return false;
  }

  private settleOutcome(): RunOutcome {
    if (this.scans >= this.opt.maxScansPerCase) return "limit";
    return this.settle() ? "ok" : "unstable";
  }

  private tick(dt: number): boolean {
    if (this.scans >= this.opt.maxScansPerCase) return false;
    this.sim.scan(dt);
    this.scans++;
    return true;
  }

  /** X 以外の観測値 */
  observe(): Record<string, boolean> {
    const snap: Snapshot = this.sim.snapshot();
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(snap.bits)) if (!k.startsWith("X")) out[k] = v;
    for (const [k, v] of Object.entries(snap.timers)) out[k] = v.done;
    for (const [k, v] of Object.entries(snap.counters)) out[k] = v.done;
    return out;
  }
}

import { describe, expect, it } from "vitest";
import { counter, ladder, nc, no, out, reset, timer } from "../builder.js";
import type { TestCase } from "../schema/testcase.js";
import { judge, runTestCase } from "./judge.js";

/** 模範解答: X0 で起動、X1 で停止する自己保持 */
const selfHold = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

const selfHoldCases: TestCase[] = [
  {
    id: "start",
    title: "起動ボタンを押して離すと点灯し続ける",
    steps: [
      { type: "expect", outputs: { Y0: false } },
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true }, note: "離しても保持される" },
    ],
  },
  {
    id: "stop",
    title: "停止ボタンで消灯する",
    steps: [
      { type: "press", device: "X0" },
      { type: "press", device: "X1" },
      { type: "expect", outputs: { Y0: false } },
    ],
  },
];

describe("振る舞い判定", () => {
  it("模範解答は全テストケースを通る", () => {
    const result = judge(selfHold, selfHoldCases);
    expect(result.passed).toBe(true);
    expect(result.cases.map((c) => c.passed)).toEqual([true, true]);
  });

  it("自己保持の枝が無い回路は落ちる", () => {
    const buggy = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
    const result = judge(buggy, selfHoldCases);
    expect(result.passed).toBe(false);
    const first = result.cases[0];
    expect(first?.passed).toBe(false);
    expect(first?.failure).toMatchObject({
      kind: "mismatch",
      expected: { Y0: true },
      actual: { Y0: false },
      note: "離しても保持される",
    });
  });

  it("停止側を a 接点にしてしまった回路は落ちる(a/b 取り違え)", () => {
    // Y0 = (X0 または Y0) かつ X1。X1 を押していないと起動すらできない
    const buggy = ladder(4).row(no("X0"), no("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const result = judge(buggy, selfHoldCases);
    expect(result.passed).toBe(false);
    expect(result.cases[0]?.failure).toMatchObject({
      kind: "mismatch",
      expected: { Y0: true },
      actual: { Y0: false },
    });
  });

  it("停止接点を入れ忘れた回路は、起動は通るが停止で落ちる", () => {
    const buggy = ladder(4).row(no("X0"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const result = judge(buggy, selfHoldCases);
    expect(result.passed).toBe(false);
    expect(result.cases[0]?.passed).toBe(true);
    expect(result.cases[1]?.failure).toMatchObject({
      kind: "mismatch",
      expected: { Y0: false },
      actual: { Y0: true },
    });
  });

  it("失敗したステップの位置が分かる", () => {
    const buggy = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
    const r = runTestCase(buggy, selfHoldCases[0] as TestCase);
    expect(r.failure?.stepIndex).toBe(2);
    expect(r.trace).toHaveLength(3);
    expect(r.trace[2]?.after).toEqual({ Y0: false });
  });

  it("発振する回路は unstable として落ちる", () => {
    const oscillator = ladder(3).row(nc("M0"), out("M0")).build();
    const r = runTestCase(oscillator, {
      id: "x",
      title: "発振",
      steps: [{ type: "expect", outputs: { M0: false } }],
    });
    expect(r.passed).toBe(false);
    expect(r.failure?.kind).toBe("unstable");
  });
});

describe("タイマを含む判定", () => {
  // X0 を押すと Y0 が点灯し、3 秒後に自動で消灯する
  const circuit = ladder(5)
    .row(no("X0"), nc("T0"), out("Y0"))
    .row(no("Y0"))
    .v(0, 0)
    .row(no("Y0"), timer("T0", 3000))
    .build();

  const cases: TestCase[] = [
    {
      id: "auto-off",
      title: "3 秒後に自動消灯",
      steps: [
        { type: "press", device: "X0" },
        { type: "expect", outputs: { Y0: true } },
        { type: "wait", ms: 2500 },
        { type: "expect", outputs: { Y0: true }, note: "まだ 3 秒経っていない" },
        { type: "wait", ms: 600 },
        { type: "expect", outputs: { Y0: false }, note: "3 秒経ったので消灯" },
      ],
    },
  ];

  it("仮想時間でタイマ問題を判定できる", () => {
    expect(judge(circuit, cases).passed).toBe(true);
  });

  it("設定値が違う回路は落ちる", () => {
    const buggy = ladder(5)
      .row(no("X0"), nc("T0"), out("Y0"))
      .row(no("Y0"))
      .v(0, 0)
      .row(no("Y0"), timer("T0", 5000))
      .build();
    const r = judge(buggy, cases);
    expect(r.passed).toBe(false);
    expect(r.cases[0]?.failure).toMatchObject({ stepIndex: 5, actual: { Y0: true } });
  });

  it("待ち時間が長くてもスキャン上限で打ち切られる", () => {
    const slow = ladder(3).row(no("X0"), timer("T0", 100_000)).build();
    const r = runTestCase(
      slow,
      {
        id: "long",
        title: "長い待ち",
        steps: [
          { type: "set", inputs: { X0: true } },
          { type: "wait", ms: 100_000 },
          { type: "expect", outputs: { T0: true } },
        ],
      },
      { maxScansPerCase: 100 },
    );
    expect(r.passed).toBe(false);
    expect(r.failure?.kind).toBe("limit");
  });
});

describe("カウンタを含む判定", () => {
  const circuit = ladder(3)
    .row(no("X0"), counter("C0", 3))
    .row(no("X1"), reset("C0"))
    .row(no("C0"), out("Y0"))
    .build();

  it("3 回押すと点灯し、リセットで戻る", () => {
    const cases: TestCase[] = [
      {
        id: "count3",
        title: "3 回で点灯",
        steps: [
          { type: "press", device: "X0" },
          { type: "press", device: "X0" },
          { type: "expect", outputs: { Y0: false } },
          { type: "press", device: "X0" },
          { type: "expect", outputs: { Y0: true, C0: true } },
          { type: "press", device: "X1" },
          { type: "expect", outputs: { Y0: false, C0: false } },
        ],
      },
    ];
    expect(judge(circuit, cases).passed).toBe(true);
  });

  it("設定値が違うカウンタは落ちる", () => {
    const buggy = ladder(3)
      .row(no("X0"), counter("C0", 2))
      .row(no("X1"), reset("C0"))
      .row(no("C0"), out("Y0"))
      .build();
    const cases: TestCase[] = [
      {
        id: "count3",
        title: "2 回では点灯しない",
        steps: [
          { type: "press", device: "X0" },
          { type: "press", device: "X0" },
          { type: "expect", outputs: { Y0: false } },
        ],
      },
    ];
    expect(judge(buggy, cases).passed).toBe(false);
  });
});

describe("ステップの実行", () => {
  it("set で複数の入力をまとめて設定できる", () => {
    const circuit = ladder(4).row(no("X0"), no("X1"), out("Y0")).build();
    const r = runTestCase(circuit, {
      id: "set",
      title: "同時入力",
      steps: [
        { type: "set", inputs: { X0: true, X1: true } },
        { type: "expect", outputs: { Y0: true } },
        { type: "set", inputs: { X1: false } },
        { type: "expect", outputs: { Y0: false } },
      ],
    });
    expect(r.passed).toBe(true);
  });

  it("press の押下時間を指定できる(タイマが進む)", () => {
    const circuit = ladder(3).row(no("X0"), timer("T0", 1000)).row(no("T0"), out("Y0")).build();
    const short = runTestCase(circuit, {
      id: "short",
      title: "短く押す",
      steps: [
        { type: "press", device: "X0", holdMs: 500 },
        { type: "expect", outputs: { Y0: false } },
      ],
    });
    expect(short.passed).toBe(true);

    const long = runTestCase(circuit, {
      id: "long",
      title: "長く押す",
      steps: [
        { type: "press", device: "X0", holdMs: 1200 },
        { type: "expect", outputs: { Y0: false }, note: "離すとタイマもリセットされる" },
      ],
    });
    expect(long.passed).toBe(true);
  });

  it("押している最中に判定したいときは set と wait を使う", () => {
    const circuit = ladder(3).row(no("X0"), timer("T0", 1000)).row(no("T0"), out("Y0")).build();
    const r = runTestCase(circuit, {
      id: "hold",
      title: "押し続ける",
      steps: [
        { type: "set", inputs: { X0: true } },
        { type: "wait", ms: 1000 },
        { type: "expect", outputs: { Y0: true } },
      ],
    });
    expect(r.passed).toBe(true);
  });

  it("holdMs=0 の press は時間を進めずに押して離す", () => {
    const circuit = ladder(3).row(no("X0"), out("Y0")).build();
    const r = runTestCase(circuit, {
      id: "instant",
      title: "瞬間的に押す",
      steps: [
        { type: "press", device: "X0", holdMs: 0 },
        { type: "expect", outputs: { Y0: false } },
      ],
    });
    expect(r.passed).toBe(true);
  });

  it("押した瞬間に発振する回路は press の途中で unstable になる", () => {
    const circuit = ladder(4).row(no("X0"), nc("M0"), out("M0")).build();
    const r = runTestCase(circuit, {
      id: "osc-press",
      title: "押すと発振",
      steps: [
        { type: "press", device: "X0" },
        { type: "expect", outputs: { M0: false } },
      ],
    });
    expect(r.failure).toEqual({ kind: "unstable", stepIndex: 0 });
  });

  it("押している間にスキャン上限を超えると limit になる", () => {
    const circuit = ladder(3).row(no("X0"), timer("T0", 60_000)).build();
    const r = runTestCase(
      circuit,
      {
        id: "press-limit",
        title: "長く押す",
        steps: [
          { type: "press", device: "X0", holdMs: 60_000 },
          { type: "expect", outputs: { T0: true } },
        ],
      },
      { maxScansPerCase: 50 },
    );
    expect(r.failure).toEqual({ kind: "limit", stepIndex: 0 });
  });

  it("発振する回路は途中のステップでも unstable になる", () => {
    const circuit = ladder(3).row(no("X0"), out("M1")).row(nc("M0"), no("M1"), out("M0")).build();
    const r = runTestCase(circuit, {
      id: "osc",
      title: "途中から発振",
      steps: [
        { type: "expect", outputs: { M0: false } },
        { type: "set", inputs: { X0: true } },
        { type: "expect", outputs: { M0: false } },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.failure).toEqual({ kind: "unstable", stepIndex: 1 });
  });
});

describe("判定は回路の形を見ない(振る舞い一致のみ)", () => {
  it("模範解答と形が違っても、振る舞いが同じなら正解", () => {
    // 模範解答は「X0 または Y0」だが、こちらは内部リレーを経由する別解
    const alternative = ladder(4)
      .row(no("X0"), nc("X1"), out("M0"))
      .row(no("M0"))
      .v(0, 0)
      .row(no("M0"), out("Y0"))
      .build();
    expect(judge(alternative, selfHoldCases).passed).toBe(true);
  });
});

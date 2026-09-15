import { describe, expect, it } from "vitest";
import { counter, ladder, nc, no, out, reset, timer, wire } from "../builder.js";
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

describe("タイムチャート(recordTimeline)", () => {
  const holdCase: TestCase = {
    id: "hold",
    title: "押して離しても保持",
    steps: [
      { type: "expect", outputs: { Y0: false } },
      { type: "press", device: "X0", holdMs: 100 },
      { type: "wait", ms: 500 },
      { type: "expect", outputs: { Y0: true } },
      { type: "press", device: "X1", holdMs: 100 },
      { type: "expect", outputs: { Y0: false } },
    ],
  };

  it("既定では記録しない(判定を何百回も回すところの費用を増やさない)", () => {
    expect(runTestCase(selfHold, holdCase).timeline).toBeUndefined();
  });

  it("値が変わった時刻だけを記録する", () => {
    const r = runTestCase(selfHold, holdCase, { recordTimeline: true });
    const tl = r.timeline;
    expect(tl).toBeDefined();
    if (!tl) return;

    // 同じ値が続くところでサンプルが増えない(500 ms 待っても波形は増えない)
    expect(tl.samples.length).toBeLessThan(10);
    // 隣り合うサンプルは必ず値が違う
    for (let i = 1; i < tl.samples.length; i++) {
      expect(tl.samples[i]?.values).not.toEqual(tl.samples[i - 1]?.values);
    }
    // 時刻は単調増加
    for (let i = 1; i < tl.samples.length; i++) {
      expect(tl.samples[i]?.t).toBeGreaterThan(tl.samples[i - 1]?.t ?? -1);
    }
  });

  it("入力(X)も波形に含む", () => {
    const tl = runTestCase(selfHold, holdCase, { recordTimeline: true }).timeline;
    expect(tl?.devices).toContain("X0");
    expect(tl?.devices).toContain("X1");
    expect(tl?.devices).toContain("Y0");
  });

  it("デバイスは X → Y → M → T → C の順に並ぶ", () => {
    const mixed = ladder(4)
      .row(no("X0"), wire, timer("T0", 100))
      .row(no("T0"), wire, out("M0"))
      .row(no("M0"), wire, out("Y0"))
      .build();
    const tl = runTestCase(
      mixed,
      {
        id: "m",
        title: "m",
        steps: [
          { type: "set", inputs: { X0: true } },
          { type: "wait", ms: 200 },
          { type: "expect", outputs: { Y0: true } },
        ],
      },
      { recordTimeline: true },
    ).timeline;
    expect(tl?.devices).toEqual(["X0", "Y0", "M0", "T0"]);
  });

  it("波形から Y0 の保持が読み取れる", () => {
    const tl = runTestCase(selfHold, holdCase, { recordTimeline: true }).timeline;
    expect(tl).toBeDefined();
    if (!tl) return;
    const y0At = (t: number) => {
      let v = false;
      for (const s of tl.samples) {
        if (s.t > t) break;
        v = s.values.Y0 ?? false;
      }
      return v;
    };
    // t=0 では「電源投入直後(OFF)」と「X0 を押した直後(ON)」が同じ時刻に起きる。
    // 波形なので幅ゼロの区間は描けず、その時刻の最後の値が残る
    expect(y0At(0)).toBe(true);
    // X0 を押している間と、離したあとの 500 ms 待ちの途中は ON
    expect(y0At(50)).toBe(true);
    expect(y0At(400)).toBe(true);
    // X1 を押したあとは OFF
    expect(y0At(tl.durationMs)).toBe(false);
  });

  it("同じ時刻に複数回変わったら、その時刻の最後の値だけを残す", () => {
    // 待ってから押すケースなら、電源投入直後の OFF が幅を持つので読み取れる
    const tl = runTestCase(
      selfHold,
      {
        id: "wait-then-press",
        title: "少し待ってから押す",
        steps: [
          { type: "wait", ms: 200 },
          { type: "press", device: "X0", holdMs: 100 },
          { type: "expect", outputs: { Y0: true } },
        ],
      },
      { recordTimeline: true },
    ).timeline;
    expect(tl?.samples[0]).toMatchObject({ t: 0, values: expect.objectContaining({ Y0: false }) });
    // 200 ms までは OFF のまま。ON になるのは押した瞬間
    const onAt = tl?.samples.find((s) => s.values.Y0 === true)?.t;
    expect(onAt).toBe(200);
  });

  it("目印はステップを始めた時刻に付く", () => {
    const tl = runTestCase(selfHold, holdCase, { recordTimeline: true }).timeline;
    expect(tl?.markers).toHaveLength(holdCase.steps.length);
    expect(tl?.markers[0]).toMatchObject({ stepIndex: 0, t: 0 });
    // 2 つめの目印(X0 を押す)も時刻 0。expect は時間を進めない
    expect(tl?.markers[1]).toMatchObject({ stepIndex: 1, t: 0 });
    // 3 つめ(500 ms 待つ)は、押して離したあとなので 100 ms 経っている
    expect(tl?.markers[2]?.t).toBe(100);
  });

  it("失敗したケースでも、そこまでの波形が残る", () => {
    const broken = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
    const r = runTestCase(broken, holdCase, { recordTimeline: true });
    expect(r.passed).toBe(false);
    expect(r.timeline?.samples.length).toBeGreaterThan(0);
    expect(r.timeline?.markers.length).toBeGreaterThan(0);
  });

  it("発振する回路でも波形を返す", () => {
    const oscillating = ladder(4).row(nc("Y0"), wire, out("Y0")).build();
    const r = runTestCase(
      oscillating,
      { id: "o", title: "o", steps: [{ type: "expect", outputs: { Y0: true } }] },
      { recordTimeline: true },
    );
    expect(r.failure?.kind).toBe("unstable");
    expect(r.timeline).toBeDefined();
  });
});

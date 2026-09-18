import { describe, expect, it } from "vitest";
import { ladder, nc, no, out } from "../builder.js";
import { circuitSchema, parseCircuit, SCHEMA_VERSION } from "./circuit.js";
import { compareDeviceId, deviceNumber, deviceType, isDeviceId } from "./device.js";
import { parseProblem } from "./problem.js";
import { testCaseSchema } from "./testcase.js";

describe("デバイス名", () => {
  it.each(["X0", "Y12", "M999", "T0", "C7"])("%s は有効", (id) => {
    expect(isDeviceId(id)).toBe(true);
  });

  it.each(["Z0", "X", "X01", "x0", "X1000", "X-1", "", "Y 0"])("%s は無効", (id) => {
    expect(isDeviceId(id)).toBe(false);
  });

  it("種別と番号を取り出せる", () => {
    expect(deviceType("M12")).toBe("M");
    expect(deviceNumber("M12")).toBe(12);
  });

  it("種別順 → 番号順で並ぶ", () => {
    const sorted = (["Y1", "X10", "M0", "X2", "C1", "T0"] as const).slice().sort(compareDeviceId);
    expect(sorted).toEqual(["X2", "X10", "Y1", "M0", "T0", "C1"]);
  });
});

describe("回路スキーマ", () => {
  it("ビルダーが作った回路は検証を通る", () => {
    const circuit = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
    expect(() => parseCircuit(circuit)).not.toThrow();
    expect(circuit.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("コイルが最右列以外にあると拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 4,
      rows: 1,
      cells: [{ row: 0, col: 1, element: { type: "coil", kind: "out", device: "Y0" } }],
    };
    expect(circuitSchema.safeParse(bad).success).toBe(false);
  });

  it("セルの重複を拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 3,
      rows: 1,
      cells: [
        { row: 0, col: 0, element: { type: "wire" } },
        { row: 0, col: 0, element: { type: "wire" } },
      ],
    };
    const r = circuitSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("重複");
  });

  it("範囲外のセルを拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 3,
      rows: 1,
      cells: [{ row: 5, col: 0, element: { type: "wire" } }],
    };
    expect(circuitSchema.safeParse(bad).success).toBe(false);
  });

  it("最終行から下への縦線を拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 3,
      rows: 2,
      cells: [{ row: 1, col: 0, vline: true }],
    };
    expect(circuitSchema.safeParse(bad).success).toBe(false);
  });

  it("不正なデバイス名を拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 3,
      rows: 1,
      cells: [{ row: 0, col: 0, element: { type: "contact", kind: "no", device: "Z9" } }],
    };
    expect(circuitSchema.safeParse(bad).success).toBe(false);
  });

  it("コイルの対象が X だと拒否する(出力にはできない)", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 2,
      rows: 1,
      cells: [{ row: 0, col: 1, element: { type: "coil", kind: "out", device: "X0" } }],
    };
    expect(circuitSchema.safeParse(bad).success).toBe(false);
  });

  it("タイマの設定値が 0 以下だと拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 2,
      rows: 1,
      cells: [
        { row: 0, col: 1, element: { type: "coil", kind: "timer", device: "T0", presetMs: 0 } },
      ],
    };
    expect(circuitSchema.safeParse(bad).success).toBe(false);
  });

  it("schemaVersion が違うと拒否する", () => {
    const circuit = ladder(3).row(no("X0"), out("Y0")).build();
    expect(circuitSchema.safeParse({ ...circuit, schemaVersion: 2 }).success).toBe(false);
  });
});

describe("テストケーススキーマ", () => {
  const base = {
    id: "tc1",
    title: "起動",
    steps: [
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
    ],
  };

  it("最小構成は通る", () => {
    expect(testCaseSchema.safeParse(base).success).toBe(true);
  });

  it("expect が無いと拒否する", () => {
    const bad = { ...base, steps: [{ type: "press", device: "X0" }] };
    const r = testCaseSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("expect");
  });

  it("入力に X 以外を指定すると拒否する", () => {
    const bad = { ...base, steps: [{ type: "set", inputs: { Y0: true } }, base.steps[1]] };
    expect(testCaseSchema.safeParse(bad).success).toBe(false);
  });

  it("expect に X を指定すると拒否する(入力は検証対象でない)", () => {
    const bad = { ...base, steps: [{ type: "expect", outputs: { X0: true } }] };
    expect(testCaseSchema.safeParse(bad).success).toBe(false);
  });

  it("待ち時間の合計が上限を超えると拒否する", () => {
    const bad = {
      ...base,
      steps: [
        { type: "wait", ms: 100_000 },
        { type: "wait", ms: 100_000 },
        { type: "expect", outputs: { Y0: true } },
      ],
    };
    const r = testCaseSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("待ち時間");
  });
});

describe("問題スキーマ", () => {
  const solution = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
  const base = {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-write-1",
    title: "自己保持を作る",
    mode: "write",
    stage: "selfhold",
    difficulty: 2,
    tags: ["自己保持"],
    spec: "X0 を押すと Y0 が点灯し、X1 を押すと消灯する。",
    solution,
    testCases: [
      {
        id: "tc1",
        title: "起動して保持",
        steps: [
          { type: "press", device: "X0" },
          { type: "expect", outputs: { Y0: true } },
        ],
      },
    ],
  };

  it("最小構成は通る", () => {
    expect(() => parseProblem(base)).not.toThrow();
  });

  it("mode=read には read が必要", () => {
    expect(() => parseProblem({ ...base, mode: "read" })).toThrow();
  });

  it("mode=fix には fix が必要", () => {
    expect(() => parseProblem({ ...base, mode: "fix" })).toThrow();
  });

  it("answerIndex が選択肢の範囲外だと拒否する", () => {
    const bad = {
      ...base,
      mode: "read",
      read: {
        questions: [
          {
            id: "q1",
            prompt: "X0 を押すとどうなる?",
            scenario: [{ type: "press", device: "X0" }],
            choices: ["点灯する", "消灯する"],
            answerIndex: 2,
          },
        ],
      },
    };
    expect(() => parseProblem(bad)).toThrow();
  });

  it("read モードの問題(選択肢つき)が通る", () => {
    const readProblem = {
      ...base,
      id: "selfhold-read-1",
      mode: "read",
      read: {
        questions: [
          {
            id: "q1",
            prompt: "X0 を押して離すと Y0 はどうなる?",
            scenario: [{ type: "press", device: "X0" }],
            choices: ["点灯したままになる", "一瞬だけ点灯して消える", "何も起きない"],
            answerIndex: 0,
            explanation: "Y0 の a 接点で自己保持されるため。",
          },
        ],
      },
    };
    const parsed = parseProblem(readProblem);
    expect(parsed.read?.questions[0]?.answerIndex).toBe(0);
  });

  it("fix モードの問題(バグ入り初期回路つき)が通る", () => {
    const fixProblem = {
      ...base,
      id: "selfhold-fix-1",
      mode: "fix",
      fix: {
        initial: ladder(4).row(no("X0"), nc("X1"), out("Y0")).build(),
        bugCount: 1,
        hint: "押している間しか点灯しない。保持する枝が要る。",
      },
    };
    expect(parseProblem(fixProblem).fix?.bugCount).toBe(1);
  });

  it("id は英小文字・数字・ハイフンのみ", () => {
    expect(() => parseProblem({ ...base, id: "Self Hold" })).toThrow();
  });
});

describe("SET / RST / 立ち下がり / オフディレイ(S-044)", () => {
  const cell = (element: unknown, col = 2) => ({
    schemaVersion: SCHEMA_VERSION,
    cols: 3,
    rows: 1,
    cells: [{ row: 0, col, element }],
  });

  it("SET は Y / M に置け、X には置けない", () => {
    expect(circuitSchema.safeParse(cell({ type: "coil", kind: "set", device: "M3" })).success).toBe(
      true,
    );
    expect(circuitSchema.safeParse(cell({ type: "coil", kind: "set", device: "X0" })).success).toBe(
      false,
    );
  });

  it("RST は C のほか Y / M にも置ける。T には置けない", () => {
    for (const device of ["C0", "Y1", "M2"]) {
      expect(
        circuitSchema.safeParse(cell({ type: "coil", kind: "reset", device })).success,
        device,
      ).toBe(true);
    }
    expect(
      circuitSchema.safeParse(cell({ type: "coil", kind: "reset", device: "T0" })).success,
    ).toBe(false);
  });

  it("立ち下がり接点はどのデバイスでも読める", () => {
    expect(
      circuitSchema.safeParse(cell({ type: "contact", kind: "fall", device: "T0" }, 0)).success,
    ).toBe(true);
  });

  it("オフディレイは T にだけ置け、設定値は 1ms 以上", () => {
    expect(
      circuitSchema.safeParse(cell({ type: "coil", kind: "offdelay", device: "T0", presetMs: 500 }))
        .success,
    ).toBe(true);
    expect(
      circuitSchema.safeParse(cell({ type: "coil", kind: "offdelay", device: "T0", presetMs: 0 }))
        .success,
    ).toBe(false);
    expect(
      circuitSchema.safeParse(cell({ type: "coil", kind: "offdelay", device: "C0", presetMs: 500 }))
        .success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { counter, ladder, nc, no, out, timer, wire } from "./builder.js";
import { diagnose } from "./diagnose.js";
import { judge } from "./judge/judge.js";
import type { TestCase } from "./schema/testcase.js";

/**
 * 自己保持: X0 で起動、X1 で停止、Y0 が保持される。
 *
 * 最初に「まだ何も押していないので Y0 は OFF」を入れているのが効いている。
 * これが無いと、接点を b 接点に変えただけの回路も通ってしまい(電源投入直後から
 * ON になる)、診断がそちらを「原因」と言い当ててしまう。
 */
const selfHoldCases: TestCase[] = [
  {
    id: "start",
    title: "起動ボタンを押して離しても保持される",
    steps: [
      { type: "expect", outputs: { Y0: false }, note: "まだ何も押していない" },
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
      { type: "wait", ms: 500 },
      { type: "expect", outputs: { Y0: true } },
    ],
  },
  {
    id: "stop",
    title: "停止ボタンで消える",
    steps: [
      { type: "expect", outputs: { Y0: false }, note: "まだ何も押していない" },
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
      { type: "press", device: "X1" },
      { type: "expect", outputs: { Y0: false } },
    ],
  },
];

function run(circuit: Parameters<typeof judge>[0], cases: TestCase[]) {
  const result = judge(circuit, cases);
  return { result, diagnoses: diagnose(circuit, cases, result) };
}

describe("diagnose", () => {
  it("正解している回路には何も言わない", () => {
    const correct = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const { result, diagnoses } = run(correct, selfHoldCases);
    expect(result.passed).toBe(true);
    expect(diagnoses).toEqual([]);
  });

  describe("構造チェック(判定を走らせずに分かるもの)", () => {
    it("コイルが 1 つも無ければそう言う", () => {
      const noCoil = ladder(4).row(no("X0"), nc("X1"), wire).build();
      const { diagnoses } = run(noCoil, selfHoldCases);
      expect(diagnoses[0]?.id).toBe("no-coil");
      expect(diagnoses[0]?.title).toContain("出力コイル");
    });

    it("期待されているデバイスを出力していなければそう言う", () => {
      // Y1 のコイルしかないので、Y0 を見ているテストには答えられない
      const wrongOutput = ladder(4).row(no("X0"), wire, out("Y1")).build();
      const { diagnoses } = run(wrongOutput, selfHoldCases);
      const hit = diagnoses.find((d) => d.id === "missing-output");
      expect(hit).toBeDefined();
      expect(hit?.title).toContain("Y0");
    });

    it("二重コイルを見つけ、両方のセルを指す", () => {
      const doubleCoil = ladder(4)
        .row(no("X0"), nc("X1"), out("Y0"))
        .row(no("Y0"), wire, out("Y0"))
        .build();
      const { diagnoses } = run(doubleCoil, selfHoldCases);
      const hit = diagnoses.find((d) => d.id === "double-coil");
      expect(hit).toBeDefined();
      expect(hit?.title).toContain("Y0");
      expect(hit?.cells).toHaveLength(2);
    });

    it("RST は二重コイルに数えない", () => {
      // C0 のカウンタと C0 のリセットが同居するのは正しい書き方
      const cases: TestCase[] = [
        {
          id: "count",
          title: "3 回で ON",
          steps: [
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
            { type: "expect", outputs: { C0: true } },
          ],
        },
      ];
      const circuit = ladder(4)
        .row(no("X0"), wire, counter("C0", 3))
        .row(no("X1"), wire, { type: "coil", kind: "reset", device: "C0" })
        .build();
      const { result, diagnoses } = run(circuit, cases);
      expect(result.passed).toBe(true);
      expect(diagnoses.find((d) => d.id === "double-coil")).toBeUndefined();
    });

    it("押して離すと消える回路に、自己保持が足りないと言う", () => {
      const noHold = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
      const { result, diagnoses } = run(noHold, selfHoldCases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "no-self-hold");
      expect(hit).toBeDefined();
      expect(hit?.title).toContain("Y0");
      expect(hit?.cells[0]).toEqual({ row: 0, col: 3 });
    });

    it("発振する回路は発振だと言う", () => {
      // Y0 の b 接点で Y0 を駆動する = 毎スキャン反転して落ち着かない
      const oscillating = ladder(4).row(nc("Y0"), wire, out("Y0")).build();
      const cases: TestCase[] = [
        { id: "any", title: "何か", steps: [{ type: "expect", outputs: { Y0: true } }] },
      ];
      const { result, diagnoses } = run(oscillating, cases);
      expect(result.passed).toBe(false);
      expect(diagnoses.some((d) => d.id === "unstable")).toBe(true);
    });
  });

  describe("最小修正の探索(1 手で直るものを探す)", () => {
    it("a 接点と b 接点の取り違えを見つける", () => {
      // 停止ボタン X1 を a 接点にしてしまった
      const swapped = ladder(4).row(no("X0"), no("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
      const { result, diagnoses } = run(swapped, selfHoldCases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "contact-kind");
      expect(hit).toBeDefined();
      expect(hit?.title).toContain("X1");
      expect(hit?.cells[0]).toEqual({ row: 0, col: 1 });
    });

    it("デバイス番号の取り違えを見つける", () => {
      // 保持用の枝に Y0 ではなく X1 を置いてしまった。Y0 に直せば正解になる
      const mixedUp = ladder(4)
        .row(no("X0"), nc("X1"), out("Y0"))
        .row(no("X1"), wire)
        .v(0, 0)
        .build();
      const { result, diagnoses } = run(mixedUp, selfHoldCases);
      expect(result.passed).toBe(false);
      // 構造チェックは「保持できていない」と言い、最小修正は「どのセルか」まで絞る
      expect(diagnoses.some((d) => d.id === "no-self-hold")).toBe(true);
      const hit = diagnoses.find((d) => d.id === "device-mixup");
      expect(hit).toBeDefined();
      expect(hit?.cells[0]).toEqual({ row: 1, col: 0 });
      expect(hit?.detail).toContain("X1");
    });

    it("タイマの設定値の桁違いを見つける", () => {
      const cases: TestCase[] = [
        {
          id: "timer",
          title: "3 秒で ON",
          steps: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 2900 },
            { type: "expect", outputs: { T0: false } },
            { type: "wait", ms: 200 },
            { type: "expect", outputs: { T0: true } },
          ],
        },
      ];
      // 3 秒のつもりで 3 ミリ秒にしてしまった
      const wrongPreset = ladder(3).row(no("X0"), wire, timer("T0", 3)).build();
      const { result, diagnoses } = run(wrongPreset, cases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "timer-preset");
      expect(hit).toBeDefined();
      expect(hit?.title).toContain("T0");
      expect(hit?.detail).toContain("3 ミリ秒");
    });

    it("カウンタの設定回数のずれを見つける", () => {
      const cases: TestCase[] = [
        {
          id: "count",
          title: "3 回目で ON",
          steps: [
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
            { type: "expect", outputs: { C0: false } },
            { type: "press", device: "X0" },
            { type: "expect", outputs: { C0: true } },
          ],
        },
      ];
      const offByOne = ladder(3).row(no("X0"), wire, counter("C0", 4)).build();
      const { result, diagnoses } = run(offByOne, cases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "counter-preset");
      expect(hit).toBeDefined();
      expect(hit?.detail).toContain("4 回");
    });

    it("並列の縦線の付け忘れを見つける", () => {
      // 保持用の枝はあるが、縦線が無いので並列になっていない
      const noVline = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).build();
      const { result, diagnoses } = run(noVline, selfHoldCases);
      expect(result.passed).toBe(false);
      expect(diagnoses.some((d) => d.id === "vline-missing" || d.id === "no-self-hold")).toBe(true);
    });

    it("余分な縦線(つないではいけない 2 行)を見つける", () => {
      // 独立して動くはずの 2 ラングが縦線でつながってしまい、片方を押すと両方点く
      const cases: TestCase[] = [
        {
          id: "independent",
          title: "X0 は Y0 だけ、X1 は Y1 だけを点ける",
          steps: [
            { type: "expect", outputs: { Y0: false, Y1: false } },
            { type: "set", inputs: { X0: true } },
            { type: "expect", outputs: { Y0: true, Y1: false } },
            { type: "set", inputs: { X0: false, X1: true } },
            { type: "expect", outputs: { Y0: false, Y1: true } },
          ],
        },
      ];
      const joined = ladder(2).row(no("X0"), out("Y0")).row(no("X1"), out("Y1")).v(0, 0).build();
      const { result, diagnoses } = run(joined, cases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "vline-extra");
      expect(hit).toBeDefined();
      expect(hit?.cells[0]).toEqual({ row: 0, col: 0 });
    });

    it("コイルが出しているデバイスの取り違えを見つける(中継の M)", () => {
      // X0 で M0 を出して、M0 で Y0 を出す回路。中継コイルを M1 と書き間違えた。
      // M0 はテストが見ていないので「出力していません」では拾えず、最小修正でしか分からない
      const cases: TestCase[] = [
        {
          id: "relay",
          title: "X0 を入れている間だけ Y0 が点く",
          steps: [
            { type: "expect", outputs: { Y0: false } },
            { type: "set", inputs: { X0: true } },
            { type: "expect", outputs: { Y0: true } },
            { type: "set", inputs: { X0: false } },
            { type: "expect", outputs: { Y0: false } },
          ],
        },
      ];
      const wrongRelay = ladder(2)
        .row(no("X0"), { type: "coil", kind: "out", device: "M1" })
        .row(no("M0"), out("Y0"))
        .build();
      const { result, diagnoses } = run(wrongRelay, cases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "device-mixup");
      expect(hit).toBeDefined();
      expect(hit?.cells[0]).toEqual({ row: 0, col: 1 });
      expect(hit?.detail).toContain("M1");
    });

    it("秒で書かれた設定値は秒のまま伝える", () => {
      const cases: TestCase[] = [
        {
          id: "timer6",
          title: "6 秒で ON",
          steps: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 5900 },
            { type: "expect", outputs: { T0: false } },
            { type: "wait", ms: 200 },
            { type: "expect", outputs: { T0: true } },
          ],
        },
      ];
      // 6 秒のつもりで 3 秒にしてしまった
      const halfTime = ladder(3).row(no("X0"), wire, timer("T0", 3000)).build();
      const { result, diagnoses } = run(halfTime, cases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "timer-preset");
      expect(hit?.detail).toContain("3 秒");
      expect(hit?.detail).not.toContain("ミリ秒");
    });

    it("b 接点を a 接点にすべき場合も、いまの種類を名指しする", () => {
      const cases: TestCase[] = [
        {
          id: "plain",
          title: "X0 を入れている間だけ Y0 が点く",
          steps: [
            { type: "expect", outputs: { Y0: false } },
            { type: "set", inputs: { X0: true } },
            { type: "expect", outputs: { Y0: true } },
          ],
        },
      ];
      const inverted = ladder(2).row(nc("X0"), out("Y0")).build();
      const { result, diagnoses } = run(inverted, cases);
      expect(result.passed).toBe(false);
      const hit = diagnoses.find((d) => d.id === "contact-kind");
      expect(hit).toBeDefined();
      expect(hit?.detail).toContain("b 接点");
    });

    it("1 手では直らない回路には最小修正を出さない(構造の指摘だけ)", () => {
      const empty = ladder(4).row(wire, wire, wire).build();
      const { diagnoses } = run(empty, selfHoldCases);
      expect(diagnoses.every((d) => d.id === "no-coil" || d.id === "missing-output")).toBe(true);
    });

    it("探索の手数を絞れる", () => {
      const swapped = ladder(4).row(no("X0"), no("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
      const result = judge(swapped, selfHoldCases);
      const none = diagnose(swapped, selfHoldCases, result, { maxCandidates: 0 });
      expect(none).toEqual([]);
    });

    it("返す件数を絞れる", () => {
      const doubleCoil = ladder(4)
        .row(no("X0"), nc("X1"), out("Y0"))
        .row(no("Y0"), wire, out("Y0"))
        .build();
      const result = judge(doubleCoil, selfHoldCases);
      expect(diagnose(doubleCoil, selfHoldCases, result, { maxResults: 1 })).toHaveLength(1);
    });
  });

  it("答えそのものは書かない(直し方の断定を避ける)", () => {
    const swapped = ladder(4).row(no("X0"), no("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const { diagnoses } = run(swapped, selfHoldCases);
    for (const d of diagnoses) {
      // 「〜に変えてください」のような手順の断定をしない
      expect(d.detail).not.toMatch(/に(変|直)えてください/);
    }
  });
});

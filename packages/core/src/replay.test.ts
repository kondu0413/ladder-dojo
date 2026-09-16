import { describe, expect, it } from "vitest";
import { ladder, nc, no, out, timer } from "./builder.js";
import { runTestCase } from "./judge/judge.js";
import { describeStep, replayScenario } from "./replay.js";
import type { Step } from "./schema/index.js";

/**
 * 操作列の再生(S-022)。
 *
 * ここが判定とずれると、「正解」と言われた直後に違う動きを見せることになる。
 * **判定と同じ結果になること**を最優先で確かめる。
 */

/** 自己保持: X0 で起動、X1 で停止 */
const selfHold = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

/** 3 秒のオンディレイで自動停止する自己保持 */
const autoStop = ladder(5)
  .row(no("X0"), nc("T0"), out("Y0"))
  .row(no("Y0"))
  .row(no("Y0"), timer("T0", 3000))
  .v(0, 0)
  .build();

/** ある駒の出力を読む */
const on = (frames: ReturnType<typeof replayScenario>["frames"], i: number, device: string) =>
  frames[i]?.snapshot.bits[device] === true;

describe("操作列の再生", () => {
  it("操作の前後がすべて駒になる(最初の 1 つは操作前)", () => {
    const steps: Step[] = [
      { type: "press", device: "X0" },
      { type: "wait", ms: 100 },
    ];
    const { frames } = replayScenario(selfHold, steps);

    expect(frames).toHaveLength(3);
    expect(frames[0]?.index).toBe(-1);
    expect(frames[0]?.step).toBeUndefined();
    expect(frames[1]?.step).toEqual(steps[0]);
    expect(frames[2]?.step).toEqual(steps[1]);
  });

  it("操作前の状態も落ち着かせてから見せる", () => {
    // 電源投入直後から ON になる回路。落ち着かせずに見せると OFF に見えてしまう
    const alwaysOn = ladder(3).row(nc("X0"), out("Y0")).build();
    const { frames } = replayScenario(alwaysOn, []);
    expect(frames).toHaveLength(1);
    expect(on(frames, 0, "Y0")).toBe(true);
  });

  it("自己保持が駒ごとに追える", () => {
    const { frames } = replayScenario(selfHold, [
      { type: "press", device: "X0" },
      { type: "press", device: "X1" },
    ]);
    expect(on(frames, 0, "Y0")).toBe(false); // 何もしていない
    expect(on(frames, 1, "Y0")).toBe(true); // 起動して保持
    expect(on(frames, 2, "Y0")).toBe(false); // 停止
  });

  it("通電状態(ラダー図に渡すもの)が駒ごとに変わる", () => {
    // 押している間は X0 の接点(0 行 0 列)を電流が通る
    const held = replayScenario(selfHold, [{ type: "set", inputs: { X0: true } }]);
    expect(held.frames[0]?.power.cells[0]?.[0]).toBe(false);
    expect(held.frames[1]?.power.cells[0]?.[0]).toBe(true);
  });

  it("押して離したあとは、自己保持の枝のほうが通電している", () => {
    // press は押して離すので、離したあとに X0 の接点は通らない。
    // 保持しているのは 1 行目の Y0 接点。ここを取り違えると、
    // 「自己保持を目で追う」という問題の狙いそのものを見せ損なう
    const { frames } = replayScenario(selfHold, [{ type: "press", device: "X0" }]);
    const after = frames[1];
    expect(after?.power.cells[0]?.[0], "X0 の接点は離したので通らない").toBe(false);
    expect(after?.power.cells[1]?.[0], "自己保持の枝が通っている").toBe(true);
    expect(after?.snapshot.bits.Y0, "それでもランプは点いたまま").toBe(true);
  });

  it("**答え合わせ用の expect は駒にしない**(操作ではないので見せる意味がない)", () => {
    const { frames } = replayScenario(selfHold, [
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
    ]);
    expect(frames).toHaveLength(2);
    expect(frames[1]?.step).toEqual({ type: "press", device: "X0" });
  });

  it("時間が進む操作では仮想時間も進む", () => {
    const { frames } = replayScenario(autoStop, [
      { type: "press", device: "X0" },
      { type: "wait", ms: 5000 },
    ]);
    expect(frames[1]?.elapsedMs ?? 0).toBeLessThan(1000);
    expect(frames[2]?.elapsedMs ?? 0).toBeGreaterThanOrEqual(5000);
  });

  describe("判定と食い違わない", () => {
    // ここがずれると、「正解」と言われた直後に違う動きを見せることになる
    it.each([
      [
        "自己保持: 押して離すと保持",
        selfHold,
        [{ type: "press", device: "X0" }] as Step[],
        { Y0: true },
      ],
      [
        "自己保持: 停止で消える",
        selfHold,
        [
          { type: "press", device: "X0" },
          { type: "press", device: "X1" },
        ] as Step[],
        { Y0: false },
      ],
      [
        "タイマ: 5 秒待つと自動停止している",
        autoStop,
        [
          { type: "press", device: "X0" },
          { type: "wait", ms: 5000 },
        ] as Step[],
        { Y0: false },
      ],
      [
        "タイマ: 1 秒ではまだ点いている",
        autoStop,
        [
          { type: "press", device: "X0" },
          { type: "wait", ms: 1000 },
        ] as Step[],
        { Y0: true },
      ],
    ])("%s", (_name, circuit, steps, expected) => {
      // 判定は「期待どおりか」で答える
      const judged = runTestCase(circuit, {
        id: "t",
        title: "t",
        steps: [...steps, { type: "expect", outputs: expected }],
      });
      expect(judged.passed, "前提: 判定はこの期待値で通る").toBe(true);

      // 再生は「実際にどうなったか」で答える。両者が一致すること
      const { frames } = replayScenario(circuit, steps);
      const last = frames[frames.length - 1];
      for (const [device, want] of Object.entries(expected)) {
        expect(last?.snapshot.bits[device] === true, `${device} が判定と一致しない`).toBe(want);
      }
    });
  });

  describe("落ち着かない回路", () => {
    it("発振する回路は途中で打ち切り、そこまでの駒を返す", () => {
      // 立ち上がりを使わない反転。毎スキャン切り替わって落ち着かない
      const oscillate = ladder(3).row(nc("Y0"), out("Y0")).build();
      const { frames, stopped } = replayScenario(oscillate, [{ type: "press", device: "X0" }]);
      expect(stopped).toBe("unstable");
      expect(frames.length).toBeGreaterThan(0);
    });
  });
});

describe("操作を日本語にする", () => {
  it.each([
    [{ type: "press", device: "X0" } as Step, "X0 を押して離す"],
    [{ type: "set", inputs: { X0: true } } as Step, "X0 を ON にする"],
    [{ type: "set", inputs: { X0: false } } as Step, "X0 を OFF にする"],
    [{ type: "wait", ms: 500 } as Step, "500 ミリ秒 待つ"],
    [{ type: "wait", ms: 3000 } as Step, "3 秒 待つ"],
    [{ type: "wait", ms: 1500 } as Step, "1.5 秒 待つ"],
  ])("%o → %s", (step, expected) => {
    expect(describeStep(step)).toBe(expected);
  });

  it("デバイスの説明があれば添える", () => {
    expect(describeStep({ type: "press", device: "X0" }, { X0: "起動ボタン" })).toBe(
      "X0(起動ボタン) を押して離す",
    );
  });

  it("同時に複数のデバイスを動かす操作も読める", () => {
    expect(describeStep({ type: "set", inputs: { X0: true, X1: false } })).toBe(
      "X0 を ON にする、X1 を OFF にする",
    );
  });
});

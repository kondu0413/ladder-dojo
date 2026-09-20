import { describe, expect, it } from "vitest";
import { ladder, nc, no, out, reset, set, timer } from "./builder.js";
import { runTestCase } from "./judge/judge.js";
import {
  describeFrame,
  describeRows,
  describeRungTrace,
  describeStep,
  describeSteps,
  replayScenario,
  startFrameIndex,
} from "./replay.js";
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

    // 「押して離す」は押している間と離したあとの 2 駒(S-047)
    expect(frames).toHaveLength(4);
    expect(frames[0]?.index).toBe(-1);
    expect(frames[0]?.step).toBeUndefined();
    expect(frames[1]?.step).toEqual(steps[0]);
    expect(frames[1]?.phase).toBe("down");
    expect(frames[2]?.step).toEqual(steps[0]);
    expect(frames[2]?.phase).toBe("up");
    expect(frames[3]?.step).toEqual(steps[1]);
    expect(frames[3]?.phase).toBeUndefined();
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
    expect(on(frames, 1, "Y0")).toBe(true); // 起動を押している
    expect(on(frames, 2, "Y0")).toBe(true); // 離しても保持
    expect(on(frames, 3, "Y0")).toBe(false); // 停止を押している
    expect(on(frames, 4, "Y0")).toBe(false); // 離しても消えたまま
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
    const during = frames[1];
    expect(during?.power.cells[0]?.[0], "押している間は X0 の接点を通る").toBe(true);
    const after = frames[2];
    expect(after?.power.cells[0]?.[0], "X0 の接点は離したので通らない").toBe(false);
    expect(after?.power.cells[1]?.[0], "自己保持の枝が通っている").toBe(true);
    expect(after?.snapshot.bits.Y0, "それでもランプは点いたまま").toBe(true);
  });

  it("押している間しか通電しない回路でも、押した瞬間が駒として見える(S-047)", () => {
    // SET / RST: 離したあとは何も通電していないが、Y0 は保持されている
    const latch = ladder(4).row(no("X0"), set("Y0")).row(no("X1"), reset("Y0")).build();
    const { frames } = replayScenario(latch, [{ type: "press", device: "X0" }]);
    expect(frames).toHaveLength(3);
    expect(frames[1]?.power.cells[0]?.[0], "押している間は SET のラングが通電").toBe(true);
    expect(frames[2]?.power.cells[0]?.[0], "離したあとは通電していない").toBe(false);
    expect(on(frames, 2, "Y0"), "それでも SET で保持されている").toBe(true);
  });

  it("駒の説明は、押している間と離したあとで言い分ける", () => {
    const press = { type: "press", device: "X0" } as const;
    expect(describeFrame({ step: undefined })).toBe("何も操作していない状態");
    expect(describeFrame({ step: press, phase: "down" }, { X0: "起動" })).toBe(
      "X0(起動) を押している",
    );
    expect(describeFrame({ step: press, phase: "up" })).toBe("X0 を離した");
    expect(describeFrame({ step: { type: "wait", ms: 1500 } })).toBe("1.5 秒待つ");
  });

  it("**答え合わせ用の expect は駒にしない**(操作ではないので見せる意味がない)", () => {
    const { frames } = replayScenario(selfHold, [
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
    ]);
    expect(frames).toHaveLength(3);
    expect(frames[1]?.step).toEqual({ type: "press", device: "X0" });
    expect(frames[2]?.step).toEqual({ type: "press", device: "X0" });
  });

  it("時間が進む操作では仮想時間も進む", () => {
    const { frames } = replayScenario(autoStop, [
      { type: "press", device: "X0" },
      { type: "wait", ms: 5000 },
    ]);
    expect(frames[1]?.elapsedMs ?? 0).toBeLessThan(1000);
    expect(frames[2]?.elapsedMs ?? 0).toBeLessThan(1000);
    expect(frames[3]?.elapsedMs ?? 0).toBeGreaterThanOrEqual(5000);
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
    [{ type: "set", inputs: { X0: true } } as Step, "X0 を押したまま"],
    [{ type: "set", inputs: { X0: false } } as Step, "X0 を離す"],
    [{ type: "wait", ms: 500 } as Step, "0.5 秒待つ"],
    [{ type: "wait", ms: 3000 } as Step, "3 秒待つ"],
    [{ type: "wait", ms: 1500 } as Step, "1.5 秒待つ"],
    [{ type: "wait", ms: 100 } as Step, "0.1 秒待つ"],
    [{ type: "press", device: "X0", holdMs: 1500 } as Step, "X0 を 1.5 秒押して離す"],
    [{ type: "set", inputs: {} } as Step, "入力を変えない"],
    [{ type: "expect", outputs: {} } as Step, "出力を確認する"],
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
      "X0 を押したまま、X1 を離す",
    );
    // 同時に押しているものは「と」でまとめる(S-049)
    expect(describeStep({ type: "set", inputs: { X0: true, X1: true } })).toBe(
      "X0 と X1 を押したまま",
    );
  });
});

describe("操作の説明の表記(S-028)", () => {
  it("オムロン系ではデバイス名がワード.ビットになる", () => {
    expect(describeStep({ type: "press", device: "X0" }, undefined, "omron")).toBe(
      "0.00 を押して離す",
    );
  });

  it("既定では元のデバイス名のまま", () => {
    expect(describeStep({ type: "press", device: "X0" })).toBe("X0 を押して離す");
  });

  it("説明付きでも表記が効く", () => {
    expect(describeStep({ type: "set", inputs: { X1: true } }, { X1: "停止" }, "omron")).toBe(
      "0.01(停止) を押したまま",
    );
  });
});

/**
 * 設問のスタート時点(S-048)。
 *
 * 「そのあと X1 を押して離すと」の設問は、X0 の操作を済ませた状態から始まる。
 * 静止した図にその状態を出し、再生もそこから始めるための添字と説明。
 */
describe("設問のスタート時点(S-048)", () => {
  const steps: Step[] = [
    { type: "press", device: "X0" },
    { type: "press", device: "X1" },
  ];

  it("前提の操作を流し終えた駒がスタートになる(押して離すは離したあとの駒)", () => {
    const { frames } = replayScenario(selfHold, steps);
    expect(startFrameIndex(frames, 0)).toBe(0);
    expect(startFrameIndex(frames, 1)).toBe(2);
    expect(frames[2]?.phase).toBe("up");
    // 自己保持なので、X0 を押して離したあとは Y0 が点いている
    expect(on(frames, 2, "Y0")).toBe(true);
  });

  it("前提が操作列より長くても最後の駒で止まる", () => {
    const { frames } = replayScenario(selfHold, steps);
    expect(startFrameIndex(frames, 5)).toBe(frames.length - 1);
  });

  it("済んだ操作をひとつながりの文にする(同じ操作は回数でまとめる)", () => {
    expect(describeSteps([])).toBe("");
    expect(describeSteps([{ type: "press", device: "X0" }], { X0: "起動" })).toBe(
      "X0(起動) を押して離す",
    );
    expect(
      describeSteps([
        { type: "press", device: "X0" },
        { type: "press", device: "X0" },
        { type: "set", inputs: { X0: true } },
      ]),
    ).toBe("X0 を押して離す ×2 → X0 を押したまま");
    // 答え合わせの expect は操作ではない
    expect(
      describeSteps([
        { type: "press", device: "X0" },
        { type: "expect", outputs: {} },
      ]),
    ).toBe("X0 を押して離す");
  });

  it("説明にも表記が効く", () => {
    expect(describeSteps([{ type: "press", device: "X0" }], undefined, "omron")).toBe(
      "0.00 を押して離す",
    );
  });
});

/**
 * スキャンの中を見る(S-049)。
 *
 * SET と RST の両方に通電すると、図では両方のコイルが通電して見えるのに Y0 は OFF。
 * 「上から順に実行され、あとの結果が残る」を、1 行目のあとに ON・2 行目のあとに OFF
 * という途中の駒で見せる。
 */
describe("スキャンの中を見る(S-049)", () => {
  /** SET / RST: X0 で SET、X1 で RST */
  const setReset = ladder(4).row(no("X0"), set("Y0")).row(no("X1"), reset("Y0")).build();

  it("駒ごとに 1 スキャンをラングで区切った記録が付く", () => {
    const { frames } = replayScenario(setReset, [{ type: "set", inputs: { X0: true, X1: true } }]);
    const last = frames[frames.length - 1];
    expect(last?.rungs).toHaveLength(2);
    expect(last?.rungs[0]?.rows).toEqual([0]);
    expect(last?.rungs[1]?.rows).toEqual([1]);
    // 1 行目まで実行: SET で ON。2 行目まで実行: RST で OFF(= この駒の状態)
    expect(last?.rungs[0]?.snapshot.bits.Y0).toBe(true);
    expect(last?.rungs[1]?.snapshot.bits.Y0).toBe(false);
    expect(last?.snapshot.bits.Y0).toBe(false);
    // まだ実行していない行は無電圧のまま
    expect(last?.rungs[0]?.power.cells[1]?.[0]).toBe(false);
    expect(last?.rungs[1]?.power.cells[1]?.[0]).toBe(true);
  });

  it("記録を取っても駒の状態は変わらない(落ち着いた状態からのスキャン)", () => {
    const steps: Step[] = [
      { type: "press", device: "X0" },
      { type: "wait", ms: 100 },
    ];
    const { frames } = replayScenario(selfHold, steps);
    for (const f of frames) {
      const lastRung = f.rungs[f.rungs.length - 1];
      expect(lastRung?.snapshot).toEqual(f.snapshot);
    }
    // 自己保持は押して離したあとも ON のまま
    expect(on(frames, frames.length - 1, "Y0")).toBe(true);
  });

  it("途中の駒の説明は、直前の駒との差を言う", () => {
    const { frames } = replayScenario(setReset, [{ type: "set", inputs: { X0: true, X1: true } }]);
    const last = frames[frames.length - 1];
    if (!last) throw new Error("frame");
    expect(describeRungTrace(last.rungs, 0, last.snapshot, { Y0: "ランプ" })).toBe(
      "1 行目まで実行 → Y0(ランプ) は ON",
    );
    expect(describeRungTrace(last.rungs, 1, last.snapshot)).toBe("2 行目まで実行 → Y0 は OFF");
  });

  it("変化が無い行は「変化なし」", () => {
    const { frames } = replayScenario(selfHold, [{ type: "press", device: "X0" }]);
    const last = frames[frames.length - 1];
    if (!last) throw new Error("frame");
    // 自己保持は 1 ラング(2 行)。落ち着いているので変化なし
    expect(describeRungTrace(last.rungs, 0, last.snapshot)).toBe("1〜2 行目まで実行 → 変化なし");
  });

  it("行の並びの言い方", () => {
    expect(describeRows([0])).toBe("1 行目");
    expect(describeRows([2, 3])).toBe("3〜4 行目");
    expect(describeRows([])).toBe("");
  });
});

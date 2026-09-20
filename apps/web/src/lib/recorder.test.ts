import { describe, expect, it } from "vitest";
import { eventsToSteps } from "./recorder.js";

describe("操作の記録をテストの手順にする(S-042)", () => {
  it("すぐ離した押下は「押して離す」1 手になる", () => {
    const steps = eventsToSteps([
      { t: 0, kind: "press", device: "X0" },
      { t: 120, kind: "release", device: "X0" },
      { t: 130, kind: "expect", outputs: { Y0: true } },
    ]);
    expect(steps).toEqual([
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
    ]);
  });

  it("長く押した / 間に確認を挟んだ押下は ON と OFF に分かれ、間の時間は待つになる", () => {
    const steps = eventsToSteps([
      { t: 40, kind: "press", device: "X0" },
      { t: 1_060, kind: "expect", outputs: { Y0: true } },
      { t: 3_120, kind: "release", device: "X0" },
      { t: 3_140, kind: "expect", outputs: { Y0: false } },
    ]);
    expect(steps).toEqual([
      { type: "set", inputs: { X0: true } },
      { type: "wait", ms: 1_000 },
      { type: "expect", outputs: { Y0: true } },
      { type: "wait", ms: 2_100 },
      { type: "set", inputs: { X0: false } },
      { type: "expect", outputs: { Y0: false } },
    ]);
  });

  it("同時押し(離す前にほかを押した)は「押したまま / 離す」に分けて重なりを残す(S-053)", () => {
    // 以前は X0 を「押して離す」1 手にまとめていて、両手押しが要る回路のテストが通らなかった
    const steps = eventsToSteps([
      { t: 0, kind: "press", device: "X0" },
      { t: 50, kind: "press", device: "X1" },
      { t: 100, kind: "release", device: "X0" },
      { t: 500, kind: "release", device: "X1" },
    ]);
    expect(steps).toEqual([
      { type: "set", inputs: { X0: true } },
      { type: "wait", ms: 100 },
      { type: "set", inputs: { X1: true } },
      { type: "wait", ms: 100 },
      { type: "set", inputs: { X0: false } },
      { type: "wait", ms: 400 },
      { type: "set", inputs: { X1: false } },
    ]);
  });

  it("最初の待ち時間も残す(記録を始めてから押すまで)", () => {
    const steps = eventsToSteps([
      { t: 2_480, kind: "press", device: "X0" },
      { t: 2_600, kind: "release", device: "X0" },
    ]);
    expect(steps).toEqual([
      { type: "wait", ms: 2_500 },
      { type: "press", device: "X0" },
    ]);
  });

  it("何も無ければ空", () => {
    expect(eventsToSteps([])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { ladder, no, out, reset, set } from "./builder.js";
import { describeCoilConflict, findCoilConflicts } from "./conflicts.js";
import { Simulator } from "./sim/simulator.js";

/**
 * 同じデバイスへの書き込みの衝突(S-049)。
 *
 * 図では両方のコイルが通電して見えるのに片方の結果しか残らない。
 * 「なぜ」を出すために、衝突を見つけて理由を言えること。
 */
describe("コイルの書き込みの衝突", () => {
  const setReset = ladder(4).row(no("X0"), set("Y0")).row(no("X1"), reset("Y0")).build();

  it("SET と RST の両方に通電したら衝突。あとの行(RST)が残る", () => {
    const sim = new Simulator(setReset);
    sim.setInput("X0", true);
    sim.setInput("X1", true);
    sim.scan();
    const conflicts = findCoilConflicts(setReset, sim.power);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.device).toBe("Y0");
    expect(conflicts[0]?.writes.map((w) => [w.row, w.kind, w.value])).toEqual([
      [0, "set", true],
      [1, "reset", false],
    ]);
    expect(conflicts[0]?.result).toBe(false);
    expect(sim.read("Y0")).toBe(false);
  });

  it("片方しか通電していなければ衝突ではない", () => {
    const sim = new Simulator(setReset);
    sim.setInput("X0", true);
    sim.scan();
    expect(findCoilConflicts(setReset, sim.power)).toEqual([]);
  });

  it("二重コイルは通電していないほうも OFF を書くので衝突になる", () => {
    const double = ladder(4).row(no("X0"), out("Y0")).row(no("X1"), out("Y0")).build();
    const sim = new Simulator(double);
    sim.setInput("X0", true);
    sim.scan();
    const conflicts = findCoilConflicts(double, sim.power);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.writes.map((w) => [w.row, w.kind, w.value])).toEqual([
      [0, "out", true],
      [1, "out", false],
    ]);
    expect(conflicts[0]?.result).toBe(false);
    expect(sim.read("Y0")).toBe(false);
  });

  it("同じ値を書くだけなら衝突ではない", () => {
    const double = ladder(4).row(no("X0"), out("Y0")).row(no("X0"), out("Y0")).build();
    const sim = new Simulator(double);
    sim.setInput("X0", true);
    sim.scan();
    expect(findCoilConflicts(double, sim.power)).toEqual([]);
  });

  it("理由を一言で言える", () => {
    const sim = new Simulator(setReset);
    sim.setInput("X0", true);
    sim.setInput("X1", true);
    sim.scan();
    const [c] = findCoilConflicts(setReset, sim.power);
    if (!c) throw new Error("conflict");
    expect(describeCoilConflict(c, { Y0: "ランプ" })).toBe(
      "1 行目の SET と 2 行目の RST が両方通電しています。PLC は上から順に実行するので、あとの 2 行目(RST)の結果が残り、Y0(ランプ) は OFF です。",
    );
    expect(describeCoilConflict(c, undefined, "omron")).toContain("100.00 は OFF");
  });

  it("二重コイルの理由は、どちらが何を書いたかを言う", () => {
    const double = ladder(4).row(no("X0"), out("Y0")).row(no("X1"), out("Y0")).build();
    const sim = new Simulator(double);
    sim.setInput("X0", true);
    sim.scan();
    const [c] = findCoilConflicts(double, sim.power);
    if (!c) throw new Error("conflict");
    expect(describeCoilConflict(c)).toBe(
      "1 行目の出力コイル(ON) と 2 行目の出力コイル(OFF) が同じ Y0 に書いています。PLC は上から順に実行するので、あとの 2 行目(出力コイル)の結果が残り、Y0 は OFF です。",
    );
  });
});

import { describe, expect, it } from "vitest";
import { ladder, nc, no, out, timer, wire } from "./builder.js";
import { coreVersion } from "./index.js";
import { circuitMetrics } from "./metrics.js";
import { cellKey, cellMap, circuitSchema, emptyCircuit, SCHEMA_VERSION } from "./schema/circuit.js";
import { listDevices, Simulator } from "./sim/simulator.js";

describe("ビルダー", () => {
  it("行の要素を左から置き、コイルを最右列に置いて間を横線で埋める", () => {
    const c = ladder(5).row(no("X0"), out("Y0")).build();
    const m = cellMap(c);
    expect(m.get(cellKey(0, 0))?.element).toEqual(no("X0"));
    expect(m.get(cellKey(0, 1))?.element).toEqual(wire);
    expect(m.get(cellKey(0, 2))?.element).toEqual(wire);
    expect(m.get(cellKey(0, 3))?.element).toEqual(wire);
    expect(m.get(cellKey(0, 4))?.element).toEqual(out("Y0"));
  });

  it("コイルだけの行は左母線につながない(並列枝として使う)", () => {
    const c = ladder(4).row(no("X0"), out("Y0")).row(out("Y1")).v(0, 0).build();
    const m = cellMap(c);
    expect(m.get(cellKey(1, 0))?.element).toBeUndefined();
    expect(m.get(cellKey(1, 1))?.element).toEqual(wire);
    expect(m.get(cellKey(1, 3))?.element).toEqual(out("Y1"));
  });

  it("null で位置を空けられる", () => {
    const c = ladder(4).row(null, no("X0"), out("Y0")).build();
    const m = cellMap(c);
    expect(m.get(cellKey(0, 0))?.element).toBeUndefined();
    expect(m.get(cellKey(0, 1))?.element).toEqual(no("X0"));
  });

  it("要素数が列数を超えると例外", () => {
    expect(() => ladder(3).row(no("X0"), no("X1"), no("X2"), out("Y0")).build()).toThrow(/列数/);
  });

  it("at で任意の位置に置ける", () => {
    const c = ladder(4).at(2, 1, no("X5")).build();
    expect(c.rows).toBe(3);
    expect(cellMap(c).get(cellKey(2, 1))?.element).toEqual(no("X5"));
  });

  it("v は縦線フラグを立て、行数を広げる", () => {
    const c = ladder(4).at(0, 0, no("X0")).v(0, 0).build();
    expect(c.rows).toBe(2);
    expect(cellMap(c).get(cellKey(0, 0))).toEqual({
      row: 0,
      col: 0,
      element: no("X0"),
      vline: true,
    });
  });

  it("空の回路を作れる", () => {
    const c = emptyCircuit(6, 3);
    expect(c).toMatchObject({ cols: 6, rows: 3, cells: [] });
  });
});

describe("指標(模範解答との比較用)", () => {
  it("接点数・コイル数・ラング数を数える", () => {
    const c = ladder(5)
      .row(no("X0"), nc("X1"), out("Y0"))
      .row(no("Y0"))
      .v(0, 0)
      .row(no("Y0"), timer("T0", 1000))
      .build();
    expect(circuitMetrics(c)).toEqual({ rungs: 2, contacts: 4, coils: 2, cells: 11 });
  });

  it("空の回路は全て 0", () => {
    expect(circuitMetrics(emptyCircuit())).toEqual({ rungs: 0, contacts: 0, coils: 0, cells: 0 });
  });

  it("要素の無いセル(縦線だけ)は数えない", () => {
    const c = circuitSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      cols: 3,
      rows: 2,
      cells: [
        { row: 0, col: 0, element: no("X0"), vline: true },
        { row: 0, col: 1, element: { type: "wire" } },
        { row: 0, col: 2, element: out("Y0") },
        { row: 1, col: 0, vline: false },
        { row: 1, col: 1, element: no("X1") },
      ],
    });
    expect(circuitMetrics(c)).toEqual({ rungs: 1, contacts: 2, coils: 1, cells: 4 });
  });
});

describe("listDevices", () => {
  it("回路が参照するデバイスを重複なく列挙する", () => {
    const c = ladder(4)
      .row(no("X0"), nc("X1"), out("Y0"))
      .row(no("Y0"))
      .v(0, 0)
      .row(no("Y0"), timer("T0", 500))
      .build();
    expect(listDevices(c).sort()).toEqual(["T0", "X0", "X1", "Y0"]);
  });

  it("横線だけの回路では空", () => {
    expect(listDevices(emptyCircuit())).toEqual([]);
  });
});

describe("通電状態の保持", () => {
  it("power ゲッターが直近のスキャン結果を返す", () => {
    const sim = new Simulator(ladder(3).row(no("X0"), out("Y0")).build());
    expect(sim.power.cells[0]?.[2]).toBe(false);
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.power.cells[0]?.[2]).toBe(true);
  });
});

describe("coreVersion", () => {
  it("スキーマバージョンを返す", () => {
    expect(coreVersion()).toEqual({ schemaVersion: SCHEMA_VERSION });
  });
});

describe("回路スキーマの追加検証", () => {
  it("最右列の右端に縦線を置くと拒否する", () => {
    const bad = {
      schemaVersion: SCHEMA_VERSION,
      cols: 3,
      rows: 2,
      cells: [{ row: 0, col: 2, vline: true }],
    };
    const r = circuitSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("最右列");
  });
});

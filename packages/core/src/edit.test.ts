import { describe, expect, it } from "vitest";
import { counter, ladder, nc, no, out, timer, wire } from "./builder.js";
import {
  addColumn,
  addRow,
  canPlace,
  canSetVline,
  clearElement,
  connectRow,
  hasVline,
  putElement,
  removeColumn,
  removeRow,
  setVline,
} from "./edit.js";
import { cellKey, cellMap, emptyCircuit } from "./schema/circuit.js";
import { Simulator } from "./sim/simulator.js";

function elementAt(circuit: Parameters<typeof cellMap>[0], row: number, col: number) {
  return cellMap(circuit).get(cellKey(row, col))?.element;
}

describe("要素の配置", () => {
  const base = emptyCircuit(4, 2);

  it("接点は最右列以外に置ける", () => {
    expect(canPlace(base, 0, 0, no("X0"))).toBe(true);
    expect(canPlace(base, 0, 2, no("X0"))).toBe(true);
    expect(canPlace(base, 0, 3, no("X0"))).toBe(false); // 最右列はコイル専用
  });

  it("コイルは最右列にだけ置ける", () => {
    expect(canPlace(base, 0, 3, out("Y0"))).toBe(true);
    expect(canPlace(base, 0, 0, out("Y0"))).toBe(false);
  });

  it("範囲外には置けない", () => {
    expect(canPlace(base, 5, 0, no("X0"))).toBe(false);
    expect(canPlace(base, 0, -1, no("X0"))).toBe(false);
  });

  it("置けない位置に putElement すると例外", () => {
    expect(() => putElement(base, 0, 0, out("Y0"))).toThrow(/置けません/);
  });

  it("置いた要素が読み出せ、元の回路は変わらない", () => {
    const next = putElement(base, 0, 0, no("X0"));
    expect(elementAt(next, 0, 0)).toEqual(no("X0"));
    expect(base.cells).toHaveLength(0);
  });

  it("同じ位置に置き直すと上書きされる", () => {
    const a = putElement(base, 0, 1, no("X0"));
    const b = putElement(a, 0, 1, nc("X1"));
    expect(elementAt(b, 0, 1)).toEqual(nc("X1"));
    expect(b.cells.filter((c) => c.row === 0 && c.col === 1)).toHaveLength(1);
  });

  it("要素を消しても縦線は残る", () => {
    const a = putElement(base, 0, 1, no("X0"));
    const b = setVline(a, 0, 1, true);
    const c = clearElement(b, 0, 1);
    expect(elementAt(c, 0, 1)).toBeUndefined();
    expect(hasVline(c, 0, 1)).toBe(true);
  });

  it("範囲外の消去は何もしない", () => {
    expect(clearElement(base, 9, 9)).toBe(base);
  });
});

describe("縦線", () => {
  const base = emptyCircuit(4, 3);

  it("最終行と最右列には置けない", () => {
    expect(canSetVline(base, 0, 0)).toBe(true);
    expect(canSetVline(base, 2, 0)).toBe(false); // 最終行
    expect(canSetVline(base, 0, 3)).toBe(false); // 最右列
  });

  it("置いて外せる", () => {
    const on = setVline(base, 1, 1, true);
    expect(hasVline(on, 1, 1)).toBe(true);
    const off = setVline(on, 1, 1, false);
    expect(hasVline(off, 1, 1)).toBe(false);
    expect(off.cells).toHaveLength(0);
  });

  it("置けない位置では何も変わらない", () => {
    expect(setVline(base, 2, 0, true)).toBe(base);
  });
});

describe("行の追加・削除", () => {
  it("行を足せる", () => {
    expect(addRow(emptyCircuit(4, 2)).rows).toBe(3);
  });

  it("行を消すと下の行が繰り上がる", () => {
    const c = ladder(4)
      .row(no("X0"), out("Y0"))
      .row(no("X1"), out("Y1"))
      .row(no("X2"), out("Y2"))
      .build();
    const next = removeRow(c, 1);
    expect(next.rows).toBe(2);
    expect(elementAt(next, 0, 0)).toEqual(no("X0"));
    expect(elementAt(next, 1, 0)).toEqual(no("X2"));
  });

  it("最後の 1 行は消せない", () => {
    const c = ladder(3).row(no("X0"), out("Y0")).build();
    expect(removeRow(c, 0)).toBe(c);
  });

  it("消した結果、最終行に来る縦線は落とされる", () => {
    const c = ladder(4).row(no("X0"), out("Y0")).row(no("X1")).row(no("X2")).v(1, 0).build();
    expect(hasVline(c, 1, 0)).toBe(true);
    const next = removeRow(c, 0);
    // 行 1 → 行 0 に繰り上がり、行数 2 なので行 0 の縦線は残る
    expect(next.rows).toBe(2);
    expect(hasVline(next, 0, 0)).toBe(true);
    // さらに 1 行消すと、残った縦線は最終行になるので落ちる
    const last = removeRow(next, 0);
    expect(last.rows).toBe(1);
    expect(hasVline(last, 0, 0)).toBe(false);
  });
});

describe("列の追加・削除", () => {
  it("列を足すと、コイルは新しい最右列へ移り、間が横線でつながる", () => {
    const c = ladder(3).row(no("X0"), out("Y0")).build();
    const next = addColumn(c);
    expect(next.cols).toBe(4);
    expect(elementAt(next, 0, 0)).toEqual(no("X0"));
    expect(elementAt(next, 0, 1)).toEqual(wire);
    expect(elementAt(next, 0, 2)).toEqual(wire);
    expect(elementAt(next, 0, 3)).toEqual(out("Y0"));
  });

  it("列を足しても動作は変わらない", () => {
    const c = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const wide = addColumn(c);
    for (const circuit of [c, wide]) {
      const sim = new Simulator(circuit);
      sim.setInput("X0", true);
      for (let i = 0; i < 5; i++) sim.scan(0);
      sim.setInput("X0", false);
      for (let i = 0; i < 5; i++) sim.scan(0);
      expect(sim.read("Y0")).toBe(true); // 自己保持
    }
  });

  it("列を消すとコイルが新しい最右列へ移り、そこにあった要素は捨てられる", () => {
    const c = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
    const next = removeColumn(c);
    expect(next.cols).toBe(3);
    expect(elementAt(next, 0, 0)).toEqual(no("X0"));
    expect(elementAt(next, 0, 1)).toEqual(nc("X1"));
    expect(elementAt(next, 0, 2)).toEqual(out("Y0"));
  });

  it("2 列より狭くはできない", () => {
    const c = emptyCircuit(2, 1);
    expect(removeColumn(c)).toBe(c);
  });

  it("列を消した結果、最右列に来る縦線は落とされる", () => {
    // cols=4 なら col 2 の縦線は合法だが、cols=3 にすると最右列になるので落ちる
    const c = ladder(4).row(no("X0"), out("Y0")).row(no("X1")).v(0, 2).build();
    expect(hasVline(c, 0, 2)).toBe(true);
    const next = removeColumn(c);
    expect(next.cols).toBe(3);
    expect(hasVline(next, 0, 2)).toBe(false);
  });

  it("コイルの無い行でも、新しい最右列に来る接点は捨てられる(最右列はコイル専用)", () => {
    const c = ladder(4).row(no("X0"), nc("X1"), no("X2")).build();
    const next = removeColumn(c);
    expect(next.cols).toBe(3);
    expect(elementAt(next, 0, 0)).toEqual(no("X0"));
    expect(elementAt(next, 0, 1)).toEqual(nc("X1"));
    expect(elementAt(next, 0, 2)).toBeUndefined();
  });

  it("コイルの無い行でも、新しい最右列に来る縦線は落とされる", () => {
    const c = ladder(4).row(no("X0"), no("X1")).row(no("X2")).v(0, 2).build();
    expect(hasVline(c, 0, 2)).toBe(true);
    const next = removeColumn(c);
    expect(next.cols).toBe(3);
    expect(hasVline(next, 0, 2)).toBe(false);
    expect(elementAt(next, 0, 1)).toEqual(no("X1"));
  });

  it("縮めても最右列より左の縦線は残る", () => {
    const c = ladder(4).row(no("X0"), out("Y0")).row(no("X1")).v(0, 1).build();
    const next = removeColumn(c);
    expect(next.cols).toBe(3);
    expect(hasVline(next, 0, 1)).toBe(true);
  });

  it("タイマ・カウンタの設定値は移動しても保たれる", () => {
    const c = ladder(3).row(no("X0"), timer("T0", 2500)).row(no("X1"), counter("C0", 7)).build();
    const next = addColumn(c);
    expect(elementAt(next, 0, 3)).toEqual(timer("T0", 2500));
    expect(elementAt(next, 1, 3)).toEqual(counter("C0", 7));
  });
});

describe("行をつなぐ", () => {
  it("接点とコイルの間の空きが横線で埋まる", () => {
    let c = emptyCircuit(5, 1);
    c = putElement(c, 0, 0, no("X0"));
    c = putElement(c, 0, 4, out("Y0"));
    const joined = connectRow(c, 0);
    expect(elementAt(joined, 0, 1)).toEqual(wire);
    expect(elementAt(joined, 0, 2)).toEqual(wire);
    expect(elementAt(joined, 0, 3)).toEqual(wire);
    expect(elementAt(joined, 0, 4)).toEqual(out("Y0"));
  });

  it("コイルが無い行は、右端の要素までを埋める", () => {
    let c = emptyCircuit(5, 1);
    c = putElement(c, 0, 2, no("X0"));
    const joined = connectRow(c, 0);
    expect(elementAt(joined, 0, 0)).toEqual(wire);
    expect(elementAt(joined, 0, 1)).toEqual(wire);
    expect(elementAt(joined, 0, 3)).toBeUndefined(); // 右端より右は埋めない
  });

  it("既にある要素は置き換えない", () => {
    let c = emptyCircuit(4, 1);
    c = putElement(c, 0, 0, no("X0"));
    c = putElement(c, 0, 2, nc("X1"));
    const joined = connectRow(c, 0);
    expect(elementAt(joined, 0, 0)).toEqual(no("X0"));
    expect(elementAt(joined, 0, 1)).toEqual(wire);
    expect(elementAt(joined, 0, 2)).toEqual(nc("X1"));
  });

  it("空の行と範囲外は何もしない", () => {
    const c = emptyCircuit(4, 2);
    expect(connectRow(c, 0)).toBe(c);
    expect(connectRow(c, 9)).toBe(c);
  });

  it("つないだ行は実際に通電する", () => {
    let c = emptyCircuit(5, 1);
    c = putElement(c, 0, 0, no("X0"));
    c = putElement(c, 0, 4, out("Y0"));
    c = connectRow(c, 0);
    const sim = new Simulator(c);
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("編集した回路は常に妥当", () => {
  it("一連の編集でスキーマ違反にならない", () => {
    let c = emptyCircuit(4, 1);
    c = putElement(c, 0, 0, no("X0"));
    c = putElement(c, 0, 1, nc("X1"));
    c = putElement(c, 0, 3, out("Y0"));
    c = connectRow(c, 0); // 接点とコイルの間の空きを横線で埋める
    c = addRow(c);
    c = putElement(c, 1, 0, no("Y0"));
    c = setVline(c, 0, 0, true);
    c = addColumn(c);
    c = removeColumn(c);

    const sim = new Simulator(c);
    sim.setInput("X0", true);
    for (let i = 0; i < 5; i++) sim.scan(0);
    sim.setInput("X0", false);
    for (let i = 0; i < 5; i++) sim.scan(0);
    expect(sim.read("Y0")).toBe(true);
  });
});

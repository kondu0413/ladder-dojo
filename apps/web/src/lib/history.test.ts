import { describe, expect, it } from "vitest";
import { canRedo, canUndo, createHistory, HISTORY_LIMIT, push, redo, undo } from "./history.js";

describe("編集の履歴(元に戻す / やり直す)", () => {
  it("積んだ順に戻れて、戻った分だけやり直せる", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = push(h, "c");
    expect(h.present).toBe("c");
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);

    h = undo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present).toBe("b");
    h = redo(h);
    expect(h.present).toBe("c");
    expect(canRedo(h)).toBe(false);
  });

  it("戻ったあとに新しく積むと、やり直しの枝は消える", () => {
    let h = createHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    h = undo(h);
    h = push(h, 4);
    expect(h.present).toBe(4);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(2);
  });

  it("同じ値を積んでも履歴は増えない", () => {
    const value = { x: 1 };
    let h = createHistory(value);
    h = push(h, value);
    expect(canUndo(h)).toBe(false);
  });

  it("空の履歴で戻す・やり直すをしても壊れない", () => {
    const h = createHistory("only");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("上限を超えたら古いものから捨てる", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
    expect(h.present).toBe(HISTORY_LIMIT + 20);
  });
});

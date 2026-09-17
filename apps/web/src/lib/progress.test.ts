import { describe, expect, it } from "vitest";
import { chunkEntries } from "./progress.js";

/** 端末に溜めた進捗の扱い(S-002 / S-032) */
describe("chunkEntries(S-032)", () => {
  it("上限ちょうどまでは 1 回で送る", () => {
    expect(
      chunkEntries(
        Array.from({ length: 45 }, (_, i) => i),
        45,
      ),
    ).toHaveLength(1);
  });

  it("**超えた分を捨てない**。全部が必ずどれかの束に入る", () => {
    const items = Array.from({ length: 101 }, (_, i) => i);
    const chunks = chunkEntries(items, 45);
    expect(chunks).toHaveLength(3);
    expect(chunks.flat()).toEqual(items);
  });

  it("空なら束も空", () => {
    expect(chunkEntries([], 45)).toEqual([]);
  });

  it("分割数が 0 以下なら例外(無限ループにしない)", () => {
    expect(() => chunkEntries([1], 0)).toThrow(/分割数が不正/);
  });
});

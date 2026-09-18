import { describe, expect, it } from "vitest";
import { findGlossaryEntry, GLOSSARY, tokenizeGlossary } from "./glossary.js";

describe("用語集(S-041)", () => {
  it("SPEC.md §7 の用語がすべて入っている", () => {
    for (const term of [
      "ラング",
      "a 接点",
      "b 接点",
      "自己保持",
      "インターロック",
      "スキャン",
      "振る舞い判定",
    ]) {
      const tokens = tokenizeGlossary(term);
      expect(tokens.map((t) => t.kind)).toEqual(["term"]);
    }
  });

  it("id は重複せず、関連語はすべて存在する", () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of GLOSSARY) {
      for (const related of entry.related ?? []) {
        expect(findGlossaryEntry(related), `${entry.id} → ${related}`).toBeDefined();
      }
    }
  });

  it("本文の中の用語は、最初の 1 回だけリンクにする", () => {
    const tokens = tokenizeGlossary("自己保持を作る。自己保持は基本。");
    expect(tokens).toEqual([
      { kind: "term", text: "自己保持", entry: findGlossaryEntry("selfhold") },
      { kind: "text", text: "を作る。自己保持は基本。" },
    ]);
  });

  it("長い語を優先する(オンディレイタイマ ≠ タイマ + 何か)", () => {
    const tokens = tokenizeGlossary("オンディレイタイマの動き");
    expect(tokens[0]).toMatchObject({ kind: "term", text: "オンディレイタイマ" });
    expect((tokens[0] as { entry: { id: string } }).entry.id).toBe("timer");
  });

  it("英字の略語は、別の語の一部には当てない", () => {
    expect(tokenizeGlossary("FIRST").every((t) => t.kind === "text")).toBe(true);
    expect(
      tokenizeGlossary("X1 で RST を動かす").some((t) => t.kind === "term" && t.text === "RST"),
    ).toBe(true);
  });

  it("**強調** はそのまま強調として分け、中の語はリンクにしない", () => {
    const tokens = tokenizeGlossary("順番が **大事** です。");
    expect(tokens).toEqual([
      { kind: "text", text: "順番が " },
      { kind: "strong", text: "大事" },
      { kind: "text", text: " です。" },
    ]);
  });

  it("用語が無い本文はそのまま", () => {
    expect(tokenizeGlossary("X0 を押す")).toEqual([{ kind: "text", text: "X0 を押す" }]);
    expect(tokenizeGlossary("")).toEqual([]);
  });
});

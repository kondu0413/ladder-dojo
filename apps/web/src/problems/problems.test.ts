import { judge, problemSchema, runTestCase } from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import { findProblem, MODE_ORDER, PROBLEMS, STAGE_ORDER, sortedProblems } from "./index.js";

/**
 * 公式問題の検証(SPEC.md §2.4「問題の判定ロジックはテスト必須。誤判定は学習アプリとして致命的」)。
 *
 * ここが落ちるということは、出題した問題が解けない・答えが間違っている、ということ。
 */

describe("公式問題", () => {
  it("フェーズ1 DoD: 各段階 × 各モードで 2 問以上、合計 30 問以上", () => {
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(30);
    const counts = new Map<string, number>();
    for (const p of PROBLEMS) {
      const key = `${p.stage}/${p.mode}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const missing: string[] = [];
    for (const stage of STAGE_ORDER) {
      for (const mode of MODE_ORDER) {
        const key = `${stage}/${mode}`;
        if ((counts.get(key) ?? 0) < 2) missing.push(`${key}=${counts.get(key) ?? 0}`);
      }
    }
    expect(missing, "2 問に満たない組み合わせ").toEqual([]);
  });

  it("難易度は 1〜5 で、段階が進むほど平均が上がる", () => {
    const avg = (stage: string) => {
      const xs = PROBLEMS.filter((p) => p.stage === stage).map((p) => p.difficulty);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg("selfhold")).toBeLessThan(avg("combo"));
  });

  it("ID が重複していない", () => {
    const ids = PROBLEMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PROBLEMS.map((p) => [p.id, p] as const))("%s はスキーマを満たす", (_id, problem) => {
    expect(() => problemSchema.parse(problem)).not.toThrow();
  });

  it.each(PROBLEMS.map((p) => [p.id, p] as const))(
    "%s の模範解答は自分のテストケースをすべて通る",
    (_id, problem) => {
      const result = judge(problem.solution, problem.testCases);
      const failed = result.cases.filter((c) => !c.passed);
      expect(
        failed.map((c) => ({ case: c.caseId, failure: c.failure })),
        "模範解答が通らないテストケースがある",
      ).toEqual([]);
    },
  );

  it.each(PROBLEMS.filter((p) => p.fix).map((p) => [p.id, p] as const))(
    "%s のバグ入り初期回路は、少なくとも 1 つのテストケースで落ちる",
    (_id, problem) => {
      const initial = problem.fix?.initial;
      expect(initial).toBeDefined();
      if (!initial) return;
      const result = judge(initial, problem.testCases);
      expect(result.passed, "初期回路が最初から正解になっている(直す問題として成立しない)").toBe(
        false,
      );
    },
  );

  it.each(
    PROBLEMS.filter((p) => p.read).flatMap((p) =>
      (p.read?.questions ?? []).map((q) => [`${p.id}/${q.id}`, p, q] as const),
    ),
  )("%s の予測問題は、模範解答を動かして答え合わせできる", (_id, problem, question) => {
    // scenario を模範解答に流して、例外なく最後まで実行できることを確かめる
    const result = runTestCase(problem.solution, {
      id: question.id,
      title: question.prompt.slice(0, 50),
      steps: [...question.scenario, { type: "expect", outputs: {} }],
    });
    expect(result.failure?.kind).not.toBe("unstable");
    expect(result.failure?.kind).not.toBe("limit");
  });

  it("並び順は 段階 → モード の順になる", () => {
    const sorted = sortedProblems();
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      const ps = STAGE_ORDER.indexOf(prev.stage);
      const cs = STAGE_ORDER.indexOf(cur.stage);
      expect(ps).toBeLessThanOrEqual(cs);
      if (ps === cs) {
        expect(MODE_ORDER.indexOf(prev.mode)).toBeLessThanOrEqual(MODE_ORDER.indexOf(cur.mode));
      }
    }
  });

  it("ID で引ける", () => {
    const first = PROBLEMS[0];
    expect(first).toBeDefined();
    if (first) expect(findProblem(first.id)?.id).toBe(first.id);
    expect(findProblem("no-such-problem")).toBeUndefined();
  });
});

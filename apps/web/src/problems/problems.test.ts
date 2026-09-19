import {
  type Circuit,
  diagnose,
  judge,
  type Problem,
  problemSchema,
  replayScenario,
  runTestCase,
  startFrameIndex,
} from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import {
  findProblem,
  MODE_ORDER,
  nextProblem,
  PROBLEMS,
  recommendedProblem,
  STAGE_ORDER,
  sortedProblems,
} from "./index.js";

/**
 * 公式問題の検証(SPEC.md §2.4「問題の判定ロジックはテスト必須。誤判定は学習アプリとして致命的」)。
 *
 * ここが落ちるということは、出題した問題が解けない・答えが間違っている、ということ。
 */

/** 2 つの回路で中身が違うマスの数 */
function changedCellCount(a: Circuit, b: Circuit): number {
  const at = (c: Circuit, row: number, col: number) =>
    c.cells.find((x) => x.row === row && x.col === col);
  let n = 0;
  for (let row = 0; row < Math.max(a.rows, b.rows); row++) {
    for (let col = 0; col < Math.max(a.cols, b.cols); col++) {
      const ea = at(a, row, col);
      const eb = at(b, row, col);
      const sa = JSON.stringify({ element: ea?.element, vline: ea?.vline === true });
      const sb = JSON.stringify({ element: eb?.element, vline: eb?.vline === true });
      if (sa !== sb) n++;
    }
  }
  return n;
}

/** 判定の期待値に使える出力だけ取り出す(入力 X は期待値にしない) */
function pickOutputs(bits: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [device, on] of Object.entries(bits)) {
    if (!device.startsWith("X")) out[device] = on;
  }
  return out;
}

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

  it("どの段階にも、やさしい入口(難易度 2 以下)がある", () => {
    const missing = STAGE_ORDER.filter((stage) => {
      const xs = PROBLEMS.filter((p) => p.stage === stage);
      return !xs.some((p) => p.difficulty <= 2);
    });
    expect(missing, "いきなり難しい問題から始まる段階がある").toEqual([]);
  });

  it("各段階の先頭は、その段階でいちばんやさしい問題である", () => {
    const sorted = sortedProblems();
    for (const stage of STAGE_ORDER) {
      const xs = sorted.filter((p) => p.stage === stage);
      const first = xs[0];
      if (!first) continue;
      const easiest = Math.min(...xs.map((p) => p.difficulty));
      expect(first.difficulty, `${stage} の先頭が ${first.id}(難易度 ${first.difficulty})`).toBe(
        easiest,
      );
    }
  });

  it("難易度は 1〜5 で、段階が進むほど平均が上がる", () => {
    const avg = (stage: string) => {
      const xs = PROBLEMS.filter((p) => p.stage === stage).map((p) => p.difficulty);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    for (const p of PROBLEMS) {
      expect(p.difficulty, p.id).toBeGreaterThanOrEqual(1);
      expect(p.difficulty, p.id).toBeLessThanOrEqual(5);
    }
    // 隣り合う段階どうしで見る(最初と最後だけ比べても、途中の逆転を見逃す)
    for (let i = 1; i < STAGE_ORDER.length; i++) {
      const prev = STAGE_ORDER[i - 1];
      const cur = STAGE_ORDER[i];
      if (!prev || !cur) continue;
      expect(avg(prev), `${prev} → ${cur}`).toBeLessThanOrEqual(avg(cur));
    }
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

  describe("直す問題のヒント(S-025)", () => {
    it.each(PROBLEMS.filter((p) => p.fix).map((p) => [p.id, p] as const))(
      "%s の bugCount は、実際に直すマスの数より多くない",
      (_id, problem) => {
        const initial = problem.fix?.initial;
        if (!initial) return;
        // bugCount は「不具合の個数」で、直すマスの数ではない。
        // 1 つの不具合が複数マスにまたがるのはよいが、**マスの数より多い**のは
        // 数え方がおかしい(直しようがない不具合を数えていることになる)
        const cells = changedCellCount(initial, problem.solution);
        expect(problem.fix?.bugCount ?? 0).toBeLessThanOrEqual(cells);
      },
    );

    it.each(PROBLEMS.filter((p) => p.fix).map((p) => [p.id, p] as const))(
      "%s は 1 マス直すだけでは通らないことがある(「か所」と言えない理由)",
      (_id, problem) => {
        const initial = problem.fix?.initial;
        if (!initial) return;
        // ここは記録のためのテスト。9 問中 5 問で複数マスを触る必要があり、
        // 画面で「N か所」と言うと誤解を招く
        expect(changedCellCount(initial, problem.solution)).toBeGreaterThan(0);
      },
    );
  });

  describe("答え合わせの再生(S-022)", () => {
    const readQuestions = PROBLEMS.filter((p) => p.read).flatMap((p) =>
      (p.read?.questions ?? []).map((q) => [`${p.id}/${q.id}`, p, q] as const),
    );

    it.each(readQuestions)("%s は最後まで再生できる", (_id, problem, question) => {
      // 途中で止まると、学習者には「状態が落ち着かないため途中で止めました」と出る。
      // 公式問題でそれが出るのは、問題のほうがおかしい
      const { frames, stopped } = replayScenario(problem.solution, question.scenario);
      expect(stopped, "再生が途中で止まった").toBeUndefined();
      // 操作前の 1 駒 + 操作のぶん(expect は駒にしない。「押して離す」は 2 駒、S-047)
      const operations = question.scenario.reduce(
        (n, step) => n + (step.type === "expect" ? 0 : step.type === "press" ? 2 : 1),
        0,
      );
      expect(frames).toHaveLength(operations + 1);
    });

    it.each(readQuestions)("%s の再生は判定と食い違わない", (_id, problem, question) => {
      // 答え合わせで見せる動きと、判定の結果がずれていたら教材として成立しない
      const { frames } = replayScenario(problem.solution, question.scenario);
      const last = frames[frames.length - 1];
      expect(last).toBeDefined();
      if (!last) return;

      const judged = runTestCase(problem.solution, {
        id: question.id,
        title: question.prompt.slice(0, 50),
        steps: [
          ...question.scenario,
          // 再生の結果をそのまま期待値にして判定に通す。通れば両者は同じ
          { type: "expect", outputs: pickOutputs(last.snapshot.bits) },
        ],
      });
      expect(judged.passed, "再生の結果で判定が通らない").toBe(true);
    });

    /**
     * 設問のスタート時点(S-048)。「そのあと X1 を押すと」の設問は、前の操作を
     * 済ませた駒から始める。前提の駒は操作前の駒より後にあり、設問で問う操作が
     * そのあとに残っていること。
     * (状態が初期状態と同じになる前提もある: timer-read-1/q2 の「Y0 が消えたあと」。
     * それでも「ここまでの操作」の説明と再生の開始位置には意味がある)
     */
    it.each(readQuestions.filter(([, , q]) => (q.premiseSteps ?? 0) > 0))(
      "%s のスタート時点は操作前より後にあり、問う操作が残っている",
      (_id, problem, question) => {
        const { frames } = replayScenario(problem.solution, question.scenario);
        const at = startFrameIndex(frames, question.premiseSteps ?? 0);
        expect(at).toBeGreaterThan(0);
        expect(at).toBeLessThan(frames.length - 1);
        expect(frames[at]?.index).toBe((question.premiseSteps ?? 0) - 1);
      },
    );

    it("「そのあと」「〜のまま」と続く設問には前提が付いている", () => {
      // 設問文が前の状態を引き継いでいるのに図が初期状態のままだと、
      // 「そのあとってなに?」となる(人間の指摘)
      const continuing = readQuestions.filter(([, , q]) =>
        /^(そのあと|そこから|両方押したまま|左を押したまま)/.test(q.prompt),
      );
      expect(continuing.length).toBeGreaterThan(0);
      for (const [id, , q] of continuing) {
        expect(q.premiseSteps ?? 0, id).toBeGreaterThan(0);
      }
    });
  });

  describe("つまずき診断", () => {
    /** 2 つの回路で中身が違うセルの位置 */
    const changedCells = (a: Circuit, b: Circuit): Set<string> => {
      const at = (c: Circuit, row: number, col: number) =>
        c.cells.find((x) => x.row === row && x.col === col);
      const out = new Set<string>();
      const rows = Math.max(a.rows, b.rows);
      const cols = Math.max(a.cols, b.cols);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const ea = at(a, row, col);
          const eb = at(b, row, col);
          const sa = JSON.stringify({ element: ea?.element, vline: ea?.vline === true });
          const sb = JSON.stringify({ element: eb?.element, vline: eb?.vline === true });
          if (sa !== sb) out.add(`${row},${col}`);
        }
      }
      return out;
    };

    it.each(PROBLEMS.filter((p) => p.fix).map((p) => [p.id, p] as const))(
      "%s のバグ入り初期回路に、何か言えることがある",
      (_id, problem) => {
        const initial = problem.fix?.initial;
        expect(initial).toBeDefined();
        if (!initial) return;
        const result = judge(initial, problem.testCases);
        expect(diagnose(initial, problem.testCases, result).length).toBeGreaterThan(0);
      },
    );

    it.each(PROBLEMS.filter((p) => p.fix).map((p) => [p.id, p] as const))(
      "%s の診断が指すセルは、模範解答と実際に違うセルである",
      (_id, problem) => {
        const initial = problem.fix?.initial;
        if (!initial) return;
        const result = judge(initial, problem.testCases);
        const diagnoses = diagnose(initial, problem.testCases, result);
        const bugCells = changedCells(initial, problem.solution);
        // 「ここを直せば通る」と言い切る診断(kind: "repair")が模範解答と同じセルを
        // 指していたら、学習者を確実に迷わせる。構造の指摘は話題の場所を指すだけなので対象外
        const pointed = diagnoses
          .filter((d) => d.kind === "repair")
          .flatMap((d) => d.cells.map((c) => `${c.row},${c.col}`));
        const misleading = pointed.filter((key) => !bugCells.has(key));
        expect(
          misleading,
          `模範解答と同じセルを「原因」として指している: ${pointed.join(" / ")}`,
        ).toEqual([]);
      },
    );

    it.each(PROBLEMS.map((p) => [p.id, p] as const))(
      "%s の模範解答には何も言わない",
      (_id, problem) => {
        const result = judge(problem.solution, problem.testCases);
        expect(diagnose(problem.solution, problem.testCases, result)).toEqual([]);
      },
    );
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

describe("次の問題(S-038)", () => {
  const order = sortedProblems();

  it("いまの問題の後ろで、まだクリアしていない最初の問題を返す", () => {
    const first = order[0] as (typeof order)[number];
    const second = order[1] as (typeof order)[number];
    expect(nextProblem(first.id, () => false)?.id).toBe(second.id);
  });

  it("クリア済みは飛ばす", () => {
    const [a, b, c] = order as [Problem, Problem, Problem];
    expect(nextProblem(a.id, (id) => id === b.id)?.id).toBe(c.id);
  });

  it("後ろに無ければ先頭に戻って探す", () => {
    const last = order[order.length - 1] as Problem;
    const first = order[0] as Problem;
    expect(nextProblem(last.id, () => false)?.id).toBe(first.id);
  });

  it("全部クリア済みなら undefined", () => {
    expect(nextProblem((order[0] as Problem).id, () => true)).toBeUndefined();
    expect(recommendedProblem(() => true)).toBeUndefined();
  });

  it("勧める 1 問は出題順でいちばん手前の未クリア", () => {
    const [a, b] = order as [Problem, Problem];
    expect(recommendedProblem(() => false)?.id).toBe(a.id);
    expect(recommendedProblem((id) => id === a.id)?.id).toBe(b.id);
  });
});

import type { Problem } from "@ladder-dojo/core";
import { useMemo } from "react";
import { Link } from "react-router";
import { AuthBar } from "../components/AuthBar.js";
import { useProgress } from "../lib/progress-context.jsx";
import { MODE_LABELS, STAGE_LABELS, STAGE_ORDER, sortedProblems } from "../problems/index.js";

/** 公式問題の一覧。段階ごとにまとめ、クリア状況を出す */
export function ProblemListPage() {
  const { get } = useProgress();
  const problems = useMemo(() => sortedProblems(), []);
  const byStage = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const p of problems) {
      const list = map.get(p.stage) ?? [];
      list.push(p);
      map.set(p.stage, list);
    }
    return map;
  }, [problems]);

  const clearedCount = problems.filter((p) => get(p.id).cleared).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">ラダー図トレーニング</h1>
          <div className="flex shrink-0 gap-3 text-sm text-slate-500">
            <Link to="/community" className="underline">
              みんなの問題
            </Link>
            <Link to="/sandbox" className="underline">
              サンドボックス
            </Link>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          「読む」→「直す」→「書く」の順に進みます。ログインしなくても解けます。
        </p>
        <p className="text-xs text-slate-500" data-testid="cleared-count">
          クリア: {clearedCount} / {problems.length} 問
        </p>
        <AuthBar />
      </header>

      {STAGE_ORDER.map((stage) => {
        const list = byStage.get(stage) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={stage}>
            <h2 className="mb-2 text-base font-bold text-slate-800">{STAGE_LABELS[stage]}</h2>
            <ul className="flex flex-col gap-2">
              {list.map((problem) => {
                const p = get(problem.id);
                return (
                  <li key={problem.id}>
                    <Link
                      to={`/problems/${problem.id}`}
                      data-testid={`problem-${problem.id}`}
                      data-cleared={p.cleared}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          p.cleared
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                        aria-hidden="true"
                      >
                        {p.cleared ? "✓" : MODE_LABELS[problem.mode].slice(0, 1)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-slate-800">
                          {problem.title}
                        </span>
                        <span className="text-xs text-slate-500">
                          {MODE_LABELS[problem.mode]} ・ 難易度 {problem.difficulty}
                          {p.attempts > 0 && !p.cleared ? ` ・ ${p.attempts} 回挑戦中` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

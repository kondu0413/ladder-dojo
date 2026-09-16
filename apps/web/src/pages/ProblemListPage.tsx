import type { Problem } from "@ladder-dojo/core";
import { useMemo } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { AuthBar } from "../components/AuthBar.js";
import { ReviewSuggestions } from "../components/ReviewSuggestions.js";
import { Badge, Card, PageHeader, SectionTitle } from "../components/ui.js";
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
  const percent = problems.length === 0 ? 0 : Math.round((clearedCount / problems.length) * 100);

  return (
    <AppShell width="wide">
      <PageHeader
        title="公式問題"
        lead="「読む」→「直す」→「書く」の順に進みます。ログインしなくても解けます。"
      />

      {/* 進み具合。数字と帯の両方を出す(色だけに頼らない) */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            {/* 数はまとめて 1 つの要素に入れる。分けるとテストから読みにくい */}
            <span className="text-sm text-slate-500" data-testid="cleared-count">
              <span className="text-3xl font-bold tabular-nums text-slate-900">{clearedCount}</span>{" "}
              / {problems.length} 問クリア
            </span>
            <span className="text-sm text-slate-400">({percent}%)</span>
          </div>
          <div className="w-full sm:w-auto sm:min-w-64">
            <AuthBar />
          </div>
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${problems.length} 問中 ${clearedCount} 問クリア`}
        >
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
        </div>
      </Card>

      <ReviewSuggestions problems={problems} />

      <div className="flex flex-col gap-8">
        {STAGE_ORDER.map((stage) => {
          const list = byStage.get(stage) ?? [];
          if (list.length === 0) return null;
          const done = list.filter((p) => get(p.id).cleared).length;
          return (
            <section key={stage}>
              <SectionTitle count={`${done} / ${list.length}`}>{STAGE_LABELS[stage]}</SectionTitle>
              {/* 広い画面では並べる。1 列のままだと左右が大きく空く */}
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((problem) => {
                  const p = get(problem.id);
                  return (
                    <li key={problem.id}>
                      <Link
                        to={`/problems/${problem.id}`}
                        data-testid={`problem-${problem.id}`}
                        data-cleared={p.cleared}
                        className="flex h-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                            p.cleared
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                          aria-hidden="true"
                        >
                          {p.cleared ? "✓" : MODE_LABELS[problem.mode].slice(0, 1)}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1.5">
                          <span className="text-sm font-semibold leading-snug text-slate-900">
                            {problem.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={p.cleared ? "green" : "blue"}>
                              {MODE_LABELS[problem.mode]}
                            </Badge>
                            <Badge>難易度 {problem.difficulty}</Badge>
                            {p.attempts > 0 && !p.cleared && (
                              <Badge tone="amber">{p.attempts} 回挑戦中</Badge>
                            )}
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
      </div>
    </AppShell>
  );
}

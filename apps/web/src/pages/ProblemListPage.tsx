import type { Problem, ProblemStage } from "@ladder-dojo/core";
import { useMemo } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { ReviewSuggestions } from "../components/ReviewSuggestions.js";
import {
  Badge,
  Card,
  Difficulty,
  Icon,
  type IconName,
  MODE_STYLE,
  PageHeader,
  ProgressBar,
  SectionTitle,
} from "../components/ui.js";
import { useProgress } from "../lib/progress-context.jsx";
import { MODE_LABELS, STAGE_LABELS, STAGE_ORDER, sortedProblems } from "../problems/index.js";

/** 段階ごとの記号。一覧の見出しに添える */
const STAGE_ICON: Record<ProblemStage, IconName> = {
  selfhold: "bolt",
  timer: "clock",
  counter: "hash",
  interlock: "lock",
  combo: "layers",
};

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
      <Card padded className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex items-baseline gap-2">
            {/* 数はまとめて 1 つの要素に入れる。分けるとテストから読みにくい */}
            <span className="text-sm text-slate-500" data-testid="cleared-count">
              <span className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">
                {clearedCount}
              </span>{" "}
              / {problems.length} 問クリア
            </span>
            <span className="text-sm tabular-nums text-slate-400">({percent}%)</span>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="段階ごとの進み具合">
            {STAGE_ORDER.map((stage) => {
              const list = byStage.get(stage) ?? [];
              const done = list.filter((p) => get(p.id).cleared).length;
              const complete = list.length > 0 && done === list.length;
              return (
                <li
                  key={stage}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    complete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <Icon name={complete ? "check" : STAGE_ICON[stage]} className="h-3 w-3" />
                  {STAGE_LABELS[stage]}
                  <span className="font-mono tabular-nums text-slate-500">
                    {done}/{list.length}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <ProgressBar
          value={clearedCount}
          max={problems.length}
          label={`${problems.length} 問中 ${clearedCount} 問クリア`}
        />
      </Card>

      <ReviewSuggestions problems={problems} />

      <div className="flex flex-col gap-8">
        {STAGE_ORDER.map((stage) => {
          const list = byStage.get(stage) ?? [];
          if (list.length === 0) return null;
          const done = list.filter((p) => get(p.id).cleared).length;
          return (
            <section key={stage} className="flex flex-col gap-3">
              <SectionTitle icon={STAGE_ICON[stage]} count={`${done} / ${list.length}`}>
                {STAGE_LABELS[stage]}
              </SectionTitle>
              {/* 広い画面では並べる。1 列のままだと左右が大きく空く */}
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((problem) => {
                  const p = get(problem.id);
                  const mode = MODE_STYLE[problem.mode];
                  return (
                    <li key={problem.id}>
                      <Link
                        to={`/problems/${problem.id}`}
                        data-testid={`problem-${problem.id}`}
                        data-cleared={p.cleared}
                        className="group flex h-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-float"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            p.cleared ? "bg-emerald-100 text-emerald-700" : mode.tile
                          }`}
                          aria-hidden="true"
                        >
                          <Icon name={p.cleared ? "check" : mode.icon} className="h-5 w-5" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="text-sm font-semibold leading-snug text-slate-900">
                            {problem.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge tone={p.cleared ? "green" : mode.tone}>
                              {p.cleared ? "クリア" : MODE_LABELS[problem.mode]}
                            </Badge>
                            <Difficulty level={problem.difficulty} />
                            {p.attempts > 0 && !p.cleared && (
                              <Badge tone="amber">{p.attempts} 回挑戦中</Badge>
                            )}
                          </span>
                        </span>
                        <Icon
                          name="chevronRight"
                          className="mt-0.5 h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500"
                        />
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

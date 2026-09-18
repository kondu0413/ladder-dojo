import type { Problem, ProblemMode, ProblemStage } from "@ladder-dojo/core";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { ReviewSuggestions } from "../components/ReviewSuggestions.js";
import {
  Badge,
  buttonClass,
  Card,
  Difficulty,
  EmptyState,
  Icon,
  type IconName,
  MODE_STYLE,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Segmented,
} from "../components/ui.js";
import { useProgress } from "../lib/progress-context.jsx";
import {
  MODE_LABELS,
  recommendedProblem,
  STAGE_LABELS,
  STAGE_ORDER,
  sortedProblems,
} from "../problems/index.js";

/** 段階ごとの記号。一覧の見出しに添える */
const STAGE_ICON: Record<ProblemStage, IconName> = {
  selfhold: "bolt",
  timer: "clock",
  counter: "hash",
  interlock: "lock",
  combo: "layers",
};

type StatusFilter = "all" | "todo" | "done";
type ModeFilter = "all" | ProblemMode;

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "todo", label: "未クリア" },
  { value: "done", label: "クリア済み" },
];

const MODE_OPTIONS: ReadonlyArray<{ value: ModeFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "read", label: "読む" },
  { value: "fix", label: "直す" },
  { value: "write", label: "書く" },
];

function parseStatus(value: string | null): StatusFilter {
  return value === "todo" || value === "done" ? value : "all";
}

function parseMode(value: string | null): ModeFilter {
  return value === "read" || value === "fix" || value === "write" ? value : "all";
}

/** 公式問題の一覧。段階ごとにまとめ、クリア状況を出す */
export function ProblemListPage() {
  const { get } = useProgress();
  const problems = useMemo(() => sortedProblems(), []);
  // 絞り込みは URL に持つ(S-038)。戻るで戻れるし、「未クリアだけ」の一覧を人に渡せる
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get("status"));
  const mode = parseMode(params.get("mode"));
  const setFilter = (key: "status" | "mode", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const isCleared = (id: string) => get(id).cleared;
  const visible = problems.filter((p) => {
    if (mode !== "all" && p.mode !== mode) return false;
    if (status === "todo" && isCleared(p.id)) return false;
    if (status === "done" && !isCleared(p.id)) return false;
    return true;
  });
  const byStage = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const p of visible) {
      const list = map.get(p.stage) ?? [];
      list.push(p);
      map.set(p.stage, list);
    }
    return map;
  }, [visible]);

  const clearedCount = problems.filter((p) => isCleared(p.id)).length;
  const percent = problems.length === 0 ? 0 : Math.round((clearedCount / problems.length) * 100);
  const recommended = recommendedProblem(isCleared, problems);
  const filtering = status !== "all" || mode !== "all";

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
              const list = problems.filter((p) => p.stage === stage);
              const done = list.filter((p) => isCleared(p.id)).length;
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
        {/* 次の 1 問(S-038)。一覧を眺めなくても、続きから始められる */}
        {recommended ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${MODE_STYLE[recommended.mode].tile}`}
                aria-hidden="true"
              >
                <Icon name={MODE_STYLE[recommended.mode].icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-500">
                  {clearedCount === 0 ? "ここから始める" : "続きはここから"}
                </span>
                <span className="block truncate text-sm font-bold text-slate-900">
                  {recommended.title}
                </span>
              </span>
            </div>
            <Link
              to={`/problems/${recommended.id}`}
              data-testid="recommended-problem"
              className={buttonClass("accent", "", "sm")}
            >
              解く
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
            data-testid="all-cleared"
          >
            <Icon name="check" className="h-4 w-4" />
            公式問題はすべてクリアしました。みんなの問題やサンドボックスへどうぞ
          </div>
        )}
      </Card>

      <ReviewSuggestions problems={problems} />

      {/* 絞り込み。45 問になったので、いま解きたい種類だけを出せるようにする */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">状態</span>
          <Segmented<StatusFilter>
            size="sm"
            label="クリア状況で絞り込む"
            value={status}
            onChange={(v) => setFilter("status", v)}
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              testId: `filter-status-${o.value}`,
            }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">モード</span>
          <Segmented<ModeFilter>
            size="sm"
            label="モードで絞り込む"
            value={mode}
            onChange={(v) => setFilter("mode", v)}
            options={MODE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              testId: `filter-mode-${o.value}`,
            }))}
          />
        </div>
        {filtering && (
          <span className="text-xs text-slate-500" data-testid="filter-count">
            {visible.length} 問
          </span>
        )}
      </div>

      {visible.length === 0 && (
        <EmptyState
          icon="search"
          data-testid="filter-empty"
          title="この条件の問題はありません"
          body="絞り込みを「すべて」に戻すと全部出ます。"
        />
      )}

      <div className="flex flex-col gap-8">
        {STAGE_ORDER.map((stage) => {
          const list = byStage.get(stage) ?? [];
          if (list.length === 0) return null;
          const all = problems.filter((p) => p.stage === stage);
          const done = all.filter((p) => isCleared(p.id)).length;
          return (
            <section key={stage} className="flex flex-col gap-3">
              <SectionTitle icon={STAGE_ICON[stage]} count={`${done} / ${all.length}`}>
                {STAGE_LABELS[stage]}
              </SectionTitle>
              {/* 広い画面では並べる。1 列のままだと左右が大きく空く */}
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((problem) => {
                  const p = get(problem.id);
                  const modeStyle = MODE_STYLE[problem.mode];
                  return (
                    <li key={problem.id}>
                      <Link
                        to={`/problems/${problem.id}`}
                        data-testid={`problem-${problem.id}`}
                        data-cleared={p.cleared}
                        className="group flex h-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-[box-shadow,border-color] duration-150 hover:border-slate-300 hover:shadow-float"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            p.cleared ? "bg-emerald-100 text-emerald-700" : modeStyle.tile
                          }`}
                          aria-hidden="true"
                        >
                          <Icon name={p.cleared ? "check" : modeStyle.icon} className="h-5 w-5" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="text-sm font-semibold leading-snug text-slate-900">
                            {problem.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge tone={p.cleared ? "green" : modeStyle.tone}>
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

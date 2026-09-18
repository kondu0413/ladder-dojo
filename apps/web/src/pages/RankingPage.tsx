import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell.js";
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  Notice,
  PageHeader,
  Segmented,
  Skeleton,
  selectClass,
} from "../components/ui.js";
import {
  api,
  isAborted,
  type OrgSummary,
  type Ranking,
  type RankingMetric,
  type RankingPeriod,
} from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";

const METRICS: Array<{ value: RankingMetric; label: string; unit: string }> = [
  { value: "solved", label: "解いた問題数", unit: "問" },
  { value: "authored_solved", label: "作った問題が解かれた数", unit: "回" },
  { value: "authored_likes", label: "作った問題のいいね", unit: "件" },
  { value: "streak", label: "連続学習日数", unit: "日" },
];

const PERIODS: Array<{ value: RankingPeriod; label: string }> = [
  { value: "weekly", label: "週間" },
  { value: "monthly", label: "月間" },
  { value: "all", label: "累計" },
];

/** 上位 3 人の色。数字も出すので、色が分からなくても順位は読める */
const MEDAL: Record<number, string> = {
  1: "bg-amber-400 text-slate-950",
  2: "bg-slate-300 text-slate-800",
  3: "bg-orange-300 text-orange-950",
};

/**
 * ランキング(SPEC.md §3.7)。
 * 速さは競わせない。貢献・継続の指標だけを出す。
 */
export function RankingPage() {
  const { user } = useProgress();
  const [metric, setMetric] = useState<RankingMetric>("solved");
  const [period, setPeriod] = useState<RankingPeriod>("weekly");
  const [orgId, setOrgId] = useState<string>("");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [data, setData] = useState<Ranking | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setOrgId("");
      return;
    }
    api
      .listOrgs()
      .then((res) => setOrgs(res.orgs))
      .catch(() => setOrgs([]));
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .ranking({ metric, period, ...(orgId ? { orgId } : {}) }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setData(res);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (isAborted(err) || controller.signal.aborted) return;
        setError("ランキングを読み込めませんでした。");
      });
    return () => controller.abort();
  }, [metric, period, orgId]);

  const unit = METRICS.find((m) => m.value === metric)?.unit ?? "";
  const isStreak = metric === "streak";

  return (
    <AppShell width="wide">
      <PageHeader
        title="ランキング"
        lead="速さは競いません。解いた数・作った問題への反応・続けた日数で並びます。"
      />

      <Card padded className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <Chip
              key={m.value}
              data-testid={`metric-${m.value}`}
              active={metric === m.value}
              onClick={() => setMetric(m.value)}
            >
              {m.label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented<RankingPeriod>
            label="期間"
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({
              value: p.value,
              label: p.label,
              testId: `period-${p.value}`,
              disabled: isStreak,
            }))}
          />
          {orgs.length > 0 && (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              data-testid="ranking-scope"
              aria-label="集計範囲"
              className={selectClass("w-auto")}
            >
              <option value="">全体</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {isStreak && (
            <p className="text-xs text-slate-500">
              連続学習日数は「いまの連続」なので、期間では切りません。
            </p>
          )}
        </div>
      </Card>

      {data?.me && (
        <section
          data-testid="ranking-me"
          className="dot-grid flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-slate-950 px-5 py-4 text-white"
        >
          <div className="flex flex-col">
            <p className="text-xs font-semibold text-slate-300">あなたのいま</p>
            <p
              className="font-mono text-3xl font-bold tracking-tight text-amber-300"
              data-testid="ranking-me-value"
            >
              {data.me.value}
              <span className="ml-1 font-sans text-sm font-medium text-slate-300">{unit}</span>
            </p>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            クリアした記録はすぐ残っています。下の順位表への反映は 1 日 1
            回なので、いまの値はここで確かめてください。
          </p>
        </section>
      )}

      {data && (
        <p
          className="flex items-center gap-1.5 text-xs text-slate-500"
          data-testid="ranking-computed-at"
        >
          <Icon name="clock" className="h-3.5 w-3.5" />
          {data.live
            ? "この順位はいま計算した結果です。"
            : `下の順位は ${new Date(data.computedAt).toLocaleString("ja-JP")} 時点のものです。全体ランキングは 1 日 1 回更新されます。`}
        </p>
      )}

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}

      {data && data.entries.length === 0 && (
        <EmptyState
          icon="trophy"
          data-testid="ranking-empty"
          title={data.live ? "まだ記録がありません。" : "まだ順位表ができていません。"}
          body={
            data.live ? "問題を解くと、ここに並びます。" : "全体ランキングは 1 日 1 回作られます。"
          }
        />
      )}

      {data && data.entries.length > 0 && (
        <Card>
          <ol className="divide-y divide-slate-100" data-testid="ranking-list">
            {data.entries.map((e) => {
              const me = e.userId === user?.id;
              return (
                <li
                  key={e.userId}
                  data-testid={`rank-${e.userId}`}
                  className={`flex items-center gap-3 px-4 py-2.5 ${me ? "bg-amber-50" : ""}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold tabular-nums ${
                      MEDAL[e.rank] ?? "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {e.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {e.userName}
                    {me && (
                      <span className="ml-2 text-xs font-semibold text-amber-700">あなた</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-900">
                    {e.value}
                    <span className="ml-0.5 font-sans text-xs font-normal text-slate-500">
                      {unit}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </AppShell>
  );
}

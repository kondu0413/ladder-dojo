import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell.js";
import { AuthBar } from "../components/AuthBar.js";
import { PageHeader } from "../components/ui.js";
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
      .ranking({ metric, period, ...(orgId ? { orgId } : {}) })
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
      <div className="mb-6">
        <AuthBar />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              data-testid={`metric-${m.value}`}
              aria-pressed={metric === m.value}
              onClick={() => setMetric(m.value)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                metric === m.value
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                data-testid={`period-${p.value}`}
                aria-pressed={period === p.value}
                disabled={isStreak}
                onClick={() => setPeriod(p.value)}
                className={`min-h-11 px-3 text-sm font-medium disabled:opacity-40 ${
                  period === p.value && !isStreak
                    ? "bg-slate-700 text-white"
                    : "bg-white text-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {orgs.length > 0 && (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              data-testid="ranking-scope"
              aria-label="集計範囲"
              className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm"
            >
              <option value="">全体</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {isStreak && (
          <p className="text-xs text-slate-500">
            連続学習日数は「いまの連続」なので、期間では切りません。
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && data.entries.length === 0 && (
        <p
          data-testid="ranking-empty"
          className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600"
        >
          まだ記録がありません。
        </p>
      )}

      {data && data.entries.length > 0 && (
        <ol className="flex flex-col gap-1" data-testid="ranking-list">
          {data.entries.map((e) => (
            <li
              key={e.userId}
              data-testid={`rank-${e.userId}`}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                e.userId === user?.id ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"
              }`}
            >
              <span className="w-8 shrink-0 text-right font-mono text-sm text-slate-500">
                {e.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{e.userName}</span>
              <span className="shrink-0 font-mono text-sm font-medium text-slate-900">
                {e.value}
                <span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {data && (
        <p className="text-xs text-slate-400" data-testid="ranking-computed-at">
          {data.live
            ? "この順位はいま計算した結果です。"
            : `${new Date(data.computedAt).toLocaleString("ja-JP")} 時点。全体ランキングは 1 日 1 回更新されます。`}
        </p>
      )}
    </AppShell>
  );
}

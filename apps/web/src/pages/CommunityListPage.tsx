import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { AuthBar } from "../components/AuthBar.js";
import { PageHeader } from "../components/ui.js";
import { api, isAborted, type PostedProblemSummary } from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";

type Sort = "new" | "likes" | "difficulty";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "new", label: "新着" },
  { value: "likes", label: "人気" },
  { value: "difficulty", label: "難しい順" },
];

/** 投稿問題の一覧(SPEC.md §3.6)。未ログインでも見られる */
export function CommunityListPage() {
  const { user } = useProgress();
  const [problems, setProblems] = useState<PostedProblemSummary[]>([]);
  const [sort, setSort] = useState<Sort>("new");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [difficulty, setDifficulty] = useState<number | undefined>(undefined);
  const [mine, setMine] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(
    async (append = false) => {
      setLoading(true);
      setError(undefined);
      try {
        const res = await api.listPosted({
          sort,
          ...(q ? { q } : {}),
          ...(tag ? { tag } : {}),
          ...(difficulty !== undefined ? { difficulty } : {}),
          ...(mine ? { mine: true } : {}),
          ...(append && cursor ? { cursor } : {}),
        });
        setProblems((prev) => (append ? [...prev, ...res.problems] : res.problems));
        setCursor(res.nextCursor);
      } catch (err) {
        if (!isAborted(err)) setError("問題を読み込めませんでした。");
      } finally {
        setLoading(false);
      }
    },
    [sort, q, tag, difficulty, mine, cursor],
  );

  // 検索条件が変わったら先頭から読み直す。
  // 古いリクエストは AbortController で確実に止める(結果の入れ替わりと、無駄な Worker リクエストを防ぐ)
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await api.listPosted(
          {
            sort,
            ...(q ? { q } : {}),
            ...(tag ? { tag } : {}),
            ...(difficulty !== undefined ? { difficulty } : {}),
            ...(mine ? { mine: true } : {}),
          },
          controller.signal,
        );
        setProblems(res.problems);
        setCursor(res.nextCursor);
        setError(undefined);
      } catch (err) {
        if (isAborted(err)) return;
        setError("問題を読み込めませんでした。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [sort, q, tag, difficulty, mine]);

  return (
    <AppShell width="wide">
      <PageHeader
        title="みんなの問題"
        lead="ほかの人が投稿した問題を解けます。サンドボックスで作った回路は、テストを付けて投稿できます。"
      />
      <div className="mb-6">
        <AuthBar />
      </div>

      <section className="flex flex-col gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 100))}
          placeholder="タイトルや仕様文で検索"
          data-testid="search-input"
          aria-label="検索"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                data-testid={`sort-${s.value}`}
                aria-pressed={sort === s.value}
                onClick={() => setSort(s.value)}
                className={`min-h-11 px-3 text-sm font-medium ${
                  sort === s.value ? "bg-slate-700 text-white" : "bg-white text-slate-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            value={difficulty ?? ""}
            onChange={(e) => setDifficulty(e.target.value ? Number(e.target.value) : undefined)}
            data-testid="filter-difficulty"
            aria-label="難易度で絞り込む"
            className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm"
          >
            <option value="">難易度すべて</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                難易度 {d}
              </option>
            ))}
          </select>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value.slice(0, 30))}
            placeholder="タグ"
            data-testid="filter-tag"
            aria-label="タグで絞り込む"
            className="min-h-11 w-28 rounded-lg border border-slate-300 px-2 text-sm"
          />
          {user && (
            <button
              type="button"
              data-testid="filter-mine"
              aria-pressed={mine}
              onClick={() => setMine((v) => !v)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                mine
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              自分の投稿
            </button>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && problems.length === 0 && (
        <p
          data-testid="empty-list"
          className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600"
        >
          該当する問題がありません。
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="posted-list">
        {problems.map((p) => (
          <li key={p.id}>
            <Link
              to={`/community/${p.id}`}
              data-testid={`posted-${p.id}`}
              className="flex h-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <span className="text-sm font-semibold leading-snug text-slate-900">{p.title}</span>
              <span className="line-clamp-2 text-xs leading-relaxed text-slate-500">{p.spec}</span>
              <span className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
                <span>難易度 {p.votedDifficulty ?? p.difficulty}</span>
                <span>♥ {p.likes}</span>
                <span data-testid={`clear-rate-${p.id}`}>
                  クリア率 {p.clearRate === null ? "—" : `${p.clearRate}%`}
                  <span className="ml-1 text-slate-400">
                    ({p.clears}/{p.attempts} 人)
                  </span>
                </span>
                {p.visibility === "private" && (
                  <span className="rounded bg-slate-200 px-1">非公開</span>
                )}
              </span>
              {p.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {cursor && (
        <button
          type="button"
          data-testid="load-more"
          disabled={loading}
          onClick={() => void load(true)}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700"
        >
          もっと読む
        </button>
      )}
    </AppShell>
  );
}

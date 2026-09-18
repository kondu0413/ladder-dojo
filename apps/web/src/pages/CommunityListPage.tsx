import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/AppShell.js";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Chip,
  Difficulty,
  EmptyState,
  Icon,
  inputClass,
  Notice,
  PageHeader,
  Segmented,
  Skeleton,
  selectClass,
} from "../components/ui.js";
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
        actions={
          <Link to="/sandbox" className={buttonClass("secondary")}>
            <Icon name="upload" className="h-4 w-4" />
            サンドボックスから投稿
          </Link>
        }
      />

      <Card padded className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">検索</span>
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 100))}
            placeholder="タイトルや仕様文で検索"
            data-testid="search-input"
            aria-label="検索"
            className={inputClass("pl-9")}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Sort>
            label="並べ替え"
            value={sort}
            onChange={setSort}
            options={SORTS.map((s) => ({
              value: s.value,
              label: s.label,
              testId: `sort-${s.value}`,
            }))}
          />
          <select
            value={difficulty ?? ""}
            onChange={(e) => setDifficulty(e.target.value ? Number(e.target.value) : undefined)}
            data-testid="filter-difficulty"
            aria-label="難易度で絞り込む"
            className={selectClass("w-auto")}
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
            className={inputClass("w-32")}
          />
          {user && (
            <Chip data-testid="filter-mine" active={mine} onClick={() => setMine((v) => !v)}>
              <Icon name="pencil" className="h-3.5 w-3.5" />
              自分の投稿
            </Chip>
          )}
        </div>
      </Card>

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {loading && problems.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {["a", "b", "c"].map((k) => (
            <Skeleton key={k} className="h-36" />
          ))}
        </div>
      )}

      {!loading && problems.length === 0 && (
        <EmptyState
          icon="search"
          title="該当する問題がありません。"
          body="条件を変えるか、サンドボックスで最初の 1 問を作ってみてください。"
          data-testid="empty-list"
        />
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="posted-list">
        {problems.map((p) => (
          <li key={p.id}>
            <Link
              to={`/community/${p.id}`}
              data-testid={`posted-${p.id}`}
              className="group flex h-full flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-[box-shadow,border-color] duration-150 hover:border-slate-300 hover:shadow-float"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug text-slate-900">{p.title}</span>
                {p.visibility === "private" && <Badge icon="lock">非公開</Badge>}
                {p.visibility === "org" && <Badge icon="factory">組織限定</Badge>}
              </span>
              <span className="line-clamp-2 text-xs leading-relaxed text-slate-500">{p.spec}</span>
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-slate-500">
                <Difficulty level={p.votedDifficulty ?? p.difficulty} />
                <span className="inline-flex items-center gap-1">
                  <Icon name="heart" className="h-3.5 w-3.5 text-rose-400" />
                  {p.likes}
                </span>
                <span data-testid={`clear-rate-${p.id}`} className="inline-flex items-center gap-1">
                  <Icon name="target" className="h-3.5 w-3.5 text-slate-400" />
                  クリア率 {p.clearRate === null ? "—" : `${p.clearRate}%`}
                  <span className="text-slate-400">
                    ({p.clears}/{p.attempts} 人)
                  </span>
                </span>
              </span>
              {p.tags.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {cursor && (
        <Button
          tone="secondary"
          className="self-center"
          data-testid="load-more"
          disabled={loading}
          onClick={() => void load(true)}
        >
          もっと読む
        </Button>
      )}
    </AppShell>
  );
}

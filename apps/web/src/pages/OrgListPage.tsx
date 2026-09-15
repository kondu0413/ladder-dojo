import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AuthBar } from "../components/AuthBar.js";
import { ApiError, api, type OrgSummary } from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";

/** 自分が所属する組織の一覧・作成・参加(SPEC.md §3.8) */
export function OrgListPage() {
  const { user } = useProgress();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      return;
    }
    try {
      setOrgs((await api.listOrgs()).orgs);
    } catch {
      setMessage("組織を読み込めませんでした。");
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      await api.createOrg(name.trim());
      setName("");
      await reload();
      setMessage("組織を作りました。");
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.code === "quota_exceeded"
          ? "所属できる組織の上限に達しています。"
          : "組織を作れませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await api.joinOrg(code.trim());
      setCode("");
      await reload();
      setMessage(res.joined ? `${res.org.name} に参加しました。` : "すでに参加しています。");
    } catch {
      setMessage("招待コードが見つからないか、期限切れです。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">組織</h1>
          <div className="flex gap-3 text-sm text-slate-500">
            <Link to="/" className="underline">
              公式問題
            </Link>
            <Link to="/rankings" className="underline">
              ランキング
            </Link>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          会社やチームで使う単位です。管理者はメンバーの学習状況を見て、課題を割り当てられます。
        </p>
        <AuthBar />
      </header>

      {!user && (
        <p className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600">
          組織を使うにはログインしてください。
        </p>
      )}

      {message && (
        <p
          data-testid="org-message"
          role="status"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
        >
          {message}
        </p>
      )}

      {user && (
        <>
          <ul className="flex flex-col gap-2" data-testid="org-list">
            {orgs.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/orgs/${o.id}`}
                  data-testid={`org-${o.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                    {o.name}
                  </span>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                      o.role === "admin" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {o.role === "admin" ? "管理者" : "メンバー"}
                  </span>
                </Link>
              </li>
            ))}
            {orgs.length === 0 && (
              <li
                data-testid="org-empty"
                className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600"
              >
                まだどの組織にも入っていません。
              </li>
            )}
          </ul>

          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-slate-700">組織を作る</h2>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="組織の名前"
                data-testid="org-name"
                aria-label="組織の名前"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
              />
              <button
                type="button"
                data-testid="org-create"
                disabled={busy || name.trim().length === 0}
                onClick={() => void create()}
                className="min-h-11 shrink-0 rounded-lg bg-slate-700 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                作る
              </button>
            </div>
            <p className="text-xs text-slate-500">作った人が管理者になります。</p>
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-slate-700">招待コードで参加する</h2>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 64))}
                placeholder="招待コード"
                data-testid="org-code"
                aria-label="招待コード"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 font-mono text-sm"
              />
              <button
                type="button"
                data-testid="org-join"
                disabled={busy || code.trim().length < 6}
                onClick={() => void join()}
                className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                参加
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

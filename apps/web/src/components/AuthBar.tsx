import { useState } from "react";
import { signInWithGoogle, signOut } from "../lib/auth-client.js";
import { useProgress } from "../lib/progress-context.jsx";

/**
 * ログイン状態の表示と操作(SPEC.md §3.5 / DECISIONS.md D-007: Google ログインのみ)。
 * 未ログインでも問題は解ける。ログインすると進捗がサーバーに同期される。
 */
export function AuthBar() {
  const { user, loading, syncError, pendingMerge, acceptMerge, dismissMerge } = useProgress();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-2" data-testid="auth-bar" data-signed-in={Boolean(user)}>
      <div className="flex items-center justify-between gap-2">
        {loading ? (
          <span className="text-xs text-slate-400">確認中…</span>
        ) : user ? (
          <>
            <span className="truncate text-xs text-slate-600" data-testid="auth-user">
              {user.name || user.email} でログイン中
            </span>
            <button
              type="button"
              data-testid="sign-out"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void signOut().finally(() => setBusy(false));
              }}
              className="min-h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600"
            >
              ログアウト
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-slate-500">
              ログインすると、進捗が端末をまたいで保存されます
            </span>
            <button
              type="button"
              data-testid="sign-in-google"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void signInWithGoogle(window.location.pathname).finally(() => setBusy(false));
              }}
              className="min-h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
            >
              Google でログイン
            </button>
          </>
        )}
      </div>

      {pendingMerge && (
        <div
          data-testid="merge-prompt"
          className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900"
        >
          <p>
            この端末に {Object.keys(pendingMerge).length}{" "}
            問ぶんの進捗が残っています。アカウントに引き継ぎますか?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="merge-accept"
              onClick={() => void acceptMerge()}
              className="min-h-9 rounded-lg bg-sky-700 px-3 text-xs font-medium text-white"
            >
              引き継ぐ
            </button>
            <button
              type="button"
              data-testid="merge-dismiss"
              onClick={dismissMerge}
              className="min-h-9 rounded-lg border border-sky-300 bg-white px-3 text-xs font-medium text-sky-800"
            >
              あとで
            </button>
          </div>
        </div>
      )}

      {syncError && (
        <p
          data-testid="sync-error"
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {syncError}
        </p>
      )}
    </div>
  );
}

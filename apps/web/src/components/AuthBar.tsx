import { useState } from "react";
import { signInWithGoogle, signOut } from "../lib/auth-client.js";
import { useProgress } from "../lib/progress-context.jsx";
import { Button, Icon, Notice } from "./ui.js";

/**
 * ログイン状態の表示と操作(SPEC.md §3.5 / DECISIONS.md D-007: Google ログインのみ)。
 *
 * ヘッダーに置く(S-036)。以前は各画面の本文に「ログインすると…」の帯を
 * 出していて、どの画面でも同じ文が場所を取っていた。ログイン状態は
 * アプリ全体のことなので、ヘッダーの右端に 1 つだけ置く。
 * 未ログインでも問題は解ける。ログインすると進捗がサーバーに同期される。
 */
export function AccountMenu() {
  const { user, loading } = useProgress();
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      data-testid="auth-bar"
      data-signed-in={Boolean(user)}
    >
      {loading ? (
        <span
          className="h-8 w-8 animate-pulse rounded-full bg-white/10"
          role="status"
          aria-label="ログイン状態を確認中"
        />
      ) : user ? (
        <>
          <span
            className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3"
            data-testid="auth-user"
            title={`${user.name || user.email} でログイン中`}
          >
            <Avatar name={user.name || user.email} image={user.image} />
            <span className="max-w-[7rem] truncate text-xs font-medium text-white sm:max-w-[10rem]">
              {user.name || user.email}
            </span>
          </span>
          <button
            type="button"
            data-testid="sign-out"
            disabled={busy}
            aria-label="ログアウト"
            title="ログアウト"
            onClick={() => {
              setBusy(true);
              void signOut().finally(() => setBusy(false));
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <Icon name="logOut" className="h-4 w-4" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          data-testid="sign-in-google"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signInWithGoogle(window.location.pathname).finally(() => setBusy(false));
          }}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <GoogleMark />
          <span className="hidden sm:inline">Google でログイン</span>
          <span className="sm:hidden">ログイン</span>
        </button>
      )}
    </div>
  );
}

/**
 * ログインにまつわるお知らせ。本文の先頭に出す。
 * - 端末の進捗をアカウントに引き継ぐか(S-002)
 * - サーバーとの同期に失敗しているとき
 */
export function AccountNotices() {
  const { syncError, pendingMerge, acceptMerge, dismissMerge } = useProgress();
  if (!pendingMerge && !syncError) return null;

  return (
    <>
      {pendingMerge && (
        <Notice tone="info" data-testid="merge-prompt">
          <p className="font-medium">
            この端末に {Object.keys(pendingMerge).length}{" "}
            問ぶんの進捗が残っています。アカウントに引き継ぎますか?
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" data-testid="merge-accept" onClick={() => void acceptMerge()}>
              引き継ぐ
            </Button>
            <Button size="sm" tone="secondary" data-testid="merge-dismiss" onClick={dismissMerge}>
              あとで
            </Button>
          </div>
        </Notice>
      )}
      {syncError && (
        <Notice tone="warning" role="status" data-testid="sync-error">
          {syncError}
        </Notice>
      )}
    </>
  );
}

/** 名前の頭文字を丸に入れる。写真があればそれを出す */
function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="h-6 w-6 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-slate-950"
    >
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** Google の「G」。ボタンの中に出す */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.8c2.3-2.1 3.6-5.2 3.6-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1.1.7-2.5 1.2-4.2 1.2-3.2 0-5.9-2.2-6.9-5.1H1.1v3.1C3.1 21.3 7.2 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.1 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V6.7H1.1C.4 8.3 0 10.1 0 12s.4 3.7 1.1 5.3l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3.4.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.2 0 3.1 2.7 1.1 6.7l4 3.1c1-2.9 3.7-5.1 6.9-5.1z"
      />
    </svg>
  );
}

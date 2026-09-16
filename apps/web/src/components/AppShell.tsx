import { useState } from "react";
import { Link, useLocation } from "react-router";
import { OfflineNotice } from "./OfflineNotice.js";

/**
 * 全画面で共通の枠(S-020)。
 *
 * ここを 1 つにしている理由は 2 つ。
 *
 * 1. **画面ごとに幅を書いていると、広い画面で揃わない**。以前は全ページが
 *    640px 固定で、1440px のディスプレイでは左右が大きく空いて間延びしていた
 * 2. **ヘッダーを各ページが自前で組んでいた**。スマホでは題名と並んだリンクに
 *    押し出されて、題名が 3 行に折れていた
 *
 * 幅は `width` で選ぶ。読み物は狭く、一覧や表は広く。
 */

export type AppShellProps = {
  children: React.ReactNode;
  /** 本文の最大幅。narrow = 読む画面、wide = 一覧・表 */
  width?: "narrow" | "wide";
  /** ヘッダーを出さない(LP は自前のヘッダーを持つ) */
  bare?: boolean;
};

const WIDTH_CLASS = {
  narrow: "max-w-3xl",
  wide: "max-w-6xl",
} as const;

export function AppShell({ children, width = "wide", bare = false }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      {!bare && <AppHeader />}
      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:py-10 ${WIDTH_CLASS[width]}`}>
        <OfflineNotice />
        {children}
      </main>
      <AppFooter />
    </div>
  );
}

const NAV = [
  { to: "/problems", label: "公式問題" },
  { to: "/community", label: "みんなの問題" },
  { to: "/rankings", label: "ランキング" },
  { to: "/orgs", label: "組織" },
  { to: "/sandbox", label: "サンドボックス" },
] as const;

/**
 * 画面上部の帯。
 *
 * 狭い画面ではリンクを畳んでボタン 1 つにする。並べたままだと題名を押し出して、
 * 「ラダー図 / トレーニ / ング」のように折れてしまう。
 */
function AppHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2" onClick={() => setOpen(false)}>
          <img src="/icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg" />
          <span className="text-base font-bold tracking-tight text-slate-900">ラダー道場</span>
        </Link>

        <nav aria-label="メニュー" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} active={pathname.startsWith(item.to)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          data-testid="nav-toggle"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 md:hidden"
        >
          <span className="sr-only">メニューを開く</span>
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
            <title>メニュー</title>
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="メニュー"
          className="border-t border-slate-200 bg-white px-4 pb-3 md:hidden"
        >
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block min-h-11 py-3 text-sm font-medium text-slate-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}

function AppFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
        PLC のラダー図を「読む」→「直す」→「書く」の順に身につける練習アプリ。
      </div>
    </footer>
  );
}

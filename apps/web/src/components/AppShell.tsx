import { useState } from "react";
import { Link, useLocation } from "react-router";
import { AccountMenu, AccountNotices } from "./AuthBar.js";
import { OfflineNotice } from "./OfflineNotice.js";
import { Icon, type IconName } from "./ui.js";

/**
 * 全画面で共通の枠(S-020 / S-036)。
 *
 * ここを 1 つにしている理由は 2 つ。
 *
 * 1. **画面ごとに幅を書いていると、広い画面で揃わない**。以前は全ページが
 *    640px 固定で、1440px のディスプレイでは左右が大きく空いて間延びしていた
 * 2. **ヘッダーを各ページが自前で組んでいた**。スマホでは題名と並んだリンクに
 *    押し出されて、題名が 3 行に折れていた
 *
 * 本文(`main`)は縦に並べて間隔を持たせる。以前は間隔が無く、各画面が
 * 自前で余白を足していて、足し忘れた画面(サンドボックス・ランキングなど)は
 * 部品同士がくっついていた。
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
      <main
        className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8 ${WIDTH_CLASS[width]}`}
      >
        <OfflineNotice />
        <AccountNotices />
        {children}
      </main>
      <AppFooter />
    </div>
  );
}

const NAV: ReadonlyArray<{ to: string; label: string; icon: IconName }> = [
  { to: "/problems", label: "公式問題", icon: "grid" },
  { to: "/community", label: "みんなの問題", icon: "users" },
  { to: "/sandbox", label: "サンドボックス", icon: "flask" },
  { to: "/samples", label: "サンプル", icon: "cpu" },
  { to: "/rankings", label: "ランキング", icon: "trophy" },
  { to: "/orgs", label: "組織", icon: "factory" },
  { to: "/glossary", label: "用語集", icon: "book" },
];

/** ロゴと名前。ヘッダーと紹介画面で同じものを使う */
export function Brand({ to = "/", onClick }: { to?: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex shrink-0 items-center gap-2.5 rounded-lg">
      <img src="/icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg" />
      <span className="text-[15px] font-bold tracking-tight text-white">ラダー道場</span>
    </Link>
  );
}

/**
 * 画面上部の帯。紺地に白。母線とアイコンの色に合わせている。
 *
 * 狭い画面ではリンクを畳んでボタン 1 つにする。並べたままだと題名を押し出して、
 * 「ラダー図 / トレーニ / ング」のように折れてしまう。
 * 並べるのは 1024px から。768px では 6 つのリンクとログイン状態が入りきらず、
 * 右端がはみ出していた。
 */
function AppHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // どこかへ移ったら畳む。開いたまま次の画面に行くと、上半分が隠れたままになる
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950 text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Brand onClick={close} />

        <nav aria-label="メニュー" className="ml-4 hidden h-full items-stretch gap-0.5 lg:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} active={pathname.startsWith(item.to)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <AccountMenu />
          <button
            type="button"
            data-testid="nav-toggle"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 lg:hidden"
          >
            <span className="sr-only">メニューを開く</span>
            <Icon name={open ? "close" : "menu"} className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="メニュー"
          className="border-t border-white/10 bg-slate-950 px-2 pb-2 pt-1 lg:hidden"
        >
          <ul className="flex flex-col">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      className={`h-4 w-4 ${active ? "text-amber-300" : "text-slate-400"}`}
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
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
      className={`relative flex items-center rounded-lg px-3 text-[13px] font-medium transition-colors ${
        active ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-amber-400"
        />
      )}
    </Link>
  );
}

function AppFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6">
        <span className="flex items-center gap-2">
          <img src="/icon.svg" alt="" aria-hidden="true" className="h-5 w-5 rounded-md" />
          PLC のラダー図を「読む」→「直す」→「書く」の順に身につける練習アプリ。
        </span>
        <span>無料で使えます ・ 登録は Google アカウントだけ</span>
      </div>
    </footer>
  );
}

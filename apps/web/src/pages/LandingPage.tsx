import { useState } from "react";
import { Link } from "react-router";
import { LadderView } from "../components/LadderView.js";
import { buttonClass } from "../components/ui.js";
import { signInWithGoogle } from "../lib/auth-client.js";
import { useNotation } from "../lib/notation-context.jsx";
import { sortedProblems } from "../problems/index.js";

/**
 * ログイン前に出す紹介の画面(S-021)。
 *
 * **ログインを必須にはしない**。SPEC.md §3.5 のとおり、未ログインでも公式問題は
 * 解ける。ここは「何のアプリか」を伝えるだけの場所で、行き止まりにはしない。
 * だから一番大きなボタンは「ログインせずに試す」にしている。
 */

/** 見本のラダー図。自己保持そのもので、このアプリが何を扱うかが一目で分かる */
const SAMPLE = sortedProblems().find((p) => p.id === "selfhold-read-0")?.solution;

export function LandingPage() {
  const notation = useNotation();
  const [busy, setBusy] = useState(false);
  const total = sortedProblems().length;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-5 sm:px-6">
        <img src="/icon.svg" alt="" aria-hidden="true" className="h-9 w-9 rounded-lg" />
        <span className="text-base font-bold tracking-tight">ラダー道場</span>
        <Link to="/problems" className={buttonClass("ghost", "ml-auto")}>
          問題を見る
        </Link>
      </header>

      <main className="flex-1">
        {/* 主役の一言と、2 つの入口 */}
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-20">
          <div className="flex flex-col gap-6">
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              PLC ラダー図の練習アプリ
            </span>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              ラダー図が
              <br />
              <span className="text-blue-600">読める・直せる・書ける</span>
              <br />
              ようになる。
            </h1>
            <p className="max-w-prose text-base leading-relaxed text-slate-600">
              現場の新人・若手向けの練習アプリです。実機がなくても、ブラウザの中で回路を動かして
              確かめられます。答え合わせは回路の形ではなく
              <strong className="font-semibold text-slate-800">動き</strong>
              で見るので、書き方が違っても正解になります。
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/problems" data-testid="lp-try" className={buttonClass("primary", "px-6")}>
                ログインせずに試す
              </Link>
              <button
                type="button"
                data-testid="lp-sign-in"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signInWithGoogle("/problems").finally(() => setBusy(false));
                }}
                className={buttonClass("secondary", "px-6")}
              >
                Google でログイン
              </button>
            </div>
            <p className="text-xs text-slate-500">
              ログインすると、進捗が端末をまたいで保存されます。登録は不要で、料金もかかりません。
            </p>
          </div>

          {/* 見本の回路。文章より 1 枚見せたほうが早い */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60 sm:p-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              こんな図を扱います
            </p>
            {SAMPLE ? (
              <LadderView circuit={SAMPLE} deviceLabels={{ X0: "起動", Y0: "ランプ" }} />
            ) : null}
            <p className="mt-4 text-sm text-slate-600">
              {notation.text("押しボタン X0 を押すと、ランプ Y0 が点く。いちばん簡単な回路です。")}
            </p>
          </div>
        </section>

        {/* できること */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:py-16">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col gap-2">
                <span aria-hidden="true" className="text-2xl">
                  {f.icon}
                </span>
                <h2 className="text-base font-bold text-slate-900">{f.title}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 進み方 */}
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <h2 className="mb-8 text-2xl font-bold tracking-tight">3 段階で身につける</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="text-base font-bold text-slate-900">{s.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 最後にもう一度入口 */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-16">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight">公式問題は {total} 問。</h2>
              <p className="text-sm text-slate-600">
                自己保持・タイマ・カウンタ・インターロック・組み合わせを、順に練習できます。
              </p>
            </div>
            <Link to="/problems" className={buttonClass("primary", "px-6")}>
              いますぐ始める
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          ラダー道場 ・ 無料で使えます
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: "⚡",
    title: "ブラウザの中で動く",
    body: "実機も PLC のソフトも要りません。接点をタップすると、その場で通電が変わります。タイマは実時間で進みます。",
  },
  {
    icon: "🎯",
    title: "動きで正誤を判定",
    body: "回路の形は見ません。「この操作をしたら、この出力になるか」だけを見るので、書き方が違っても正解になります。",
  },
  {
    icon: "🔍",
    title: "間違いの理由が出る",
    body: "不正解のとき、どのテストのどの操作のあとで何が違ったかを表示します。つまずいている箇所も指摘します。",
  },
  {
    icon: "📱",
    title: "スマホで使える",
    body: "通勤中でも休憩中でも。ホーム画面に追加すれば、電波が無くても公式問題とサンドボックスは動きます。",
  },
  {
    icon: "🏭",
    title: "組織で使える",
    body: "招待コードで組織を作り、メンバーの進捗を一覧で見られます。課題を割り当てて期限も付けられます。",
  },
  {
    icon: "✍️",
    title: "問題を作って出せる",
    body: "サンドボックスで作った回路にテストを付けて投稿できます。投稿時に模範解答が自動で検証されます。",
  },
] as const;

const STEPS = [
  {
    title: "読む",
    body: "出来上がった回路を見て、「この操作をしたらどうなるか」を当てます。まず図が読めるようになります。",
  },
  {
    title: "直す",
    body: "動かない回路を渡されます。どこが悪いのかを見つけて、1 か所だけ直します。",
  },
  {
    title: "書く",
    body: "仕様だけを渡されて、白紙から組みます。ここまで来れば、現場の回路が自分で書けます。",
  },
] as const;

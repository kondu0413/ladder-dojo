import { ladder, no, out, wire } from "@ladder-dojo/core";
import { useState } from "react";
import { Link } from "react-router";
import { Brand } from "../components/AppShell.js";
import { LadderView } from "../components/LadderView.js";
import { buttonClass, Icon, type IconName } from "../components/ui.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { signInWithGoogle } from "../lib/auth-client.js";
import { useNotation } from "../lib/notation-context.jsx";
import { sortedProblems } from "../problems/index.js";

/**
 * ログイン前に出す紹介の画面(S-021)。
 *
 * **ログインを必須にはしない**。SPEC.md §3.5 のとおり、未ログインでも公式問題は
 * 解ける。ここは「何のアプリか」を伝えるだけの場所で、行き止まりにはしない。
 * だから一番大きなボタンは「ログインせずに試す」にしている。
 *
 * 見本のラダー図は**その場で押して動かせる**(S-036)。文章で「ブラウザの中で動く」と
 * 言うより、押したら点くのを見せるほうが早い。
 */

/** 見本のラダー図。接点とコイルだけの回路で、このアプリが何を扱うかが一目で分かる */
const SAMPLE =
  sortedProblems().find((p) => p.id === "selfhold-read-0")?.solution ??
  ladder(3).row(no("X0"), wire, out("Y0")).build();

export function LandingPage() {
  const notation = useNotation();
  const [busy, setBusy] = useState(false);
  const total = sortedProblems().length;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      {/* 紺の帯と主役の一言。ヘッダーは AppShell と同じ見た目にして、入ったあとと地続きにする */}
      <div className="dot-grid relative overflow-hidden bg-slate-950 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-amber-400/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl"
        />
        <header className="relative mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Brand />
          <Link
            to="/problems"
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            問題を見る
            <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </header>

        <section className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-16">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
              <Icon name="cpu" className="h-3.5 w-3.5" />
              PLC ラダー図の練習アプリ
            </span>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl xl:text-[3.4rem]">
              ラダー図が
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                読める・直せる・書ける
              </span>
              <br />
              ようになる。
            </h1>
            <p className="max-w-prose text-base leading-relaxed text-slate-300">
              現場の新人・若手向けの練習アプリです。実機がなくても、ブラウザの中で回路を動かして
              確かめられます。答え合わせは回路の形ではなく
              <strong className="font-semibold text-white">動き</strong>
              で見るので、書き方が違っても正解になります。
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/problems"
                data-testid="lp-try"
                className={buttonClass(
                  "accent",
                  "shadow-[0_8px_24px_-8px_rgb(245_158_11/0.6)]",
                  "lg",
                )}
              >
                ログインせずに試す
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
              <button
                type="button"
                data-testid="lp-sign-in"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signInWithGoogle("/problems").finally(() => setBusy(false));
                }}
                className={buttonClass(
                  "secondary",
                  "border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10 active:bg-white/15",
                  "lg",
                )}
              >
                Google でログイン
              </button>
            </div>
            <p className="text-xs text-slate-400">
              ログインすると、進捗が端末をまたいで保存されます。登録は不要で、料金もかかりません。
            </p>
          </div>

          <LiveDemo notationText={notation.text} />
        </section>
      </div>

      <main className="flex-1">
        {/* できること */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <h2 className="text-base font-bold text-slate-900">{f.title}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 進み方 */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <p className="text-xs font-semibold tracking-wide text-amber-700">進み方</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              3 段階で身につける
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="relative flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 font-mono text-sm font-bold text-amber-300">
                      {i + 1}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-card">
                      <Icon name={s.icon} className="h-4 w-4" />
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 最後にもう一度入口 */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="dot-grid flex flex-col items-start gap-5 rounded-3xl bg-slate-950 p-8 text-white sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                公式問題は {total} 問。
              </h2>
              <p className="text-sm text-slate-300">
                自己保持・タイマ・カウンタ・インターロック・組み合わせを、順に練習できます。
              </p>
            </div>
            <Link to="/problems" className={buttonClass("accent", "", "lg")}>
              いますぐ始める
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:px-6">
          <span className="flex items-center gap-2">
            <img src="/icon.svg" alt="" aria-hidden="true" className="h-5 w-5 rounded-md" />
            ラダー道場 ・ 無料で使えます
          </span>
          <span>PLC のラダー図を「読む」→「直す」→「書く」の順に身につける練習アプリ</span>
        </div>
      </footer>
    </div>
  );
}

/** 押して動かせる見本。接点を押している間だけランプが点く */
function LiveDemo({ notationText }: { notationText: (text: string) => string }) {
  const sim = useSimulator(SAMPLE);
  const lit = sim.snapshot.bits.Y0 ?? false;
  return (
    <div className="relative rounded-3xl border border-white/10 bg-white p-4 text-slate-900 shadow-float sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500">押して動かせます</p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            lit ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500"
          }`}
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${lit ? "bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.35)]" : "bg-slate-300"}`}
          />
          {lit ? "ランプ ON" : "ランプ OFF"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <LadderView
          circuit={SAMPLE}
          power={sim.power}
          input={sim.input}
          deviceLabels={{ X0: "起動", Y0: "ランプ" }}
        />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {notationText("押しボタン X0 を押すと、ランプ Y0 が点く。いちばん簡単な回路です。")}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {notationText("図の X0 の接点を押している間だけ、通電が橙色で流れます。")}
      </p>
    </div>
  );
}

const FEATURES: ReadonlyArray<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "bolt",
    title: "ブラウザの中で動く",
    body: "実機も PLC のソフトも要りません。接点をタップすると、その場で通電が変わります。タイマは実時間で進みます。",
  },
  {
    icon: "target",
    title: "動きで正誤を判定",
    body: "回路の形は見ません。「この操作をしたら、この出力になるか」だけを見るので、書き方が違っても正解になります。",
  },
  {
    icon: "search",
    title: "間違いの理由が出る",
    body: "不正解のとき、どのテストのどの操作のあとで何が違ったかを表示します。つまずいている箇所も指摘します。",
  },
  {
    icon: "smartphone",
    title: "スマホで使える",
    body: "通勤中でも休憩中でも。ホーム画面に追加すれば、電波が無くても公式問題とサンドボックスは動きます。",
  },
  {
    icon: "factory",
    title: "組織で使える",
    body: "招待コードで組織を作り、メンバーの進捗を一覧で見られます。課題を割り当てて期限も付けられます。",
  },
  {
    icon: "upload",
    title: "問題を作って出せる",
    body: "サンドボックスで作った回路にテストを付けて投稿できます。投稿時に模範解答が自動で検証されます。",
  },
];

const STEPS: ReadonlyArray<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "eye",
    title: "読む",
    body: "出来上がった回路を見て、「この操作をしたらどうなるか」を当てます。まず図が読めるようになります。",
  },
  {
    icon: "wrench",
    title: "直す",
    body: "動かない回路を渡されます。どこが悪いのかを見つけて直します。現場でいちばん多い作業です。",
  },
  {
    icon: "pencil",
    title: "書く",
    body: "仕様だけを渡されて、白紙から組みます。ここまで来れば、現場の回路が自分で書けます。",
  },
];

import { NOTATION_INFO, NOTATIONS, type Notation } from "@ladder-dojo/core";
import { useNotation } from "../lib/notation-context.jsx";
import { Icon, Segmented } from "./ui.js";

/**
 * 表記の切り替え(S-028)。
 *
 * 選択肢の名前には**メーカー名を使う**(SPEC.md §3.1、2026-09-17 改訂)。
 * 「どういう書き方か」だけでは、自分の現場がどれに当たるのか分からないため。
 * ただし**製品の画面は模倣しない**ので、真似ではない旨を常に添える。
 * 書き方の説明は畳んでおく(毎回読むものではない)。選んだ表記は端末に覚えさせる
 */
export function NotationTabs() {
  const { notation, setNotation } = useNotation();
  const info = NOTATION_INFO[notation];

  return (
    <section className="flex flex-col gap-2" data-testid="notation-tabs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xs font-semibold text-slate-500">表記</h2>
        <Segmented<Notation>
          size="sm"
          mono
          value={notation}
          onChange={setNotation}
          label="デバイス名と記号の書き方"
          options={NOTATIONS.map((id) => ({
            value: id,
            label: NOTATION_INFO[id].label,
            testId: `notation-${id}`,
            // ボタンに出るのは表記の名前だけ。押すと何が起きるのかを読み上げ名に入れる
            ariaLabel: `表記を ${NOTATION_INFO[id].label} にする`,
          }))}
        />
        <details className="text-xs text-slate-500">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md hover:text-slate-800 [&::-webkit-details-marker]:hidden">
            <Icon name="info" className="h-3.5 w-3.5" />
            この表記について
          </summary>
          <p
            className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed"
            data-testid="notation-description"
          >
            {info.description}
          </p>
        </details>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400" data-testid="notation-disclaimer">
        各社の製品画面を真似たものではありません。その系統の現場でよく使われる書き方に表示を合わせているだけで、
        機種ごとの仕様どおりではありません。
      </p>
    </section>
  );
}

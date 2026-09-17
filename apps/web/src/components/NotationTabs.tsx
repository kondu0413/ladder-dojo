import { NOTATION_INFO, NOTATIONS } from "@ladder-dojo/core";
import { useNotation } from "../lib/notation-context.jsx";

/**
 * 表記の切り替え(S-028)。
 *
 * 選択肢の名前には**メーカー名を使う**(SPEC.md §3.1、2026-09-17 改訂)。
 * 「どういう書き方か」だけでは、自分の現場がどれに当たるのか分からないため。
 * ただし**製品の画面は模倣しない**ので、真似ではない旨をここに添える。
 * 選んだ表記は端末に覚えさせる
 */
export function NotationTabs() {
  const { notation, setNotation } = useNotation();
  const info = NOTATION_INFO[notation];

  return (
    <section className="flex flex-col gap-1.5" data-testid="notation-tabs">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-slate-500">表記</h2>
        <fieldset className="flex overflow-hidden rounded-lg border border-slate-300">
          <legend className="sr-only">デバイス名と記号の書き方</legend>
          {NOTATIONS.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`notation-${id}`}
              aria-pressed={notation === id}
              // ボタンに出るのは表記の名前だけ。押すと何が起きるのかを読み上げ名に入れる
              aria-label={`表記を ${NOTATION_INFO[id].label} にする`}
              onClick={() => setNotation(id)}
              className={`min-h-11 px-3 font-mono text-xs font-medium ${
                notation === id ? "bg-slate-700 text-white" : "bg-white text-slate-600"
              }`}
            >
              {NOTATION_INFO[id].label}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="text-[11px] text-slate-500" data-testid="notation-description">
        {info.description}
      </p>
      <p className="text-[11px] text-slate-400" data-testid="notation-disclaimer">
        各社の製品画面を真似たものではありません。その系統の現場でよく使われる書き方に表示を合わせているだけで、
        機種ごとの仕様どおりではありません。
      </p>
    </section>
  );
}

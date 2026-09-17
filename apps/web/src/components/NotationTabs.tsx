import { NOTATION_INFO, NOTATIONS } from "@ladder-dojo/core";
import { useNotation } from "../lib/notation-context.jsx";

/**
 * 表記の切り替え(S-028)。
 *
 * **メーカー名は出さない**(SPEC.md §3.1)。「どこの会社の書き方か」ではなく
 * 「どういう書き方か」で並べる。番地の割り付けはよくある一例で、特定機種の
 * 仕様書ではない。選んだ表記は端末に覚えさせる
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
              // 見た目は「X0 / Y0」だが、入力ボタンの X0 と読み上げ名がぶつかる。
              // 何のボタンなのかを名前に入れる
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
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { LadderView } from "../components/LadderView.js";
import { Button, Card, EmptyState, Icon, inputClass, PageHeader } from "../components/ui.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { GLOSSARY, type GlossaryEntry } from "../lib/glossary.js";

/**
 * 用語集(S-041)。問題文の用語リンクの飛び先。
 * 説明を読むだけでなく、その回路を押して動かせる。
 */
export function GlossaryPage() {
  const { hash } = useLocation();
  const active = hash.slice(1);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const entries = q
    ? GLOSSARY.filter((e) =>
        [e.term, ...(e.aliases ?? []), e.short, e.body].some((s) => s.toLowerCase().includes(q)),
      )
    : GLOSSARY;

  // リンクで飛んできたら、その語まで運ぶ
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(`term-${active}`);
    el?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [active]);

  return (
    <AppShell width="narrow">
      <PageHeader
        title="用語集"
        lead="問題文に出てくる言葉の意味と、その回路の動き。回路の接点は押している間だけ ON になります。"
      />

      <Card padded className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <Icon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="sr-only">用語をさがす</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="用語をさがす(例: 自己保持、タイマ)"
            data-testid="glossary-search"
            className={inputClass("min-w-0 flex-1")}
          />
        </label>
        <p className="text-xs text-slate-500" data-testid="glossary-count">
          {entries.length} 語
        </p>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon="search"
          title="見つかりませんでした"
          body="別の言葉で探してみてください。"
          action={
            <Button tone="secondary" size="sm" onClick={() => setQuery("")}>
              すべて表示
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <GlossaryCard key={entry.id} entry={entry} active={entry.id === active} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function GlossaryCard({ entry, active }: { entry: GlossaryEntry; active: boolean }) {
  return (
    <article
      id={`term-${entry.id}`}
      data-testid="glossary-entry"
      data-term={entry.id}
      data-active={active}
      className={`flex scroll-mt-20 flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card transition-[border-color,box-shadow] sm:p-5 ${
        active ? "border-amber-400 ring-2 ring-amber-400/40" : "border-slate-200/80"
      }`}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{entry.term}</h2>
        <p className="text-sm font-medium text-slate-700">{entry.short}</p>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">{entry.body}</p>
      {entry.circuit && <MiniLadder circuit={entry.circuit} deviceLabels={entry.deviceLabels} />}
      {entry.related && entry.related.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>関連:</span>
          {entry.related.map((id) => {
            const target = GLOSSARY.find((e) => e.id === id);
            if (!target) return null;
            return (
              <Link
                key={id}
                to={`/glossary#${id}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-white"
              >
                {target.term}
              </Link>
            );
          })}
        </p>
      )}
    </article>
  );
}

/** 説明の横で動く小さな回路。接点を押すとその場で通電が変わる */
function MiniLadder({
  circuit,
  deviceLabels,
}: {
  circuit: GlossaryEntry["circuit"] & object;
  deviceLabels: Record<string, string> | undefined;
}) {
  const sim = useSimulator(circuit);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2">
        <LadderView
          circuit={circuit}
          power={sim.power}
          input={sim.input}
          deviceLabels={deviceLabels}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          接点を押している間だけ ON。コイルは通電中に橙になります。
        </p>
        <Button tone="ghost" size="sm" icon="reset" onClick={sim.reset}>
          リセット
        </Button>
      </div>
    </div>
  );
}

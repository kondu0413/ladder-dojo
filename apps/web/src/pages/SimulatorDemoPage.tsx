import { useState } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { LadderView } from "../components/LadderView.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { SAMPLES, type Sample } from "../lib/samples.js";

/**
 * シミュレータの動作確認ページ(仮)。
 * 学習モードの画面ができたらこのページはサンドボックスに置き換える。
 */
export function SimulatorDemoPage() {
  const [sample, setSample] = useState<Sample>(SAMPLES[0] as Sample);
  const sim = useSimulator(sample.circuit);

  return (
    <AppShell width="narrow">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">ラダー図トレーニング</h1>
          <Link to="/problems" className="text-sm text-slate-500 underline">
            問題一覧
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          シミュレータの動作確認(開発中)。接点か下のボタンをタップして操作します。
        </p>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="サンプル回路">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSample(s)}
            aria-pressed={s.id === sample.id}
            data-testid={`sample-${s.id}`}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
              s.id === sample.id
                ? "border-slate-700 bg-slate-700 text-white"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            {s.title}
          </button>
        ))}
      </nav>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        {sample.description}
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView
          circuit={sample.circuit}
          power={sim.power}
          deviceLabels={sample.deviceLabels}
          onTapInput={sim.toggleInput}
        />
      </div>

      <SimulatorControls
        speed={sim.speed}
        running={sim.running}
        onSpeed={sim.setSpeed}
        onRunning={sim.setRunning}
        onReset={sim.reset}
      />

      <DevicePanel
        devices={sim.devices}
        snapshot={sim.snapshot}
        deviceLabels={sample.deviceLabels}
        onToggleInput={sim.toggleInput}
      />

      <p className="mt-auto pt-4 text-[11px] text-slate-400" data-testid="schema-version">
        schema v1
      </p>
    </AppShell>
  );
}

import { useState } from "react";
import { AppShell } from "../components/AppShell.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { LadderView } from "../components/LadderView.js";
import { NotationTabs } from "../components/NotationTabs.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { Card, Chip, Icon, PageHeader } from "../components/ui.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { useNotation } from "../lib/notation-context.jsx";
import { SAMPLES, type Sample } from "../lib/samples.js";

/**
 * サンプル回路。代表的な回路を、問題の形にせずに動かして見られる。
 * 「まず動きを見たい」人と、教える側が説明に使う場所。
 */
export function SimulatorDemoPage() {
  const [sample, setSample] = useState<Sample>(SAMPLES[0] as Sample);
  const notation = useNotation();
  const sim = useSimulator(sample.circuit);

  return (
    <AppShell width="narrow">
      <PageHeader
        title="サンプル回路"
        lead="代表的な回路を動かして見られます。接点か下のボタンを押している間だけ、入力が ON になります。"
      />

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="サンプル回路">
        {SAMPLES.map((s) => (
          <Chip
            key={s.id}
            className="shrink-0"
            active={s.id === sample.id}
            data-testid={`sample-${s.id}`}
            onClick={() => setSample(s)}
          >
            {s.title}
          </Chip>
        ))}
      </nav>

      <Card padded>
        <NotationTabs />
      </Card>

      <Card padded className="flex flex-col gap-4">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {/* 説明文のデバイス名も表記に合わせる(S-052)。図だけ 0.00 で文が X0 だと別物に見える */}
          <span data-testid="sample-description">{notation.text(sample.description)}</span>
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
          <LadderView
            circuit={sample.circuit}
            power={sim.power}
            states={sim.states}
            deviceLabels={sample.deviceLabels}
            input={sim.input}
          />
        </div>
        <SimulatorControls
          speed={sim.speed}
          running={sim.running}
          onSpeed={sim.setSpeed}
          onRunning={sim.setRunning}
          onReset={sim.reset}
          onStep={sim.step}
          scans={sim.scans}
        />
        <DevicePanel
          devices={sim.devices}
          snapshot={sim.snapshot}
          circuit={sample.circuit}
          deviceLabels={sample.deviceLabels}
          input={sim.input}
        />
      </Card>
    </AppShell>
  );
}

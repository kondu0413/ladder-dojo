import { type Circuit, emptyCircuit } from "@ladder-dojo/core";
import { useState } from "react";
import { Link } from "react-router";
import { DevicePanel } from "../components/DevicePanel.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { useSimulator } from "../hooks/useSimulator.js";

type Mode = "edit" | "run";

/**
 * サンドボックス(SPEC.md §3.4)。自由に回路を作って動かせる場。
 * 保存とテストケースの編集は次の段階で足す。
 */
export function SandboxPage() {
  const [circuit, setCircuit] = useState<Circuit>(() => emptyCircuit(6, 3));
  const [mode, setMode] = useState<Mode>("edit");

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">サンドボックス</h1>
        <Link to="/samples" className="text-sm text-slate-500 underline">
          サンプルを見る
        </Link>
      </header>

      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {(
          [
            { value: "edit", label: "編集" },
            { value: "run", label: "動かす" },
          ] as const
        ).map((m) => (
          <button
            key={m.value}
            type="button"
            data-testid={`mode-${m.value}`}
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            className={`min-h-11 flex-1 text-sm font-medium ${
              mode === m.value ? "bg-slate-700 text-white" : "bg-white text-slate-600"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "edit" ? (
        <LadderEditor circuit={circuit} onChange={setCircuit} />
      ) : (
        <RunPanel circuit={circuit} />
      )}
    </main>
  );
}

function RunPanel({ circuit }: { circuit: Circuit }) {
  const sim = useSimulator(circuit);
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView circuit={circuit} power={sim.power} onTapInput={sim.toggleInput} />
      </div>
      <SimulatorControls
        speed={sim.speed}
        running={sim.running}
        onSpeed={sim.setSpeed}
        onRunning={sim.setRunning}
        onReset={sim.reset}
      />
      {sim.devices.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          まだ部品が置かれていません。「編集」に切り替えて回路を作ってください。
        </p>
      ) : (
        <DevicePanel
          devices={sim.devices}
          snapshot={sim.snapshot}
          onToggleInput={sim.toggleInput}
        />
      )}
    </div>
  );
}

import {
  type Circuit,
  circuitSchema,
  emptyCircuit,
  type JudgeResult,
  judge,
  type Problem,
  SCHEMA_VERSION,
  sandboxTestCasesSchema,
  type TestCase,
} from "@ladder-dojo/core";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { AuthBar } from "../components/AuthBar.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { JudgeResultView } from "../components/JudgeResultView.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { PublishDialog } from "../components/PublishDialog.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { TestCaseEditor } from "../components/TestCaseEditor.js";
import { PageHeader } from "../components/ui.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { ApiError, api, type SandboxSummary } from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";

type Tab = "edit" | "run" | "test";

/** サンドボックス(SPEC.md §3.4)。自由に回路を作り、テストを付けて保存できる */
export function SandboxPage() {
  const { user } = useProgress();
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const [circuit, setCircuit] = useState<Circuit>(() => emptyCircuit(6, 3));
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [title, setTitle] = useState("無題の回路");
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("edit");
  const [result, setResult] = useState<JudgeResult | undefined>(undefined);
  const [list, setList] = useState<SandboxSummary[]>([]);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    if (!user) {
      setList([]);
      return;
    }
    try {
      const res = await api.listSandbox();
      setList(res.circuits);
    } catch {
      setMessage("保存済みの回路を読み込めませんでした。");
    }
  }, [user]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const input = { title: title.trim() || "無題の回路", circuit, testCases };
      const res = savedId
        ? await api.updateSandbox(savedId, input)
        : await api.createSandbox(input);
      setSavedId(res.circuit.id);
      setMessage("保存しました。");
      await refreshList();
    } catch (err) {
      setMessage(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const load = async (id: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await api.getSandbox(id);
      setCircuit(circuitSchema.parse(res.circuit.circuit));
      setTestCases(sandboxTestCasesSchema.catch([]).parse(res.circuit.testCases));
      setTitle(res.circuit.title);
      setSavedId(res.circuit.id);
      setResult(undefined);
      setTab("edit");
    } catch {
      setMessage("読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteSandbox(id);
      if (savedId === id) setSavedId(undefined);
      await refreshList();
      setMessage("削除しました。");
    } catch {
      setMessage("削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const runTests = () => {
    if (testCases.length === 0) {
      setMessage("先にテストを追加してください。");
      return;
    }
    setMessage(undefined);
    setResult(judge(circuit, testCases));
  };

  const reset = () => {
    setCircuit(emptyCircuit(6, 3));
    setTestCases([]);
    setTitle("無題の回路");
    setSavedId(undefined);
    setResult(undefined);
  };

  return (
    <AppShell width="narrow">
      <PageHeader
        title="サンドボックス"
        lead="自由に回路を組んで、その場で動かせます。テストを付ければ問題として投稿できます。"
      />
      <div className="mb-5">
        <AuthBar />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          data-testid="sandbox-title"
          aria-label="回路の名前"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
        />
        {user ? (
          <button
            type="button"
            data-testid="sandbox-save"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-11 rounded-lg bg-slate-700 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {savedId ? "上書き保存" : "保存"}
          </button>
        ) : (
          <span className="text-xs text-slate-500">保存するにはログインしてください</span>
        )}
        {user && (
          <button
            type="button"
            data-testid="sandbox-publish"
            onClick={() => setPublishing((v) => !v)}
            className="min-h-11 rounded-lg border border-sky-300 bg-white px-3 text-sm font-medium text-sky-700"
          >
            投稿
          </button>
        )}
        <button
          type="button"
          data-testid="sandbox-new"
          onClick={reset}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
        >
          新規
        </button>
      </div>

      {message && (
        <p
          data-testid="sandbox-message"
          role="status"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
        >
          {message}
        </p>
      )}

      {publishing && user && (
        <PublishDialog
          circuit={circuit}
          testCases={testCases}
          defaultTitle={title}
          onPublished={(id) => {
            setPublishing(false);
            void navigate(`/community/${id}`);
          }}
          onCancel={() => setPublishing(false)}
        />
      )}

      {user && list.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-semibold text-slate-500">保存した回路</h2>
          <ul className="flex flex-col gap-2">
            {list.map((item) => (
              <li
                key={item.id}
                data-testid={`saved-${item.id}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{item.title}</span>
                <button
                  type="button"
                  data-testid={`load-${item.id}`}
                  disabled={busy}
                  onClick={() => void load(item.id)}
                  className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-700"
                >
                  開く
                </button>
                <button
                  type="button"
                  data-testid={`delete-${item.id}`}
                  disabled={busy}
                  onClick={() => void remove(item.id)}
                  className="min-h-11 shrink-0 rounded-lg border border-red-300 px-3 text-xs text-red-600"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {(
          [
            { value: "edit", label: "編集" },
            { value: "run", label: "動かす" },
            { value: "test", label: `テスト (${testCases.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            data-testid={`mode-${t.value}`}
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`min-h-11 flex-1 text-sm font-medium ${
              tab === t.value ? "bg-slate-700 text-white" : "bg-white text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "edit" && <LadderEditor circuit={circuit} onChange={setCircuit} />}
      {tab === "run" && <RunPanel circuit={circuit} />}
      {tab === "test" && (
        <div className="flex flex-col gap-3">
          <TestCaseEditor circuit={circuit} testCases={testCases} onChange={setTestCases} />
          <button
            type="button"
            data-testid="run-tests"
            onClick={runTests}
            className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white"
          >
            テストを実行
          </button>
          {result && <JudgeResultView result={result} problem={asProblem(circuit, testCases)} />}
        </div>
      )}
    </AppShell>
  );
}

/** JudgeResultView は Problem を受け取るので、サンドボックス用に最小限のものを作る */
function asProblem(circuit: Circuit, testCases: TestCase[]): Problem {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "sandbox",
    title: "サンドボックス",
    mode: "write",
    stage: "combo",
    difficulty: 1,
    tags: [],
    spec: "自作の回路",
    solution: circuit,
    testCases: testCases.length > 0 ? testCases : [],
  } as Problem;
}

function explain(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "quota_exceeded")
      return "保存できる回路は 50 件までです。古いものを消してください。";
    if (err.code === "too_large") return "回路が大きすぎて保存できません。";
    if (err.code === "unauthorized")
      return "ログインが切れています。もう一度ログインしてください。";
    if (err.code === "invalid_body") return "回路かテストの内容に問題があります。";
  }
  return "保存できませんでした。";
}

function RunPanel({ circuit }: { circuit: Circuit }) {
  const sim = useSimulator(circuit);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView circuit={circuit} power={sim.power} input={sim.input} />
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
          circuit={circuit}
          input={sim.input}
        />
      )}
    </div>
  );
}

import {
  type Circuit,
  circuitSchema,
  emptyCircuit,
  findCoilConflicts,
  type JudgeResult,
  judge,
  type Problem,
  SCHEMA_VERSION,
  sandboxTestCasesSchema,
  type TestCase,
} from "@ladder-dojo/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { CoilConflictNote } from "../components/CoilConflictNote.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { JudgeResultView } from "../components/JudgeResultView.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { NotationTabs } from "../components/NotationTabs.js";
import { PublishDialog } from "../components/PublishDialog.js";
import { RecorderBar } from "../components/RecorderBar.js";
import { ShareButton } from "../components/ShareButton.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { TestCaseEditor } from "../components/TestCaseEditor.js";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  inputClass,
  Notice,
  PageHeader,
  SectionTitle,
  Segmented,
} from "../components/ui.js";
import { useHistory } from "../hooks/useHistory.js";
import { useRecorder } from "../hooks/useRecorder.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { ApiError, api, type SandboxSummary } from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";
import { readSharedCircuit } from "../lib/share.js";

type Tab = "edit" | "run" | "test";

/** サンドボックス(SPEC.md §3.4)。自由に回路を作り、テストを付けて保存できる */
export function SandboxPage() {
  const { user } = useProgress();
  const navigate = useNavigate();
  const location = useLocation();
  const [publishing, setPublishing] = useState(false);
  // 編集は「元に戻す / やり直す」つき(S-038)
  const history = useHistory<Circuit>(emptyCircuit(6, 3));
  const circuit = history.value;
  const setCircuit = history.set;
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [title, setTitle] = useState("無題の回路");
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("edit");
  const [result, setResult] = useState<JudgeResult | undefined>(undefined);
  const [list, setList] = useState<SandboxSummary[]>([]);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** 「削除」を押した回路。もう一度押して初めて消す(取り消しが効かない操作なので) */
  const [confirming, setConfirming] = useState<string | undefined>(undefined);

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

  // 共有リンク(`#c=...`、S-039)で開かれたら、その回路を出す。
  // 同じ画面で別のリンクを開き直したときにも追いかける
  const appliedHash = useRef("");
  const resetHistory = history.reset;
  useEffect(() => {
    if (location.hash === appliedHash.current) return;
    appliedHash.current = location.hash;
    const shared = readSharedCircuit(location.hash);
    if (!shared) return;
    resetHistory(shared.circuit);
    setTitle(shared.title ?? "無題の回路");
    setTestCases([]);
    setSavedId(undefined);
    setResult(undefined);
    setTab("edit");
    setMessage("共有された回路を開きました。");
  }, [location.hash, resetHistory]);

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
      history.reset(circuitSchema.parse(res.circuit.circuit));
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
    setConfirming(undefined);
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
    history.reset(emptyCircuit(6, 3));
    setTestCases([]);
    setTitle("無題の回路");
    setSavedId(undefined);
    setResult(undefined);
    // 共有リンクから開いていたなら、リンクを外す(再読み込みで戻ってこないように)
    if (location.hash) void navigate("/sandbox", { replace: true });
  };

  return (
    <AppShell width="narrow">
      <PageHeader
        title="サンドボックス"
        lead="自由に回路を組んで、その場で動かせます。テストを付ければ問題として投稿できます。"
        actions={
          <Button tone="secondary" icon="plus" data-testid="sandbox-new" onClick={reset}>
            新規
          </Button>
        }
      />

      <Card padded className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="sr-only">回路の名前</span>
            <Icon name="pencil" className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              data-testid="sandbox-title"
              aria-label="回路の名前"
              className={inputClass("min-w-0 flex-1 font-medium")}
            />
          </label>
          {user ? (
            <Button
              icon="save"
              data-testid="sandbox-save"
              disabled={busy}
              onClick={() => void save()}
            >
              {savedId ? "上書き保存" : "保存"}
            </Button>
          ) : (
            <span className="text-xs text-slate-500">保存するにはログインしてください</span>
          )}
          {user && (
            <Button
              tone={publishing ? "primary" : "secondary"}
              icon="upload"
              data-testid="sandbox-publish"
              onClick={() => setPublishing((v) => !v)}
            >
              投稿
            </Button>
          )}
        </div>
        <div className="border-t border-slate-100 pt-3">
          <NotationTabs />
        </div>
      </Card>

      {message && (
        <Notice
          tone={
            message.includes("できません") || message.includes("ください") ? "warning" : "success"
          }
          role="status"
          data-testid="sandbox-message"
        >
          {message}
        </Notice>
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
        <section className="flex flex-col gap-2">
          <SectionTitle as="h2" icon="save" count={`${list.length} 件`}>
            保存した回路
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {list.map((item) => (
              <li
                key={item.id}
                data-testid={`saved-${item.id}`}
                className={`flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-card ${
                  savedId === item.id ? "border-slate-900/30" : "border-slate-200/80"
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-slate-800">{item.title}</span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(item.updatedAt).toLocaleString("ja-JP")} 更新
                    {savedId === item.id ? " ・ 開いています" : ""}
                  </span>
                </span>
                {confirming === item.id ? (
                  <>
                    <span className="text-xs font-medium text-rose-700">本当に消しますか?</span>
                    <Button
                      tone="danger"
                      size="sm"
                      data-testid={`confirm-delete-${item.id}`}
                      disabled={busy}
                      onClick={() => void remove(item.id)}
                    >
                      削除する
                    </Button>
                    <Button tone="ghost" size="sm" onClick={() => setConfirming(undefined)}>
                      やめる
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      tone="secondary"
                      size="sm"
                      data-testid={`load-${item.id}`}
                      disabled={busy}
                      onClick={() => void load(item.id)}
                    >
                      開く
                    </Button>
                    <Button
                      tone="danger"
                      size="sm"
                      icon="trash"
                      data-testid={`delete-${item.id}`}
                      disabled={busy}
                      onClick={() => setConfirming(item.id)}
                    >
                      削除
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Segmented<Tab>
        fill
        label="回路の見方"
        value={tab}
        onChange={setTab}
        options={[
          { value: "edit", label: "編集", testId: "mode-edit" },
          { value: "run", label: "動かす", testId: "mode-run" },
          { value: "test", label: `テスト (${testCases.length})`, testId: "mode-test" },
        ]}
      />

      {tab === "edit" && (
        <LadderEditor
          circuit={circuit}
          onChange={setCircuit}
          history={history}
          extra={<ShareButton circuit={circuit} title={title} />}
        />
      )}
      {tab === "run" && (
        <RunPanel
          circuit={circuit}
          nextTitle={`記録 ${testCases.length + 1}`}
          onRecorded={(tc) => {
            setTestCases((prev) => [...prev, tc]);
            setResult(undefined);
            setMessage(
              `操作をテスト「${tc.title}」として追加しました。「テスト」タブで確かめられます。`,
            );
          }}
        />
      )}
      {tab === "test" && (
        <div className="flex flex-col gap-3">
          <TestCaseEditor circuit={circuit} testCases={testCases} onChange={setTestCases} />
          <Button tone="accent" size="lg" icon="bolt" data-testid="run-tests" onClick={runTests}>
            テストを実行
          </Button>
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

function RunPanel({
  circuit,
  nextTitle,
  onRecorded,
}: {
  circuit: Circuit;
  /** 記録したテストに付ける名前 */
  nextTitle: string;
  onRecorded: (testCase: TestCase) => void;
}) {
  const sim = useSimulator(circuit);
  // 操作を記録してテストにする(S-042)。記録中は入力を横取りする
  const recorder = useRecorder(sim);
  // 二重コイルや SET / RST の衝突の印と理由(S-049)
  const conflicts = useMemo(() => findCoilConflicts(circuit, sim.power), [circuit, sim.power]);
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-x-auto p-2">
        <LadderView
          circuit={circuit}
          power={sim.power}
          states={sim.states}
          input={recorder.input}
          conflicts={conflicts}
        />
      </Card>
      <CoilConflictNote conflicts={conflicts} />
      <SimulatorControls
        speed={sim.speed}
        running={sim.running}
        onSpeed={sim.setSpeed}
        onRunning={sim.setRunning}
        onReset={sim.reset}
        onStep={sim.step}
        scans={sim.scans}
      />
      {sim.devices.length > 0 && (
        <RecorderBar
          recorder={recorder}
          disabled={sim.speed === "instant"}
          onStop={() => onRecorded(recorder.stop(nextTitle))}
        />
      )}
      {sim.devices.length === 0 ? (
        <EmptyState
          icon="flask"
          title="まだ部品が置かれていません"
          body="「編集」に切り替えて回路を作ってください。"
        />
      ) : (
        <DevicePanel
          devices={sim.devices}
          snapshot={sim.snapshot}
          circuit={circuit}
          input={recorder.input}
        />
      )}
    </div>
  );
}

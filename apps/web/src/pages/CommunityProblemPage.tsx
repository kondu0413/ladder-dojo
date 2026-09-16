import {
  type Circuit,
  circuitSchema,
  emptyCircuit,
  type JudgeResult,
  judge,
  type Problem,
  SCHEMA_VERSION,
  type TestCase,
  testCasesSchema,
} from "@ladder-dojo/core";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { CommonMistakes } from "../components/CommonMistakes.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { DiagnosisPanel } from "../components/DiagnosisPanel.js";
import { JudgeResultView } from "../components/JudgeResultView.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { useDiagnosis } from "../hooks/useDiagnosis.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { api, type PostedProblemDetail } from "../lib/api.js";
import { circuitMetricsRows } from "../lib/metrics-view.js";
import { useProgress } from "../lib/progress-context.jsx";

/** 投稿問題を解く画面(SPEC.md §3.6) */
export function CommunityProblemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, recordSubmission } = useProgress();
  const [problem, setProblem] = useState<PostedProblemDetail | undefined>(undefined);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [circuit, setCircuit] = useState<Circuit>(() => emptyCircuit(6, 4));
  const [tab, setTab] = useState<"edit" | "run">("edit");
  /** 答え合わせしたときの回路と結果を 1 組で持つ(あとから編集されてもずれないように) */
  const [checked, setChecked] = useState<{ circuit: Circuit; result: JudgeResult } | undefined>(
    undefined,
  );
  const [sent, setSent] = useState<JudgeResult | undefined>(undefined);
  // この画面で「答え合わせ」に失敗した回数。つまずき診断を出すかどうかに使う(S-009)
  const [failures, setFailures] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getPosted(id);
      setProblem(res.problem);
      setTestCases(testCasesSchema.catch([]).parse(res.problem.testCases));
      setError(undefined);
    } catch {
      setError("この問題は見つかりませんでした(削除されたか、非公開かもしれません)。");
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const diagnosis = useDiagnosis(checked?.circuit, testCases, checked?.result);

  /** 提出は診断がついてから送る。つまずきの種類を一緒に送って人数を数える(SPEC.md §3.5) */
  useEffect(() => {
    if (!checked || !problem || diagnosis.state !== "done") return;
    if (sent === checked.result) return;
    setSent(checked.result);
    recordSubmission(
      problem.id,
      checked.circuit,
      checked.result.passed,
      diagnosis.diagnoses[0]?.id,
    );
  }, [checked, problem, diagnosis, sent, recordSubmission]);

  if (error) {
    return (
      <AppShell width="narrow">
        <p
          data-testid="problem-error"
          className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700"
        >
          {error}
        </p>
        <Link to="/community" className="text-sm text-slate-500 underline">
          みんなの問題に戻る
        </Link>
      </AppShell>
    );
  }

  if (!problem) {
    return (
      <AppShell width="narrow">
        <p className="text-sm text-slate-500">読み込み中…</p>
      </AppShell>
    );
  }

  const check = () => {
    if (testCases.length === 0) {
      setNotice("この問題にはテストケースがありません。");
      return;
    }
    const judged = judge(circuit, testCases);
    setChecked({ circuit, result: judged });
    if (!judged.passed) setFailures((n) => n + 1);
    if (user) {
      api
        .recordPostedAttempt(problem.id, judged.passed)
        .then(() => reload())
        .catch(() => setNotice("挑戦の記録をサーバーに送れませんでした。"));
    } else if (judged.passed) {
      setNotice("ログインすると、クリアが記録されて模範解答も見られます。");
    }
  };

  const toggleLike = async () => {
    if (!user) {
      setNotice("いいねするにはログインしてください。");
      return;
    }
    try {
      await api.likePosted(problem.id, !problem.liked);
      await reload();
    } catch {
      setNotice("いいねを送れませんでした。");
    }
  };

  const vote = async (difficulty: number) => {
    if (!user) {
      setNotice("難易度を投票するにはログインしてください。");
      return;
    }
    try {
      await api.votePostedDifficulty(problem.id, difficulty);
      await reload();
    } catch {
      setNotice("投票を送れませんでした。");
    }
  };

  const report = async () => {
    if (!user) {
      setNotice("通報するにはログインしてください。");
      return;
    }
    const reason = window.prompt("通報の理由を教えてください(不適切な内容、解けないなど)");
    if (!reason) return;
    try {
      const res = await api.reportPosted(problem.id, reason.slice(0, 200));
      setNotice(
        res.hidden ? "通報を受け付け、この問題は非表示になりました。" : "通報を受け付けました。",
      );
      if (res.hidden) await navigate("/community");
    } catch {
      setNotice("通報を送れませんでした。");
    }
  };

  const removeProblem = async () => {
    if (!window.confirm("この投稿を削除しますか?")) return;
    try {
      await api.deletePosted(problem.id);
      await navigate("/community");
    } catch {
      setNotice("削除できませんでした。");
    }
  };

  const solution = problem.solution ? circuitSchema.safeParse(problem.solution) : undefined;

  return (
    <AppShell width="narrow">
      <header className="flex flex-col gap-1">
        <Link to="/community" className="text-sm text-slate-500 underline">
          ← みんなの問題
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{problem.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>難易度 {problem.votedDifficulty ?? problem.difficulty}</span>
          <span>♥ {problem.likes}</span>
          <span data-testid="clear-rate">
            クリア率 {problem.clearRate === null ? "—" : `${problem.clearRate}%`}({problem.clears}/
            {problem.attempts} 人)
          </span>
          {problem.isAuthor && <span className="rounded bg-slate-200 px-1">自分の投稿</span>}
        </p>
      </header>

      <p className="whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-700">
        {problem.spec}
      </p>

      {notice && (
        <p
          data-testid="notice"
          role="status"
          className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900"
        >
          {notice}
        </p>
      )}

      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {(
          [
            { value: "edit", label: "編集" },
            { value: "run", label: "動かす" },
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

      {tab === "edit" ? (
        <LadderEditor circuit={circuit} onChange={setCircuit} />
      ) : (
        <RunPanel circuit={circuit} />
      )}

      <button
        type="button"
        data-testid="check-answer"
        onClick={check}
        className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white"
      >
        答え合わせ
      </button>

      <CommonMistakes problemId={problem.id} />

      {checked && (
        <JudgeResultView
          result={checked.result}
          problem={asProblem(problem, checked.circuit, testCases)}
          circuit={checked.circuit}
        />
      )}
      {checked && (
        <DiagnosisPanel circuit={checked.circuit} diagnosis={diagnosis} failures={failures} />
      )}

      {solution?.success && (
        <section className="flex flex-col gap-2" data-testid="posted-solution">
          <h2 className="text-sm font-semibold text-slate-700">投稿者の模範解答</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
            <LadderView circuit={solution.data} />
          </div>
          <MetricsTable yours={circuit} model={solution.data} />
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="like-button"
            aria-pressed={problem.liked}
            onClick={() => void toggleLike()}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
              problem.liked
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {problem.liked ? "♥ いいね済み" : "♡ いいね"}
          </button>
          <button
            type="button"
            data-testid="report-button"
            onClick={() => void report()}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-600"
          >
            通報
          </button>
          {problem.isAuthor && (
            <button
              type="button"
              data-testid="delete-posted"
              onClick={() => void removeProblem()}
              className="min-h-11 rounded-lg border border-red-300 bg-white px-4 text-sm text-red-600"
            >
              投稿を削除
            </button>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">
            難易度を投票({problem.difficultyVotes} 票
            {problem.votedDifficulty !== null ? ` / 平均 ${problem.votedDifficulty}` : ""})
          </p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                type="button"
                data-testid={`vote-${d}`}
                aria-pressed={problem.myDifficulty === d}
                onClick={() => void vote(d)}
                className={`min-h-11 w-11 rounded-lg border text-sm font-medium ${
                  problem.myDifficulty === d
                    ? "border-slate-700 bg-slate-700 text-white"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function MetricsTable({ yours, model }: { yours: Circuit; model: Circuit }) {
  const rows = circuitMetricsRows(yours, model);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500">
          <th className="py-1">指標</th>
          <th className="py-1">あなた</th>
          <th className="py-1">投稿者</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-slate-100">
            <td className="py-1 text-slate-600">{r.label}</td>
            <td className="py-1 font-mono">{r.mine}</td>
            <td className="py-1 font-mono">{r.model}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function asProblem(detail: PostedProblemDetail, circuit: Circuit, testCases: TestCase[]): Problem {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: detail.id,
    title: detail.title,
    mode: "write",
    stage: "combo",
    difficulty: detail.difficulty,
    tags: detail.tags,
    spec: detail.spec,
    solution: circuit,
    testCases: testCases.length > 0 ? testCases : [],
  } as Problem;
}

function RunPanel({ circuit }: { circuit: Circuit }) {
  const sim = useSimulator(circuit);
  return (
    <div className="flex flex-col gap-3">
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
          まだ部品が置かれていません。
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

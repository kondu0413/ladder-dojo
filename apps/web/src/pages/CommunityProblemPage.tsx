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
import { NotationTabs } from "../components/NotationTabs.js";
import { ShareButton } from "../components/ShareButton.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Difficulty,
  EmptyState,
  Field,
  Icon,
  inputClass,
  Label,
  Notice,
  PageHeader,
  SectionTitle,
  Segmented,
  Skeleton,
} from "../components/ui.js";
import { useDiagnosis } from "../hooks/useDiagnosis.js";
import { useHistory } from "../hooks/useHistory.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { api, type PostedProblemDetail } from "../lib/api.js";
import { circuitMetricsRows } from "../lib/metrics-view.js";
import { useNotation } from "../lib/notation-context.jsx";
import { useProgress } from "../lib/progress-context.jsx";

type Vote = "1" | "2" | "3" | "4" | "5";

/** 投稿問題を解く画面(SPEC.md §3.6) */
export function CommunityProblemPage() {
  const { id } = useParams();
  const notation = useNotation();
  const navigate = useNavigate();
  const { user, recordSubmission } = useProgress();
  const [problem, setProblem] = useState<PostedProblemDetail | undefined>(undefined);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  // 編集は「元に戻す / やり直す」つき(S-038)
  const history = useHistory<Circuit>(emptyCircuit(6, 4));
  const circuit = history.value;
  const setCircuit = history.set;
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
  /** 通報の理由を書く欄を開いているか。ブラウザの prompt() は使わない(見た目が揃わないうえ、閉じられると消える) */
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  /** 「投稿を削除」を押した状態。もう一度押して初めて消す */
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        <Notice tone="danger" data-testid="problem-error">
          {error}
        </Notice>
        <Link to="/community" className={buttonClass("secondary", "self-start")}>
          <Icon name="arrowLeft" className="h-4 w-4" />
          みんなの問題に戻る
        </Link>
      </AppShell>
    );
  }

  if (!problem) {
    return (
      <AppShell width="narrow">
        <p className="sr-only" role="status">
          読み込み中
        </p>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
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

  const openReport = () => {
    if (!user) {
      setNotice("通報するにはログインしてください。");
      return;
    }
    setReporting((v) => !v);
  };

  const report = async () => {
    const text = reason.trim();
    if (!text) return;
    try {
      const res = await api.reportPosted(problem.id, text.slice(0, 200));
      setReporting(false);
      setReason("");
      setNotice(
        res.hidden ? "通報を受け付け、この問題は非表示になりました。" : "通報を受け付けました。",
      );
      if (res.hidden) await navigate("/community");
    } catch {
      setNotice("通報を送れませんでした。");
    }
  };

  const removeProblem = async () => {
    try {
      await api.deletePosted(problem.id);
      await navigate("/community");
    } catch {
      setConfirmDelete(false);
      setNotice("削除できませんでした。");
    }
  };

  const solution = problem.solution ? circuitSchema.safeParse(problem.solution) : undefined;

  return (
    <AppShell width="narrow">
      <PageHeader title={problem.title} back={{ to: "/community", label: "みんなの問題" }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
          <Difficulty level={problem.votedDifficulty ?? problem.difficulty} />
          <span className="inline-flex items-center gap-1">
            <Icon name="heart" className="h-3.5 w-3.5 text-rose-400" />
            {problem.likes}
          </span>
          <span data-testid="clear-rate" className="inline-flex items-center gap-1">
            <Icon name="target" className="h-3.5 w-3.5 text-slate-400" />
            クリア率 {problem.clearRate === null ? "—" : `${problem.clearRate}%`}({problem.clears}/
            {problem.attempts} 人)
          </span>
          {problem.isAuthor && <Badge tone="navy">自分の投稿</Badge>}
          {problem.visibility === "org" && <Badge icon="factory">組織限定</Badge>}
          {problem.visibility === "private" && <Badge icon="lock">非公開</Badge>}
        </div>
      </PageHeader>

      <Card padded className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
          {notation.text(problem.spec)}
        </p>
        {problem.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {problem.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}
        <div className="border-t border-slate-100 pt-3">
          <NotationTabs />
        </div>
      </Card>

      {notice && (
        <Notice tone="info" role="status" data-testid="notice">
          {notice}
        </Notice>
      )}

      <Segmented<"edit" | "run">
        fill
        label="回路の見方"
        value={tab}
        onChange={setTab}
        options={[
          { value: "edit", label: "編集", testId: "mode-edit" },
          { value: "run", label: "動かす", testId: "mode-run" },
        ]}
      />

      {tab === "edit" ? (
        <LadderEditor
          circuit={circuit}
          onChange={setCircuit}
          history={history}
          extra={<ShareButton circuit={circuit} title={problem.title} />}
        />
      ) : (
        <RunPanel circuit={circuit} />
      )}

      <div className="sticky bottom-3 z-10 flex gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-float backdrop-blur">
        <Button
          tone="accent"
          size="lg"
          icon="bolt"
          className="flex-1"
          data-testid="check-answer"
          onClick={check}
        >
          答え合わせ
        </Button>
      </div>

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
        <section className="flex flex-col gap-3" data-testid="posted-solution">
          <SectionTitle icon="layers">投稿者の模範解答</SectionTitle>
          <Card className="overflow-x-auto border-amber-200 p-2">
            <LadderView circuit={solution.data} />
          </Card>
          <Card padded>
            <MetricsTable yours={circuit} model={solution.data} />
          </Card>
        </section>
      )}

      <Card padded className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            tone="secondary"
            data-testid="like-button"
            aria-pressed={problem.liked}
            className={
              problem.liked ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : ""
            }
            onClick={() => void toggleLike()}
          >
            <Icon
              name="heart"
              className={`h-4 w-4 ${problem.liked ? "fill-rose-500 text-rose-500" : ""}`}
            />
            {problem.liked ? "いいね済み" : "いいね"}
          </Button>
          <Button
            tone="ghost"
            icon="flag"
            data-testid="report-button"
            aria-expanded={reporting}
            onClick={openReport}
          >
            通報
          </Button>
          {problem.isAuthor &&
            (confirmDelete ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-rose-700">本当に削除しますか?</span>
                <Button
                  tone="danger"
                  data-testid="delete-posted-confirm"
                  onClick={() => void removeProblem()}
                >
                  削除する
                </Button>
                <Button tone="ghost" onClick={() => setConfirmDelete(false)}>
                  やめる
                </Button>
              </span>
            ) : (
              <Button
                tone="danger"
                icon="trash"
                data-testid="delete-posted"
                className="sm:ml-auto"
                onClick={() => setConfirmDelete(true)}
              >
                投稿を削除
              </Button>
            ))}
        </div>

        {reporting && (
          <div className="rise-in flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Field label="通報の理由(不適切な内容、解けない など)">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 200))}
                data-testid="report-reason"
                className={inputClass()}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                tone="danger"
                size="sm"
                data-testid="report-submit"
                disabled={reason.trim().length === 0}
                onClick={() => void report()}
              >
                通報する
              </Button>
              <Button tone="ghost" size="sm" onClick={() => setReporting(false)}>
                やめる
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>
            難易度を投票({problem.difficultyVotes} 票
            {problem.votedDifficulty !== null ? ` / 平均 ${problem.votedDifficulty}` : ""})
          </Label>
          <Segmented<Vote>
            label="難易度の投票"
            mono
            value={String(problem.myDifficulty ?? "") as Vote}
            onChange={(v) => void vote(Number(v))}
            options={(["1", "2", "3", "4", "5"] as const).map((d) => ({
              value: d,
              label: d,
              testId: `vote-${d}`,
            }))}
          />
        </div>
      </Card>
    </AppShell>
  );
}

function MetricsTable({ yours, model }: { yours: Circuit; model: Circuit }) {
  const rows = circuitMetricsRows(yours, model);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] font-semibold text-slate-500">
          <th className="pb-1.5 font-semibold">指標</th>
          <th className="pb-1.5 text-right font-semibold">あなた</th>
          <th className="pb-1.5 text-right font-semibold">投稿者</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="border-t border-slate-100 py-1.5 text-slate-600">{r.label}</td>
            <td className="border-t border-slate-100 py-1.5 text-right font-mono tabular-nums">
              {r.mine}
            </td>
            <td className="border-t border-slate-100 py-1.5 text-right font-mono tabular-nums">
              {r.model}
            </td>
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
      <Card className="overflow-x-auto p-2">
        <LadderView circuit={circuit} power={sim.power} input={sim.input} />
      </Card>
      <SimulatorControls
        speed={sim.speed}
        running={sim.running}
        onSpeed={sim.setSpeed}
        onRunning={sim.setRunning}
        onReset={sim.reset}
        onStep={sim.step}
        scans={sim.scans}
      />
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
          input={sim.input}
        />
      )}
    </div>
  );
}

import {
  type Circuit,
  describeSteps,
  emptyCircuit,
  findCoilConflicts,
  type JudgeResult,
  judge,
  type Problem,
  type ReadQuestion,
  replayScenario,
} from "@ladder-dojo/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { CoilConflictNote } from "../components/CoilConflictNote.js";
import { CommonMistakes } from "../components/CommonMistakes.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { DiagnosisPanel } from "../components/DiagnosisPanel.js";
import { GlossaryText } from "../components/GlossaryText.js";
import { JudgeResultView } from "../components/JudgeResultView.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { NotationTabs } from "../components/NotationTabs.js";
import { ScenarioReplay } from "../components/ScenarioReplay.js";
import { ShareButton } from "../components/ShareButton.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { SolutionCompare } from "../components/SolutionCompare.js";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Difficulty,
  EmptyState,
  Icon,
  MODE_STYLE,
  Notice,
  PageHeader,
  Segmented,
} from "../components/ui.js";
import { useDiagnosis } from "../hooks/useDiagnosis.js";
import { useHistory } from "../hooks/useHistory.js";
import { snapshotStates, useSimulator } from "../hooks/useSimulator.js";
import { labelMap } from "../lib/describe.js";
import { useNotation } from "../lib/notation-context.jsx";
import { useProgress } from "../lib/progress-context.jsx";
import { findProblem, MODE_LABELS, nextProblem, STAGE_LABELS } from "../problems/index.js";

export function ProblemPage() {
  const { id } = useParams();
  const notation = useNotation();
  const problem = id ? findProblem(id) : undefined;

  if (!problem) {
    return (
      <AppShell width="narrow">
        <EmptyState
          icon="search"
          title="問題が見つかりませんでした"
          action={
            <Link to="/problems" className={buttonClass("secondary", "", "sm")}>
              一覧に戻る
            </Link>
          }
        />
      </AppShell>
    );
  }

  const mode = MODE_STYLE[problem.mode];

  return (
    <AppShell width="narrow">
      <PageHeader title={problem.title} back={{ to: "/problems", label: "問題一覧" }}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{STAGE_LABELS[problem.stage]}</Badge>
          <Badge tone={mode.tone} icon={mode.icon}>
            {MODE_LABELS[problem.mode]}
          </Badge>
          <Difficulty level={problem.difficulty} />
        </div>
      </PageHeader>

      <Card padded className="flex flex-col gap-4">
        <GlossaryText
          data-testid="problem-spec"
          className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800"
          text={notation.text(problem.spec)}
        />
        <div className="border-t border-slate-100 pt-3">
          <NotationTabs />
        </div>
      </Card>

      {problem.mode === "read" ? <ReadMode problem={problem} /> : <BuildMode problem={problem} />}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 読む: 予測して選び、実際に動かして答え合わせする(SPEC.md §3.2 (1))
// ---------------------------------------------------------------------------

function ReadMode({ problem }: { problem: Problem }) {
  const { record, get } = useProgress();
  const next = nextProblem(problem.id, (id) => get(id).cleared);
  const questions = problem.read?.questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const question = questions[index];

  const questionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const answered = Object.keys(answers).length;
  const allAnswered = answered === questions.length && questions.length > 0;

  /**
   * 答え合わせ(S-046)。**図は 1 つだけ**で、上の図そのものを動かす。
   * 以前は設問カードの中にもう 1 つ図を出していて、同じ図が 2 つ並び、
   * スマホでは押した先が画面の外に出ていた
   */
  const [verifying, setVerifying] = useState(false);
  const [verifyMode, setVerifyMode] = useState<"replay" | "free">("replay");

  useEffect(() => {
    // 最初の表示では動かさない。設問を進めたときだけ運ぶ
    if (index === 0) return;
    questionRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [index]);

  useEffect(() => {
    // 「動かして確かめる」を押したら、図と操作ボタンが同じ画面に入るところまで運ぶ
    if (!verifying) return;
    stageRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [verifying]);
  const allCorrect = questions.every((q) => answers[q.id] === q.answerIndex);

  const goNext = () => {
    // 次の設問は、まず予測してから。答え合わせは閉じて図を静止に戻す
    setVerifying(false);
    setVerifyMode("replay");
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  };

  const choose = (questionId: string, choiceIndex: number) => {
    // state の更新関数の中で record() を呼ばない。StrictMode では更新関数が
    // 2 回呼ばれるので、記録が二重になる。先に次の値を作ってから記録する
    if (answers[questionId] !== undefined) return;
    const next = { ...answers, [questionId]: choiceIndex };
    setAnswers(next);
    // 全設問に答えた時点で、問題としてのクリア判定を記録する(全問正解でクリア)
    if (Object.keys(next).length === questions.length) {
      record(
        problem.id,
        questions.every((q) => next[q.id] === q.answerIndex),
      );
    }
  };

  if (!question) return null;
  const isLast = index === questions.length - 1;

  return (
    <div className="flex flex-col gap-4">
      {/* 図は 1 つだけ。答え合わせ中はここが動く(S-046) */}
      <div ref={stageRef} className="scroll-mt-20" data-testid="read-stage" data-live={verifying}>
        <ReadStage
          key={question.id}
          problem={problem}
          question={question}
          verifying={verifying}
          mode={verifyMode}
          onMode={setVerifyMode}
          onClose={() => setVerifying(false)}
          onNextQuestion={isLast ? undefined : goNext}
        />
      </div>

      {/*
        設問が変わったら、そこまで画面を運ぶ(S-024)。
        これが無いと、押しても画面上部(題名・仕様文・ラダー図)がまったく同じままで、
        変わるのは小さな「設問 n / m」と設問文だけ。しかも押した直後に結果の箱と
        ボタンが消えるので、**進んだのに「元に戻った」ように見える**
      */}
      <ReadQuestionView
        ref={questionRef}
        key={question.id}
        question={question}
        chosen={answers[question.id]}
        isLast={isLast}
        onChoose={(i) => choose(question.id, i)}
        onNext={goNext}
        verifying={verifying}
        onVerify={() => setVerifying((v) => !v)}
        position={`${index + 1} / ${questions.length}`}
        questionIds={questions.map((q) => q.id)}
      />

      {allAnswered && (
        <div
          data-testid="read-complete"
          data-cleared={allCorrect}
          className={`rise-in flex items-start gap-4 rounded-2xl border p-4 text-sm sm:p-5 ${
            allCorrect
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              allCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            <Icon name={allCorrect ? "check" : "book"} className="h-6 w-6" strokeWidth={2.5} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-base font-bold">
              {allCorrect ? "この問題はクリアです" : "全問に答えました"}
            </p>
            <p>
              {allCorrect
                ? "次の問題に進みましょう。"
                : "解説を読んで、実際に動かして確かめてみてください。もう一度開き直せばやり直せます。"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {next && (
                <Link
                  to={`/problems/${next.id}`}
                  data-testid="next-problem"
                  className={buttonClass(allCorrect ? "accent" : "primary", "", "sm")}
                >
                  次の問題へ: {next.title}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              )}
              <Link to="/problems" className={buttonClass("secondary", "", "sm")}>
                問題一覧に戻る
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CHOICE_LETTERS = ["A", "B", "C", "D", "E"] as const;

/** 動きを減らす設定の人には、なめらかに運ばない */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function ReadQuestionView({
  ref,
  question,
  chosen,
  isLast,
  onChoose,
  onNext,
  verifying,
  onVerify,
  position,
  questionIds,
}: {
  /** 設問を進めたときに、ここまで画面を運ぶ(S-024) */
  ref?: React.Ref<HTMLElement>;
  question: ReadQuestion;
  chosen: number | undefined;
  isLast: boolean;
  onChoose: (index: number) => void;
  onNext: () => void;
  /** 上の図で答え合わせ中か(S-046)。図はこのカードの外にある */
  verifying: boolean;
  onVerify: () => void;
  position: string;
  /** 丸の並び用。設問の並び順 */
  questionIds: string[];
}) {
  const notation = useNotation();
  const answered = chosen !== undefined;
  const correct = chosen === question.answerIndex;

  return (
    // key が変わると作り直されるので、入場の動きがそのたびに再生される
    <section
      ref={ref}
      className="question-enter flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        {/* 丸の並びで「何問目か」を形でも示す。数字だけだと変化に気づけない */}
        <span
          className="flex gap-1"
          aria-hidden="true"
          data-testid="question-steps"
          data-current={question.id}
        >
          {questionIds.map((id) => (
            <span
              key={id}
              className={`h-2 rounded-full transition-[width,background-color] ${
                id === question.id ? "w-5 bg-amber-400" : "w-2 bg-slate-200"
              }`}
            />
          ))}
        </span>
        <p className="text-xs font-semibold text-slate-500">設問 {position}</p>
      </div>
      <p className="text-base font-semibold leading-relaxed text-slate-900">
        {notation.text(question.prompt)}
      </p>

      <ul className="flex flex-col gap-2">
        {question.choices.map((choice, i) => {
          const isAnswer = i === question.answerIndex;
          const state = !answered ? "idle" : isAnswer ? "answer" : i === chosen ? "wrong" : "idle";
          return (
            <li key={choice}>
              <button
                type="button"
                data-testid={`choice-${i}`}
                data-state={state}
                disabled={answered}
                onClick={() => onChoose(i)}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
                  state === "answer"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : state === "wrong"
                      ? "border-rose-400 bg-rose-50 text-rose-900"
                      : answered
                        ? "border-slate-200 bg-white text-slate-400"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-900 hover:bg-slate-50 active:bg-slate-100"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    state === "answer"
                      ? "bg-emerald-600 text-white"
                      : state === "wrong"
                        ? "bg-rose-600 text-white"
                        : answered
                          ? "bg-slate-100 text-slate-400"
                          : "bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white"
                  }`}
                  aria-hidden="true"
                >
                  {state === "answer" ? (
                    <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />
                  ) : state === "wrong" ? (
                    <Icon name="close" className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    (CHOICE_LETTERS[i] ?? i + 1)
                  )}
                </span>
                <span className="flex-1">{notation.text(choice)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div
          data-testid="read-result"
          data-correct={correct}
          className={`rise-in rounded-xl border p-3.5 text-sm leading-relaxed ${
            correct
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <p className="flex items-center gap-1.5 font-bold">
            <Icon name={correct ? "check" : "close"} className="h-4 w-4" strokeWidth={2.5} />
            {correct ? "正解" : "残念、ちがいます"}
          </p>
          {question.explanation && <p className="mt-1">{notation.text(question.explanation)}</p>}
        </div>
      )}

      {answered && (
        <div className="flex flex-wrap gap-2">
          <Button
            tone={verifying ? "secondary" : "accent"}
            icon={verifying ? "close" : "play"}
            data-testid="verify-with-simulator"
            onClick={onVerify}
          >
            {verifying ? "答え合わせを閉じる" : "上の図で動かして確かめる"}
          </Button>
          {!isLast && (
            <Button tone="primary" icon="arrowRight" data-testid="next-question" onClick={onNext}>
              次の設問へ
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * 答え合わせの舞台(SPEC.md §3.2 (1) / S-022 / S-046)。
 *
 * 問題文の下の**唯一のラダー図**。答える前は静止した図で、答えたあとに
 * 「動かして確かめる」を押すと、この図の上で設問と同じ操作を再生する。
 * 操作のボタンは図の直下に置き、押しながら図の変化を同じ画面で見られるようにする。
 *
 * **設問と同じ操作を再生する**のが既定。予測して選んだあと、そのとおりになるのを
 * 目で見るところまでが 1 つの学習で、そこが「読む」の狙い。
 * 自由に触りたいときのために、切り替えて自分で動かすこともできる。
 */
function ReadStage({
  problem,
  question,
  verifying,
  mode,
  onMode,
  onClose,
  onNextQuestion,
}: {
  problem: Problem;
  question: ReadQuestion;
  verifying: boolean;
  mode: "replay" | "free";
  onMode: (mode: "replay" | "free") => void;
  onClose: () => void;
  /** 最後の設問では undefined */
  onNextQuestion: (() => void) | undefined;
}) {
  const labels = labelMap(problem.deviceLabels);
  const { notation } = useNotation();
  const premiseSteps = question.premiseSteps ?? 0;
  /**
   * 設問のスタート時点(S-048)。「そのあと X1 を押して離すと」の設問では、前の操作
   * (X0 を押して離す)を済ませた状態を図に出す。**点いているところがスタート**で、
   * 設問文の「そのあと」が図と合う。前提が無い設問は、電源を入れただけの状態
   */
  const premise = useMemo(
    () => question.scenario.slice(0, premiseSteps),
    [question.scenario, premiseSteps],
  );
  const start = useMemo(() => {
    const { frames } = replayScenario(problem.solution, premise);
    return frames[frames.length - 1];
  }, [problem.solution, premise]);

  if (!verifying) {
    return (
      <Card className="p-2">
        <div className="overflow-x-auto">
          <LadderView
            circuit={problem.solution}
            deviceLabels={labels}
            power={start?.power}
            states={start ? snapshotStates(start.snapshot) : undefined}
          />
        </div>
        <p
          data-testid="read-start"
          className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-slate-600"
        >
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
            ここまでの操作
          </span>
          <span>
            {premise.length > 0
              ? describeSteps(premise, labels, notation)
              : "まだ何も操作していない"}
          </span>
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === "replay" ? (
        <ScenarioReplay
          circuit={problem.solution}
          steps={question.scenario}
          deviceLabels={labels}
          premiseSteps={premiseSteps}
        />
      ) : (
        <FreePlay problem={problem} />
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <Segmented<"replay" | "free">
          label="確かめ方"
          size="sm"
          value={mode}
          onChange={onMode}
          options={[
            { value: "replay", label: "この設問の操作を再生", testId: "verify-mode-replay" },
            { value: "free", label: "自分で動かす", testId: "verify-mode-free" },
          ]}
        />
        <div className="ml-auto flex gap-1.5">
          {onNextQuestion && (
            <Button
              size="sm"
              icon="arrowRight"
              data-testid="stage-next-question"
              onClick={onNextQuestion}
            >
              次の設問へ
            </Button>
          )}
          <Button tone="ghost" size="sm" icon="close" data-testid="stage-close" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 自由に触るシミュレータ */
function FreePlay({ problem }: { problem: Problem }) {
  const sim = useSimulator(problem.solution);
  const labels = labelMap(problem.deviceLabels);
  // 同じデバイスに複数のコイルが書いている(SET と RST の両方に通電など)ときの印と理由(S-049)
  const conflicts = useMemo(
    () => findCoilConflicts(problem.solution, sim.power),
    [problem.solution, sim.power],
  );
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-x-auto p-2 ring-2 ring-amber-400/40">
        <LadderView
          circuit={problem.solution}
          power={sim.power}
          states={sim.states}
          deviceLabels={labels}
          input={sim.input}
          conflicts={conflicts}
        />
      </Card>
      <CoilConflictNote conflicts={conflicts} deviceLabels={labels} />
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
        circuit={problem.solution}
        deviceLabels={labels}
        input={sim.input}
      />
      {/* 図を先頭に置くため、説明は下に。読まなくても押せば分かる */}
      <p className="text-xs leading-relaxed text-slate-500">
        入力は押しボタンです。押している間だけ ON になり、離すと OFF に戻ります。センサのように
        ずっと ON にしたいときは「保持」を使ってください。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 直す / 書く: 回路を編集して判定する(SPEC.md §3.2 (2)(3))
// ---------------------------------------------------------------------------

function BuildMode({ problem }: { problem: Problem }) {
  const { record, recordSubmission, get } = useProgress();
  const notation = useNotation();
  const initial = useMemo<Circuit>(
    () => problem.fix?.initial ?? problem.write?.initial ?? emptyCircuit(6, 4),
    [problem],
  );
  // 編集は「元に戻す / やり直す」つき(S-038)。誤タップで消した部品を取り戻せる
  const history = useHistory<Circuit>(initial);
  const circuit = history.value;
  const setCircuit = history.set;
  const [tab, setTab] = useState<"edit" | "run">("edit");
  /**
   * 答え合わせしたときの回路と結果を 1 組で持つ。
   * 回路だけ別に持つと、結果を出したあとに編集されたとき、判定は古いのに
   * タイムチャートや診断だけ新しい回路のものになってしまう
   */
  const [checked, setChecked] = useState<{ circuit: Circuit; result: JudgeResult } | undefined>(
    undefined,
  );
  // この画面で「答え合わせ」に失敗した回数。つまずき診断を出すかどうかに使う(S-009)
  const [failures, setFailures] = useState(0);
  const labels = labelMap(problem.deviceLabels);
  const hint = problem.fix?.hint ?? problem.write?.hint;
  const result = checked?.result;

  const diagnosis = useDiagnosis(checked?.circuit, problem.testCases, result);

  const check = () => {
    const judged = judge(circuit, problem.testCases);
    setChecked({ circuit, result: judged });
    if (!judged.passed) setFailures((n) => n + 1);
    record(problem.id, judged.passed);
  };

  /**
   * 提出は診断がついてから送る(SPEC.md §3.5)。
   * つまずきの種類を一緒に送ると「みんながつまずくところ」を人数で数えられる。
   * 診断は 1 秒近くかかることがあるので、判定の表示を待たせないよう、済んでから送る。
   */
  const [sent, setSent] = useState<JudgeResult | undefined>(undefined);
  useEffect(() => {
    if (!checked || diagnosis.state !== "done") return;
    if (sent === checked.result) return;
    setSent(checked.result);
    recordSubmission(
      problem.id,
      checked.circuit,
      checked.result.passed,
      diagnosis.diagnoses[0]?.id,
    );
  }, [checked, diagnosis, sent, problem.id, recordSubmission]);

  return (
    <div className="flex flex-col gap-4">
      {problem.fix && (
        // 「か所」と言わない(S-025)。bugCount は**不具合の個数**であって、
        // 直すマスの数ではない。9 問中 5 問は 1 つの不具合を直すのに 2〜4 マス
        // 触る必要がある。「1 か所」と言うと、1 マス直せば通ると読めてしまい、
        // 通らなかった学習者を「1 か所と言ったのに」で止めてしまう
        <Notice tone="warning" data-testid="fix-hint">
          {problem.fix.bugCount === 1
            ? "この回路には直すべきところが 1 つあります。直すマスは 1 つとは限りません。"
            : `この回路には直すべきところが ${problem.fix.bugCount} つあります。`}
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
        <RunPanel circuit={circuit} labels={labels} />
      )}

      {/* いちばん押すボタンは、長い編集画面でも指の届くところに留める */}
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
        <Button
          tone="secondary"
          size="lg"
          icon="reset"
          data-testid="reset-circuit"
          onClick={() => {
            history.reset(initial);
            setChecked(undefined);
            setFailures(0);
          }}
        >
          最初から
        </Button>
      </div>

      {hint && (
        <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
            <Icon name="info" className="h-4 w-4 text-slate-400" />
            ヒントを見る
            <Icon
              name="chevronDown"
              className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
            />
          </summary>
          <GlossaryText
            className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700"
            text={notation.text(hint)}
          />
        </details>
      )}

      <CommonMistakes problemId={problem.id} />

      {checked && (
        <JudgeResultView result={checked.result} problem={problem} circuit={checked.circuit} />
      )}
      {result?.passed && (
        <NextProblemCard problemId={problem.id} isCleared={(id) => get(id).cleared} />
      )}
      {checked && (
        <DiagnosisPanel
          circuit={checked.circuit}
          diagnosis={diagnosis}
          failures={failures}
          deviceLabels={labels}
        />
      )}
      {result?.passed && <SolutionCompare problem={problem} yours={circuit} />}
    </div>
  );
}

function RunPanel({ circuit, labels }: { circuit: Circuit; labels: Record<string, string> }) {
  const sim = useSimulator(circuit);
  // 自分の回路で二重コイルや SET / RST の衝突が起きたら、その場で理由を出す(S-049)
  const conflicts = useMemo(() => findCoilConflicts(circuit, sim.power), [circuit, sim.power]);
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-x-auto p-2">
        <LadderView
          circuit={circuit}
          power={sim.power}
          states={sim.states}
          deviceLabels={labels}
          input={sim.input}
          conflicts={conflicts}
        />
      </Card>
      <CoilConflictNote conflicts={conflicts} deviceLabels={labels} />
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
          deviceLabels={labels}
          input={sim.input}
        />
      )}
    </div>
  );
}

/** 正解のあとに次の 1 問へつなぐ(S-038)。一覧に戻らなくても続けられる */
function NextProblemCard({
  problemId,
  isCleared,
}: {
  problemId: string;
  isCleared: (id: string) => boolean;
}) {
  const next = nextProblem(problemId, isCleared);
  return (
    <div className="rise-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">次はこれ</p>
        <p className="truncate text-sm font-bold text-slate-900">
          {next ? next.title : "公式問題はすべてクリアしました"}
        </p>
      </div>
      {next ? (
        <Link
          to={`/problems/${next.id}`}
          data-testid="next-problem"
          className={buttonClass("accent")}
        >
          次の問題へ
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      ) : (
        <Link to="/community" className={buttonClass("secondary")}>
          みんなの問題を見る
        </Link>
      )}
    </div>
  );
}

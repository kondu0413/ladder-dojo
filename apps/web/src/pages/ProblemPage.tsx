import {
  type Circuit,
  emptyCircuit,
  type JudgeResult,
  judge,
  type Problem,
  type ReadQuestion,
} from "@ladder-dojo/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { CommonMistakes } from "../components/CommonMistakes.js";
import { DevicePanel } from "../components/DevicePanel.js";
import { DiagnosisPanel } from "../components/DiagnosisPanel.js";
import { JudgeResultView } from "../components/JudgeResultView.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { NotationTabs } from "../components/NotationTabs.js";
import { ScenarioReplay } from "../components/ScenarioReplay.js";
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
import { useSimulator } from "../hooks/useSimulator.js";
import { labelMap } from "../lib/describe.js";
import { useNotation } from "../lib/notation-context.jsx";
import { useProgress } from "../lib/progress-context.jsx";
import { findProblem, MODE_LABELS, STAGE_LABELS } from "../problems/index.js";

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
        <p
          data-testid="problem-spec"
          className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800"
        >
          {notation.text(problem.spec)}
        </p>
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
  const { record } = useProgress();
  const questions = problem.read?.questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const question = questions[index];
  const labels = labelMap(problem.deviceLabels);

  const questionRef = useRef<HTMLElement | null>(null);
  const answered = Object.keys(answers).length;
  const allAnswered = answered === questions.length && questions.length > 0;

  useEffect(() => {
    // 最初の表示では動かさない。設問を進めたときだけ運ぶ
    if (index === 0) return;
    questionRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [index]);
  const allCorrect = questions.every((q) => answers[q.id] === q.answerIndex);

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

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto p-2">
        <LadderView circuit={problem.solution} deviceLabels={labels} />
      </Card>

      {/*
        設問が変わったら、そこまで画面を運ぶ(S-024)。
        これが無いと、押しても画面上部(題名・仕様文・ラダー図)がまったく同じままで、
        変わるのは小さな「設問 n / m」と設問文だけ。しかも押した直後に結果の箱と
        ボタンが消えるので、**進んだのに「元に戻った」ように見える**
      */}
      <ReadQuestionView
        ref={questionRef}
        key={question.id}
        problem={problem}
        question={question}
        chosen={answers[question.id]}
        isLast={index === questions.length - 1}
        onChoose={(i) => choose(question.id, i)}
        onNext={() => setIndex((i) => Math.min(i + 1, questions.length - 1))}
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
            <Link
              to="/problems"
              className="mt-2 inline-flex w-fit items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
            >
              問題一覧に戻る
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const CHOICE_LETTERS = ["A", "B", "C", "D", "E"] as const;

function ReadQuestionView({
  ref,
  problem,
  question,
  chosen,
  isLast,
  onChoose,
  onNext,
  position,
  questionIds,
}: {
  /** 設問を進めたときに、ここまで画面を運ぶ(S-024) */
  ref?: React.Ref<HTMLElement>;
  problem: Problem;
  question: ReadQuestion;
  chosen: number | undefined;
  isLast: boolean;
  onChoose: (index: number) => void;
  onNext: () => void;
  position: string;
  /** 丸の並び用。設問の並び順 */
  questionIds: string[];
}) {
  const [verifying, setVerifying] = useState(false);
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
            onClick={() => setVerifying((v) => !v)}
          >
            {verifying ? "閉じる" : "実際に動かして確かめる"}
          </Button>
          {!isLast && (
            <Button tone="primary" icon="arrowRight" data-testid="next-question" onClick={onNext}>
              次の設問へ
            </Button>
          )}
        </div>
      )}

      {verifying && <VerifyPanel problem={problem} question={question} />}
    </section>
  );
}

/**
 * 答え合わせ(SPEC.md §3.2 (1) / S-022)。
 *
 * **設問と同じ操作を再生する**のが既定。予測して選んだあと、そのとおりになるのを
 * 目で見るところまでが 1 つの学習で、そこが「読む」の狙い。
 * 以前は自由操作のシミュレータだけだったので、学習者が設問と同じ操作を
 * 自分で組み立て直す必要があった。
 *
 * 自由に触りたいときのために、切り替えて自分で動かすこともできる。
 */
function VerifyPanel({ problem, question }: { problem: Problem; question: ReadQuestion }) {
  const [mode, setMode] = useState<"replay" | "free">("replay");
  const labels = labelMap(problem.deviceLabels);

  return (
    <div className="rise-in flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <Segmented<"replay" | "free">
        label="確かめ方"
        value={mode}
        onChange={setMode}
        options={[
          { value: "replay", label: "この設問の操作を再生", testId: "verify-mode-replay" },
          { value: "free", label: "自分で動かす", testId: "verify-mode-free" },
        ]}
      />

      {mode === "replay" ? (
        <ScenarioReplay
          circuit={problem.solution}
          steps={question.scenario}
          deviceLabels={labels}
        />
      ) : (
        <FreePlay problem={problem} />
      )}
    </div>
  );
}

/** 自由に触るシミュレータ */
function FreePlay({ problem }: { problem: Problem }) {
  const sim = useSimulator(problem.solution);
  const labels = labelMap(problem.deviceLabels);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-slate-500">
        入力は押しボタンです。押している間だけ ON になり、離すと OFF に戻ります。センサのように
        ずっと ON にしたいときは「保持」を使ってください。
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView
          circuit={problem.solution}
          power={sim.power}
          deviceLabels={labels}
          input={sim.input}
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
        circuit={problem.solution}
        deviceLabels={labels}
        input={sim.input}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 直す / 書く: 回路を編集して判定する(SPEC.md §3.2 (2)(3))
// ---------------------------------------------------------------------------

function BuildMode({ problem }: { problem: Problem }) {
  const { record, recordSubmission } = useProgress();
  const notation = useNotation();
  const initial = useMemo<Circuit>(
    () => problem.fix?.initial ?? problem.write?.initial ?? emptyCircuit(6, 4),
    [problem],
  );
  const [circuit, setCircuit] = useState<Circuit>(initial);
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
        <LadderEditor circuit={circuit} onChange={setCircuit} />
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
            setCircuit(initial);
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
          <p className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {notation.text(hint)}
          </p>
        </details>
      )}

      <CommonMistakes problemId={problem.id} />

      {checked && (
        <JudgeResultView result={checked.result} problem={problem} circuit={checked.circuit} />
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
  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-x-auto p-2">
        <LadderView circuit={circuit} power={sim.power} deviceLabels={labels} input={sim.input} />
      </Card>
      <SimulatorControls
        speed={sim.speed}
        running={sim.running}
        onSpeed={sim.setSpeed}
        onRunning={sim.setRunning}
        onReset={sim.reset}
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

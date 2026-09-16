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
import { ScenarioReplay } from "../components/ScenarioReplay.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { SolutionCompare } from "../components/SolutionCompare.js";
import { Badge, buttonClass, Card, PageHeader } from "../components/ui.js";
import { useDiagnosis } from "../hooks/useDiagnosis.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { labelMap } from "../lib/describe.js";
import { useProgress } from "../lib/progress-context.jsx";
import { findProblem, MODE_LABELS, STAGE_LABELS } from "../problems/index.js";

export function ProblemPage() {
  const { id } = useParams();
  const problem = id ? findProblem(id) : undefined;

  if (!problem) {
    return (
      <AppShell width="narrow">
        <p className="text-slate-700">問題が見つかりませんでした。</p>
        <Link to="/problems" className="text-sm text-slate-500 underline">
          一覧に戻る
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader title={problem.title} back={{ to: "/problems", label: "問題一覧" }} />
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge>{STAGE_LABELS[problem.stage]}</Badge>
        <Badge tone="blue">{MODE_LABELS[problem.mode]}</Badge>
        <Badge>難易度 {problem.difficulty}</Badge>
      </div>

      <Card className="mb-5 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{problem.spec}</p>
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
    setAnswers((prev) => {
      if (prev[questionId] !== undefined) return prev;
      const next = { ...prev, [questionId]: choiceIndex };
      // 全設問に答えた時点で、問題としてのクリア判定を記録する(全問正解でクリア)
      if (Object.keys(next).length === questions.length) {
        record(
          problem.id,
          questions.every((q) => next[q.id] === q.answerIndex),
        );
      }
      return next;
    });
  };

  if (!question) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView circuit={problem.solution} deviceLabels={labels} />
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
          className={`rounded-xl border p-4 text-sm ${
            allCorrect
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-slate-300 bg-slate-50 text-slate-700"
          }`}
        >
          <p className="font-bold">{allCorrect ? "この問題はクリアです" : "全問に答えました"}</p>
          <p className="mt-1">
            {allCorrect
              ? "次の問題に進みましょう。"
              : "解説を読んで、実際に動かして確かめてみてください。もう一度開き直せばやり直せます。"}
          </p>
          <Link to="/problems" className="mt-2 inline-block underline">
            問題一覧に戻る
          </Link>
        </div>
      )}
    </div>
  );
}

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
  const answered = chosen !== undefined;
  const correct = chosen === question.answerIndex;

  return (
    // key が変わると作り直されるので、入場の動きがそのたびに再生される
    <section
      ref={ref}
      className="question-enter flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
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
              className={`h-2 w-2 rounded-full ${
                id === question.id ? "bg-blue-600" : "bg-slate-200"
              }`}
            />
          ))}
        </span>
        <p className="text-xs font-semibold text-blue-700">設問 {position}</p>
      </div>
      <p className="text-base font-medium leading-relaxed text-slate-800">{question.prompt}</p>

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
                className={`w-full rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition ${
                  state === "answer"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : state === "wrong"
                      ? "border-red-400 bg-red-50 text-red-900"
                      : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {choice}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div
          data-testid="read-result"
          data-correct={correct}
          className={`rounded-xl border p-3 text-sm ${
            correct
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-bold">{correct ? "正解" : "残念、ちがいます"}</p>
          {question.explanation && <p className="mt-1">{question.explanation}</p>}
        </div>
      )}

      {answered && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="verify-with-simulator"
            onClick={() => setVerifying((v) => !v)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
          >
            {verifying ? "閉じる" : "実際に動かして確かめる"}
          </button>
          {!isLast && (
            <button
              type="button"
              data-testid="next-question"
              onClick={onNext}
              className="min-h-11 rounded-lg bg-slate-700 px-4 text-sm font-medium text-white"
            >
              次の設問へ
            </button>
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
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <fieldset className="flex gap-2 border-0 p-0">
        <legend className="sr-only">確かめ方</legend>
        <button
          type="button"
          data-testid="verify-mode-replay"
          aria-pressed={mode === "replay"}
          onClick={() => setMode("replay")}
          className={buttonClass(mode === "replay" ? "primary" : "secondary", "px-3 text-xs")}
        >
          この設問の操作を再生
        </button>
        <button
          type="button"
          data-testid="verify-mode-free"
          aria-pressed={mode === "free"}
          onClick={() => setMode("free")}
          className={buttonClass(mode === "free" ? "primary" : "secondary", "px-3 text-xs")}
        >
          自分で動かす
        </button>
      </fieldset>

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
      <p className="text-xs text-slate-500">
        入力をタップして、予想どおりに動くか確かめてください。
      </p>
      <div className="overflow-x-auto rounded-lg bg-white p-2">
        <LadderView
          circuit={problem.solution}
          power={sim.power}
          deviceLabels={labels}
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
        deviceLabels={labels}
        onToggleInput={sim.toggleInput}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 直す / 書く: 回路を編集して判定する(SPEC.md §3.2 (2)(3))
// ---------------------------------------------------------------------------

function BuildMode({ problem }: { problem: Problem }) {
  const { record, recordSubmission } = useProgress();
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
        <p
          data-testid="fix-hint"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {problem.fix.bugCount === 1
            ? "この回路には直すべきところが 1 つあります。直すマスは 1 つとは限りません。"
            : `この回路には直すべきところが ${problem.fix.bugCount} つあります。`}
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
        <RunPanel circuit={circuit} labels={labels} />
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="check-answer"
          onClick={check}
          className="min-h-11 flex-1 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white"
        >
          答え合わせ
        </button>
        <button
          type="button"
          data-testid="reset-circuit"
          onClick={() => {
            setCircuit(initial);
            setChecked(undefined);
            setFailures(0);
          }}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
        >
          最初から
        </button>
      </div>

      {hint && (
        <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm text-slate-600">ヒントを見る</summary>
          <p className="mt-2 text-sm text-slate-700">{hint}</p>
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
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView
          circuit={circuit}
          power={sim.power}
          deviceLabels={labels}
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
      {sim.devices.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          まだ部品が置かれていません。
        </p>
      ) : (
        <DevicePanel
          devices={sim.devices}
          snapshot={sim.snapshot}
          deviceLabels={labels}
          onToggleInput={sim.toggleInput}
        />
      )}
    </div>
  );
}

import {
  type Circuit,
  emptyCircuit,
  type JudgeResult,
  judge,
  type Problem,
  type ReadQuestion,
} from "@ladder-dojo/core";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { DevicePanel } from "../components/DevicePanel.js";
import { JudgeResultView } from "../components/JudgeResultView.js";
import { LadderEditor } from "../components/LadderEditor.js";
import { LadderView } from "../components/LadderView.js";
import { SimulatorControls } from "../components/SimulatorControls.js";
import { SolutionCompare } from "../components/SolutionCompare.js";
import { useSimulator } from "../hooks/useSimulator.js";
import { labelMap } from "../lib/describe.js";
import { recordAttempt } from "../lib/progress.js";
import { findProblem, MODE_LABELS, STAGE_LABELS } from "../problems/index.js";

export function ProblemPage() {
  const { id } = useParams();
  const problem = id ? findProblem(id) : undefined;

  if (!problem) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 px-4 py-6">
        <p className="text-slate-700">問題が見つかりませんでした。</p>
        <Link to="/" className="text-sm text-slate-500 underline">
          一覧に戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <Link to="/" className="text-sm text-slate-500 underline">
          ← 問題一覧
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{problem.title}</h1>
        <p className="text-xs text-slate-500">
          {STAGE_LABELS[problem.stage]} ・ {MODE_LABELS[problem.mode]} ・ 難易度{" "}
          {problem.difficulty}
        </p>
      </header>

      <p className="whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-700">
        {problem.spec}
      </p>

      {problem.mode === "read" ? <ReadMode problem={problem} /> : <BuildMode problem={problem} />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// 読む: 予測して選び、実際に動かして答え合わせする(SPEC.md §3.2 (1))
// ---------------------------------------------------------------------------

function ReadMode({ problem }: { problem: Problem }) {
  const questions = problem.read?.questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const question = questions[index];
  const labels = labelMap(problem.deviceLabels);

  const answered = Object.keys(answers).length;
  const allAnswered = answered === questions.length && questions.length > 0;
  const allCorrect = questions.every((q) => answers[q.id] === q.answerIndex);

  const choose = (questionId: string, choiceIndex: number) => {
    setAnswers((prev) => {
      if (prev[questionId] !== undefined) return prev;
      const next = { ...prev, [questionId]: choiceIndex };
      // 全設問に答えた時点で、問題としてのクリア判定を記録する(全問正解でクリア)
      if (Object.keys(next).length === questions.length) {
        recordAttempt(
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

      <ReadQuestionView
        key={question.id}
        problem={problem}
        question={question}
        chosen={answers[question.id]}
        isLast={index === questions.length - 1}
        onChoose={(i) => choose(question.id, i)}
        onNext={() => setIndex((i) => Math.min(i + 1, questions.length - 1))}
        position={`${index + 1} / ${questions.length}`}
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
          <Link to="/" className="mt-2 inline-block underline">
            問題一覧に戻る
          </Link>
        </div>
      )}
    </div>
  );
}

function ReadQuestionView({
  problem,
  question,
  chosen,
  isLast,
  onChoose,
  onNext,
  position,
}: {
  problem: Problem;
  question: ReadQuestion;
  chosen: number | undefined;
  isLast: boolean;
  onChoose: (index: number) => void;
  onNext: () => void;
  position: string;
}) {
  const [verifying, setVerifying] = useState(false);
  const answered = chosen !== undefined;
  const correct = chosen === question.answerIndex;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">設問 {position}</p>
      <p className="text-sm font-medium text-slate-800">{question.prompt}</p>

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
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
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
            {verifying ? "シミュレータを閉じる" : "実際に動かして確かめる"}
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

      {verifying && <VerifyPanel problem={problem} />}
    </section>
  );
}

/** 答え合わせ用のシミュレータ。自分で操作して確かめてもらう */
function VerifyPanel({ problem }: { problem: Problem }) {
  const sim = useSimulator(problem.solution);
  const labels = labelMap(problem.deviceLabels);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
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
  const initial = useMemo<Circuit>(
    () => problem.fix?.initial ?? problem.write?.initial ?? emptyCircuit(6, 4),
    [problem],
  );
  const [circuit, setCircuit] = useState<Circuit>(initial);
  const [tab, setTab] = useState<"edit" | "run">("edit");
  const [result, setResult] = useState<JudgeResult | undefined>(undefined);
  const labels = labelMap(problem.deviceLabels);
  const hint = problem.fix?.hint ?? problem.write?.hint;

  const check = () => {
    const judged = judge(circuit, problem.testCases);
    setResult(judged);
    recordAttempt(problem.id, judged.passed);
  };

  return (
    <div className="flex flex-col gap-4">
      {problem.fix && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          この回路には間違いが {problem.fix.bugCount} か所あります。
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
            setResult(undefined);
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

      {result && <JudgeResultView result={result} problem={problem} />}
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

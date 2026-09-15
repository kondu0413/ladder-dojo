import {
  type Circuit,
  type DeviceId,
  listDevices,
  type Step,
  type TestCase,
} from "@ladder-dojo/core";
import { useMemo, useState } from "react";
import { describeStep } from "../lib/describe.js";

export type TestCaseEditorProps = {
  circuit: Circuit;
  testCases: TestCase[];
  onChange: (testCases: TestCase[]) => void;
};

/**
 * 自分でテストケース(入力シーケンス → 期待出力)を付ける(SPEC.md §3.4)。
 * ここで作ったテストは、フェーズ2 で問題として公開するときの判定にそのまま使う。
 */
export function TestCaseEditor({ circuit, testCases, onChange }: TestCaseEditorProps) {
  const devices = useMemo(() => listDevices(circuit), [circuit]);
  const inputs = useMemo(() => devices.filter((d) => d.startsWith("X")), [devices]);
  const observables = useMemo(() => devices.filter((d) => !d.startsWith("X")), [devices]);
  const [openIndex, setOpenIndex] = useState(0);

  const addCase = () => {
    const next: TestCase = {
      id: `tc${testCases.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      title: `テスト ${testCases.length + 1}`,
      steps: [],
    };
    onChange([...testCases, next]);
    setOpenIndex(testCases.length);
  };

  const update = (index: number, patch: Partial<TestCase>) => {
    onChange(testCases.map((tc, i) => (i === index ? { ...tc, ...patch } : tc)));
  };

  const remove = (index: number) => {
    onChange(testCases.filter((_, i) => i !== index));
    setOpenIndex(0);
  };

  if (devices.length === 0) {
    return (
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
        先に回路を作ってください。回路で使っているデバイスがテストの対象になります。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          入力の操作を並べて、途中や最後に「出力を確認」を入れます。
        </p>
        <button
          type="button"
          data-testid="add-test-case"
          onClick={addCase}
          className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
        >
          テストを追加
        </button>
      </div>

      {testCases.length === 0 && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          まだテストがありません。
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {testCases.map((tc, index) => (
          <li key={tc.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                value={tc.title}
                onChange={(e) => update(index, { title: e.target.value.slice(0, 100) })}
                data-testid={`test-title-${index}`}
                aria-label={`テスト ${index + 1} の名前`}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm"
              />
              <button
                type="button"
                data-testid={`open-test-${index}`}
                onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-600"
              >
                {openIndex === index ? "閉じる" : "開く"}
              </button>
              <button
                type="button"
                data-testid={`remove-test-${index}`}
                onClick={() => remove(index)}
                className="min-h-11 shrink-0 rounded-lg border border-red-300 px-3 text-xs text-red-600"
              >
                削除
              </button>
            </div>

            {openIndex === index && (
              <div className="border-t border-slate-100 px-3 py-3">
                <StepList
                  steps={tc.steps}
                  onChange={(steps) => update(index, { steps })}
                  inputs={inputs}
                  observables={observables}
                  testIdPrefix={`case-${index}`}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepList({
  steps,
  onChange,
  inputs,
  observables,
  testIdPrefix,
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  inputs: DeviceId[];
  observables: DeviceId[];
  testIdPrefix: string;
}) {
  // ステップに ID は無いので、内容と「同じ内容の何番目か」から安定したキーを作る
  const rows = useMemo(() => {
    const seen = new Map<string, number>();
    return steps.map((step) => {
      const base = JSON.stringify(step);
      const nth = (seen.get(base) ?? 0) + 1;
      seen.set(base, nth);
      return { key: `${base}#${nth}`, step };
    });
  }, [steps]);

  const [device, setDevice] = useState<DeviceId | undefined>(inputs[0]);
  const [target, setTarget] = useState<DeviceId | undefined>(observables[0]);
  const [seconds, setSeconds] = useState(1);

  const append = (step: Step) => onChange([...steps, step]);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {rows.map(({ key, step }, i) => (
          <li
            key={key}
            data-testid={`${testIdPrefix}-step-${i}`}
            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 text-sm"
          >
            <span className="min-w-0 truncate">
              {i + 1}. {describeStep(step)}
              {step.type === "expect" && (
                <span className="ml-1 text-slate-500">
                  (
                  {Object.entries(step.outputs)
                    .map(([d, on]) => `${d}=${on ? "ON" : "OFF"}`)
                    .join(", ")}
                  )
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, j) => j !== i))}
              className="shrink-0 px-2 text-xs text-red-600"
              aria-label={`${i + 1} 番目の操作を削除`}
            >
              ✕
            </button>
          </li>
        ))}
        {steps.length === 0 && <li className="text-sm text-slate-400">操作がありません</li>}
      </ol>

      {inputs.length > 0 && (
        <section className="flex flex-wrap items-center gap-2">
          <select
            value={device ?? ""}
            onChange={(e) => setDevice(e.target.value as DeviceId)}
            data-testid={`${testIdPrefix}-input-device`}
            aria-label="操作する入力"
            className="min-h-11 rounded-lg border border-slate-300 px-2 font-mono text-sm"
          >
            {inputs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid={`${testIdPrefix}-add-press`}
            onClick={() => device && append({ type: "press", device })}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
          >
            押して離す
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-add-on`}
            onClick={() => device && append({ type: "set", inputs: { [device]: true } })}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
          >
            ON にする
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-add-off`}
            onClick={() => device && append({ type: "set", inputs: { [device]: false } })}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
          >
            OFF にする
          </button>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0.1}
          max={120}
          step={0.5}
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
          data-testid={`${testIdPrefix}-wait-seconds`}
          aria-label="待つ秒数"
          className="min-h-11 w-20 rounded-lg border border-slate-300 px-2 text-sm"
        />
        <button
          type="button"
          data-testid={`${testIdPrefix}-add-wait`}
          onClick={() => append({ type: "wait", ms: Math.max(1, Math.round(seconds * 1000)) })}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
        >
          秒待つ
        </button>
      </section>

      {observables.length > 0 && (
        <section className="flex flex-wrap items-center gap-2">
          <select
            value={target ?? ""}
            onChange={(e) => setTarget(e.target.value as DeviceId)}
            data-testid={`${testIdPrefix}-expect-device`}
            aria-label="確認する出力"
            className="min-h-11 rounded-lg border border-slate-300 px-2 font-mono text-sm"
          >
            {observables.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid={`${testIdPrefix}-expect-on`}
            onClick={() => target && append({ type: "expect", outputs: { [target]: true } })}
            className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3 text-sm text-emerald-700"
          >
            ON を期待
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-expect-off`}
            onClick={() => target && append({ type: "expect", outputs: { [target]: false } })}
            className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3 text-sm text-emerald-700"
          >
            OFF を期待
          </button>
        </section>
      )}
    </div>
  );
}

import {
  type Circuit,
  type DeviceId,
  listDevices,
  type Step,
  type TestCase,
} from "@ladder-dojo/core";
import { useMemo, useState } from "react";
import { describeStep } from "../lib/describe.js";
import { useNotation } from "../lib/notation-context.jsx";
import { Button, Card, EmptyState, Icon, inputClass, Label, selectClass } from "./ui.js";

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
      <EmptyState
        icon="flask"
        title="先に回路を作ってください"
        body="回路で使っているデバイスがテストの対象になります。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-slate-500">
          入力の操作を並べて、途中や最後に「出力を確認」を入れます。
        </p>
        <Button tone="secondary" icon="plus" data-testid="add-test-case" onClick={addCase}>
          テストを追加
        </Button>
      </div>

      {testCases.length === 0 && (
        <EmptyState
          icon="flask"
          title="まだテストがありません"
          body="「テストを追加」から、期待する動きを 1 つずつ書いていきます。"
        />
      )}

      <ul className="flex flex-col gap-2">
        {testCases.map((tc, index) => {
          const open = openIndex === index;
          return (
            <li key={tc.id}>
              <Card className={open ? "border-slate-300" : ""}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-600">
                    {index + 1}
                  </span>
                  <input
                    value={tc.title}
                    onChange={(e) => update(index, { title: e.target.value.slice(0, 100) })}
                    data-testid={`test-title-${index}`}
                    aria-label={`テスト ${index + 1} の名前`}
                    className={inputClass(
                      "min-h-10 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-slate-300",
                    )}
                  />
                  <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
                    {tc.steps.length} 手
                  </span>
                  <Button
                    tone="ghost"
                    size="sm"
                    data-testid={`open-test-${index}`}
                    onClick={() => setOpenIndex(open ? -1 : index)}
                    aria-expanded={open}
                  >
                    {open ? "閉じる" : "開く"}
                    <Icon
                      name="chevronDown"
                      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </Button>
                  <Button
                    tone="danger"
                    size="sm"
                    icon="trash"
                    data-testid={`remove-test-${index}`}
                    onClick={() => remove(index)}
                  >
                    削除
                  </Button>
                </div>

                {open && (
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
              </Card>
            </li>
          );
        })}
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
  const notation = useNotation();
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
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1">
        {rows.map(({ key, step }, i) => (
          <li
            key={key}
            data-testid={`${testIdPrefix}-step-${i}`}
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
              step.type === "expect"
                ? "bg-emerald-50 text-emerald-900"
                : "bg-slate-50 text-slate-700"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-slate-400">
                {i + 1}
              </span>
              <span className="min-w-0 truncate">
                {describeStep(step, undefined, notation.notation)}
                {step.type === "expect" && (
                  <span className="ml-1 font-mono text-xs text-emerald-700">
                    (
                    {Object.entries(step.outputs)
                      .map(([d, on]) => `${notation.device(d)}=${on ? "ON" : "OFF"}`)
                      .join(", ")}
                    )
                  </span>
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, j) => j !== i))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              aria-label={`${i + 1} 番目の操作を削除`}
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {steps.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">
            操作がありません。下のボタンで足していきます
          </li>
        )}
      </ol>

      {inputs.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Label>入力を操作する</Label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={device ?? ""}
              onChange={(e) => setDevice(e.target.value as DeviceId)}
              data-testid={`${testIdPrefix}-input-device`}
              aria-label="操作する入力"
              className={selectClass("w-auto font-mono")}
            >
              {inputs.map((d) => (
                <option key={d} value={d}>
                  {notation.device(d)}
                </option>
              ))}
            </select>
            <Button
              tone="secondary"
              data-testid={`${testIdPrefix}-add-press`}
              onClick={() => device && append({ type: "press", device })}
            >
              押して離す
            </Button>
            <Button
              tone="secondary"
              data-testid={`${testIdPrefix}-add-on`}
              onClick={() => device && append({ type: "set", inputs: { [device]: true } })}
            >
              ON にする
            </Button>
            <Button
              tone="secondary"
              data-testid={`${testIdPrefix}-add-off`}
              onClick={() => device && append({ type: "set", inputs: { [device]: false } })}
            >
              OFF にする
            </Button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <Label>時間を進める</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0.1}
            max={120}
            step={0.5}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            data-testid={`${testIdPrefix}-wait-seconds`}
            aria-label="待つ秒数"
            className={inputClass("w-24 font-mono")}
          />
          <Button
            tone="secondary"
            icon="clock"
            data-testid={`${testIdPrefix}-add-wait`}
            onClick={() => append({ type: "wait", ms: Math.max(1, Math.round(seconds * 1000)) })}
          >
            秒待つ
          </Button>
        </div>
      </section>

      {observables.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Label>出力を確認する</Label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={target ?? ""}
              onChange={(e) => setTarget(e.target.value as DeviceId)}
              data-testid={`${testIdPrefix}-expect-device`}
              aria-label="確認する出力"
              className={selectClass("w-auto font-mono")}
            >
              {observables.map((d) => (
                <option key={d} value={d}>
                  {notation.device(d)}
                </option>
              ))}
            </select>
            <Button
              tone="success"
              data-testid={`${testIdPrefix}-expect-on`}
              onClick={() => target && append({ type: "expect", outputs: { [target]: true } })}
            >
              ON を期待
            </Button>
            <Button
              tone="secondary"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              data-testid={`${testIdPrefix}-expect-off`}
              onClick={() => target && append({ type: "expect", outputs: { [target]: false } })}
            >
              OFF を期待
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

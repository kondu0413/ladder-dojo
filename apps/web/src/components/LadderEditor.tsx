import {
  addColumn,
  addRow,
  type Circuit,
  canPlace,
  canSetVline,
  clearElement,
  connectRow,
  type DeviceId,
  type DeviceType,
  type Element,
  hasVline,
  putElement,
  removeColumn,
  removeRow,
  setVline,
} from "@ladder-dojo/core";
import { useState } from "react";
import { LadderView } from "./LadderView.js";

/** パレットの部品。device が必要なものは選択中のデバイスを使う */
type PartId = "wire" | "no" | "nc" | "rise" | "out" | "pulse" | "timer" | "counter" | "reset";

type Part = {
  id: PartId;
  label: string;
  /** この部品が参照できるデバイス種別。先頭が既定 */
  types: DeviceType[];
  build: (device: DeviceId, presetMs: number, count: number) => Element;
};

const PARTS: Part[] = [
  { id: "wire", label: "横線", types: [], build: () => ({ type: "wire" }) },
  {
    id: "no",
    label: "a接点",
    types: ["X", "Y", "M", "T", "C"],
    build: (device) => ({ type: "contact", kind: "no", device }),
  },
  {
    id: "nc",
    label: "b接点",
    types: ["X", "Y", "M", "T", "C"],
    build: (device) => ({ type: "contact", kind: "nc", device }),
  },
  {
    id: "rise",
    label: "立上り",
    types: ["X", "Y", "M", "T", "C"],
    build: (device) => ({ type: "contact", kind: "rise", device }),
  },
  {
    id: "out",
    label: "出力",
    types: ["Y", "M"],
    build: (device) => ({ type: "coil", kind: "out", device }),
  },
  {
    id: "pulse",
    label: "PLS",
    types: ["Y", "M"],
    build: (device) => ({ type: "coil", kind: "pulse", device }),
  },
  {
    id: "timer",
    label: "タイマ",
    types: ["T"],
    build: (device, presetMs) => ({ type: "coil", kind: "timer", device, presetMs }),
  },
  {
    id: "counter",
    label: "カウンタ",
    types: ["C"],
    build: (device, _presetMs, count) => ({ type: "coil", kind: "counter", device, preset: count }),
  },
  {
    id: "reset",
    label: "RST",
    types: ["C"],
    build: (device) => ({ type: "coil", kind: "reset", device }),
  },
];

export type LadderEditorProps = {
  circuit: Circuit;
  onChange: (circuit: Circuit) => void;
};

/**
 * ラダー図の編集(SPEC.md §3.1: 部品パレットからグリッドに置く。スマホのタップ中心、ドラッグ非依存)。
 * セルを選んでから部品をタップすると、選択中のデバイスで配置する。
 */
export function LadderEditor({ circuit, onChange }: LadderEditorProps) {
  const [selected, setSelected] = useState<{ row: number; col: number } | undefined>(undefined);
  const [deviceType, setDeviceType] = useState<DeviceType>("X");
  const [deviceNumber, setDeviceNumber] = useState(0);
  const [presetSec, setPresetSec] = useState(3);
  const [count, setCount] = useState(3);
  const [error, setError] = useState<string | undefined>(undefined);

  const device = `${deviceType}${deviceNumber}` as DeviceId;

  const place = (part: Part) => {
    if (!selected) {
      setError("先にセルを選んでください");
      return;
    }
    const type = part.types.includes(deviceType) ? deviceType : part.types[0];
    const target = (type ? `${type}${deviceNumber}` : device) as DeviceId;
    const element = part.build(
      target,
      Math.max(1, Math.round(presetSec * 1000)),
      Math.max(1, count),
    );
    if (!canPlace(circuit, selected.row, selected.col, element)) {
      setError(
        element.type === "coil"
          ? "コイルは一番右の列にだけ置けます"
          : "一番右の列にはコイルしか置けません",
      );
      return;
    }
    if (type && type !== deviceType) setDeviceType(type);
    setError(undefined);
    onChange(putElement(circuit, selected.row, selected.col, element));
  };

  const vlineOn = selected ? hasVline(circuit, selected.row, selected.col) : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <LadderView
          circuit={circuit}
          onTapCell={(row, col) => {
            setError(undefined);
            setSelected({ row, col });
          }}
          selected={selected}
        />
      </div>

      <p className="text-xs text-slate-500" data-testid="editor-hint">
        {selected
          ? `選択中: ${selected.row + 1} 行 ${selected.col + 1} 列`
          : "編集したいマスをタップしてください"}
      </p>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <section>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-500">デバイス</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(["X", "Y", "M", "T", "C"] as DeviceType[]).map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`device-type-${t}`}
                aria-pressed={deviceType === t}
                onClick={() => setDeviceType(t)}
                className={`min-h-11 w-11 font-mono text-sm font-medium ${
                  deviceType === t ? "bg-slate-700 text-white" : "bg-white text-slate-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Stepper
            label="番号"
            value={deviceNumber}
            min={0}
            max={999}
            onChange={setDeviceNumber}
            testId="device-number"
          />
          <span
            className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm"
            data-testid="current-device"
          >
            {device}
          </span>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-500">部品(タップで配置)</h3>
        <div className="flex flex-wrap gap-2">
          {PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              data-testid={`part-${part.id}`}
              onClick={() => place(part)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
            >
              {part.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="part-delete"
            onClick={() => {
              if (!selected) {
                setError("先にセルを選んでください");
                return;
              }
              setError(undefined);
              onChange(clearElement(circuit, selected.row, selected.col));
            }}
            className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-600"
          >
            消す
          </button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Stepper
          label="タイマ秒"
          value={presetSec}
          min={0.1}
          max={600}
          step={0.5}
          onChange={setPresetSec}
          testId="preset-sec"
        />
        <Stepper
          label="カウント"
          value={count}
          min={1}
          max={9999}
          onChange={setCount}
          testId="preset-count"
        />
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-semibold text-slate-500">配線とグリッド</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="toggle-vline"
            disabled={!selected || !canSetVline(circuit, selected.row, selected.col)}
            onClick={() => {
              if (!selected) return;
              onChange(setVline(circuit, selected.row, selected.col, !vlineOn));
            }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {vlineOn ? "縦線を外す" : "下へ縦線"}
          </button>
          <button
            type="button"
            data-testid="connect-row"
            disabled={!selected}
            onClick={() => selected && onChange(connectRow(circuit, selected.row))}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            この行をつなぐ
          </button>
          <button
            type="button"
            data-testid="add-row"
            onClick={() => onChange(addRow(circuit))}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
          >
            行を足す
          </button>
          <button
            type="button"
            data-testid="remove-row"
            disabled={!selected || circuit.rows <= 1}
            onClick={() => {
              if (!selected) return;
              onChange(removeRow(circuit, selected.row));
              setSelected(undefined);
            }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            この行を消す
          </button>
          <button
            type="button"
            data-testid="add-col"
            onClick={() => onChange(addColumn(circuit))}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
          >
            列を足す
          </button>
          <button
            type="button"
            data-testid="remove-col"
            disabled={circuit.cols <= 2}
            onClick={() => onChange(removeColumn(circuit))}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            列を消す
          </button>
        </div>
      </section>
    </div>
  );
}

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  testId: string;
};

function Stepper({ label, value, min, max, step = 1, onChange, testId }: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(1))));
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <button
        type="button"
        data-testid={`${testId}-dec`}
        onClick={() => onChange(clamp(value - step))}
        className="min-h-11 w-11 rounded-lg border border-slate-300 bg-white text-lg text-slate-700"
      >
        −
      </button>
      <span
        data-testid={testId}
        className="min-w-12 rounded-lg bg-slate-100 px-2 py-2 text-center font-mono text-sm"
      >
        {value}
      </span>
      <button
        type="button"
        data-testid={`${testId}-inc`}
        onClick={() => onChange(clamp(value + step))}
        className="min-h-11 w-11 rounded-lg border border-slate-300 bg-white text-lg text-slate-700"
      >
        ＋
      </button>
    </div>
  );
}

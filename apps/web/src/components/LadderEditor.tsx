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
  deviceNumber as deviceNumberOf,
  deviceType as deviceTypeOf,
  type Element,
  hasVline,
  putElement,
  removeColumn,
  removeRow,
  setVline,
} from "@ladder-dojo/core";
import { useEffect, useState } from "react";
import type { HistoryControls } from "../hooks/useHistory.js";
import { useNotation } from "../lib/notation-context.jsx";
import { DevicePicker } from "./DevicePicker.js";
import { LadderView } from "./LadderView.js";
import { Button, Card, Icon, Label, Notice } from "./ui.js";

/** パレットの部品。device が必要なものは選択中のデバイスを使う */
type PartId =
  | "wire"
  | "no"
  | "nc"
  | "rise"
  | "fall"
  | "out"
  | "set"
  | "pulse"
  | "timer"
  | "offdelay"
  | "counter"
  | "reset";

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
    id: "fall",
    label: "立下り",
    types: ["X", "Y", "M", "T", "C"],
    build: (device) => ({ type: "contact", kind: "fall", device }),
  },
  {
    id: "out",
    label: "出力",
    types: ["Y", "M"],
    build: (device) => ({ type: "coil", kind: "out", device }),
  },
  {
    id: "set",
    label: "SET",
    types: ["Y", "M"],
    build: (device) => ({ type: "coil", kind: "set", device }),
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
    id: "offdelay",
    label: "オフディレイ",
    types: ["T"],
    build: (device, presetMs) => ({ type: "coil", kind: "offdelay", device, presetMs }),
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
    // カウンタのほか、SET で保持した Y / M も戻せる(S-044)
    types: ["C", "Y", "M"],
    build: (device) => ({ type: "coil", kind: "reset", device }),
  },
];

export type LadderEditorProps = {
  circuit: Circuit;
  onChange: (circuit: Circuit) => void;
  /** 「元に戻す / やり直す」(S-038)。渡すとボタンと Ctrl+Z / Ctrl+Shift+Z が効く */
  history?: HistoryControls | undefined;
  /** 図の右上に置く追加の操作(共有など) */
  extra?: React.ReactNode;
  /** 問題のデバイスの説明。デバイスの候補に出す(S-050) */
  deviceLabels?: Record<string, string> | undefined;
};

/**
 * ラダー図の編集(SPEC.md §3.1: 部品パレットからグリッドに置く。スマホのタップ中心、ドラッグ非依存)。
 * セルを選んでから部品をタップすると、選択中のデバイスで配置する。
 */
export function LadderEditor({
  circuit,
  onChange,
  history,
  extra,
  deviceLabels,
}: LadderEditorProps) {
  const [selected, setSelected] = useState<{ row: number; col: number } | undefined>(undefined);

  // キーボードでも戻せる(PC で編集する人向け)。入力欄の中では効かせない
  useEffect(() => {
    if (!history) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        history.redo();
      } else if (key === "z") {
        e.preventDefault();
        history.undo();
      } else if (key === "y") {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);
  const [deviceType, setDeviceType] = useState<DeviceType>("X");
  const [deviceNumber, setDeviceNumber] = useState(0);
  const [presetSec, setPresetSec] = useState(3);
  const [count, setCount] = useState(3);
  const [error, setError] = useState<string | undefined>(undefined);

  const device = `${deviceType}${deviceNumber}` as DeviceId;
  const notation = useNotation();

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
      <Card className="overflow-x-auto p-2">
        <LadderView
          circuit={circuit}
          onTapCell={(row, col) => {
            setError(undefined);
            setSelected({ row, col });
          }}
          selected={selected}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <p
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-xs ${selected ? "font-semibold text-sky-700" : "text-slate-500"}`}
          data-testid="editor-hint"
        >
          {selected ? (
            <>
              <Icon name="target" className="h-3.5 w-3.5" />
              {`選択中: ${selected.row + 1} 行 ${selected.col + 1} 列`}
            </>
          ) : (
            "編集したいマスをタップしてください"
          )}
        </p>
        {history && (
          <div className="flex gap-1">
            <Button
              tone="secondary"
              size="sm"
              icon="undo"
              data-testid="editor-undo"
              disabled={!history.canUndo}
              title="元に戻す(Ctrl+Z)"
              onClick={history.undo}
            >
              元に戻す
            </Button>
            <Button
              tone="secondary"
              size="sm"
              icon="redo"
              data-testid="editor-redo"
              disabled={!history.canRedo}
              title="やり直す(Ctrl+Shift+Z)"
              onClick={history.redo}
            >
              やり直す
            </Button>
          </div>
        )}
        {extra}
      </div>
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      <Card padded className="flex flex-col gap-4">
        {/* 回路にあるデバイスをタップで選ぶ / 表記のままの名前を打つ(S-050) */}
        <DevicePicker
          circuit={circuit}
          value={device}
          deviceLabels={deviceLabels}
          onChange={(d) => {
            setDeviceType(deviceTypeOf(d));
            setDeviceNumber(deviceNumberOf(d));
          }}
        />

        <section className="flex flex-col gap-2">
          <Label>部品(タップで配置)</Label>
          <div className="flex flex-wrap gap-2">
            {PARTS.map((part) => (
              <button
                key={part.id}
                type="button"
                data-testid={`part-${part.id}`}
                onClick={() => place(part)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white pl-2 pr-3 text-sm font-medium text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100"
              >
                <PartGlyph
                  id={part.id}
                  risingMark={notation.risingMark}
                  fallingMark={notation.fallingMark}
                />
                {part.label}
              </button>
            ))}
            <Button
              tone="danger"
              icon="trash"
              data-testid="part-delete"
              onClick={() => {
                if (!selected) {
                  setError("先にセルを選んでください");
                  return;
                }
                setError(undefined);
                onChange(clearElement(circuit, selected.row, selected.col));
              }}
            >
              消す
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Label>設定値</Label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Label>配線とグリッド</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              tone="secondary"
              data-testid="toggle-vline"
              disabled={!selected || !canSetVline(circuit, selected.row, selected.col)}
              onClick={() => {
                if (!selected) return;
                onChange(setVline(circuit, selected.row, selected.col, !vlineOn));
              }}
            >
              {vlineOn ? "縦線を外す" : "下へ縦線"}
            </Button>
            <Button
              tone="secondary"
              data-testid="connect-row"
              disabled={!selected}
              onClick={() => selected && onChange(connectRow(circuit, selected.row))}
            >
              この行をつなぐ
            </Button>
            <Button
              tone="secondary"
              icon="plus"
              data-testid="add-row"
              onClick={() => onChange(addRow(circuit))}
            >
              行を足す
            </Button>
            <Button
              tone="secondary"
              data-testid="remove-row"
              disabled={!selected || circuit.rows <= 1}
              onClick={() => {
                if (!selected) return;
                onChange(removeRow(circuit, selected.row));
                setSelected(undefined);
              }}
            >
              この行を消す
            </Button>
            <Button
              tone="secondary"
              icon="plus"
              data-testid="add-col"
              onClick={() => onChange(addColumn(circuit))}
            >
              列を足す
            </Button>
            <Button
              tone="secondary"
              data-testid="remove-col"
              disabled={circuit.cols <= 2}
              onClick={() => onChange(removeColumn(circuit))}
            >
              列を消す
            </Button>
          </div>
        </section>
      </Card>
    </div>
  );
}

/** パレットのボタンに描く小さな記号。ラダー図と同じ形にして、置く前に何が置かれるか分かるように */
const GLYPH_MARKS: Partial<Record<PartId, string>> = {
  pulse: "P",
  set: "S",
  timer: "T",
  offdelay: "TOF",
  counter: "C",
  reset: "R",
};

function PartGlyph({
  id,
  risingMark,
  fallingMark,
}: {
  id: PartId;
  risingMark: string;
  fallingMark: string;
}) {
  const stroke = "currentColor";
  const w = 2;
  let body: React.ReactNode;
  switch (id) {
    case "wire":
      body = <line x1={2} y1={10} x2={30} y2={10} stroke={stroke} strokeWidth={w} />;
      break;
    case "no":
    case "nc":
    case "rise":
    case "fall":
      body = (
        <>
          <line x1={2} y1={10} x2={11} y2={10} stroke={stroke} strokeWidth={w} />
          <line x1={21} y1={10} x2={30} y2={10} stroke={stroke} strokeWidth={w} />
          <line
            x1={11}
            y1={3}
            x2={11}
            y2={17}
            stroke={stroke}
            strokeWidth={w}
            strokeLinecap="round"
          />
          <line
            x1={21}
            y1={3}
            x2={21}
            y2={17}
            stroke={stroke}
            strokeWidth={w}
            strokeLinecap="round"
          />
          {id === "nc" && (
            <line
              x1={9}
              y1={16}
              x2={23}
              y2={4}
              stroke={stroke}
              strokeWidth={w}
              strokeLinecap="round"
            />
          )}
          {(id === "rise" || id === "fall") && (
            <text x={16} y={13.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={stroke}>
              {id === "rise" ? risingMark : fallingMark}
            </text>
          )}
        </>
      );
      break;
    default: {
      const mark = GLYPH_MARKS[id] ?? "";
      body = (
        <>
          <line x1={2} y1={10} x2={9} y2={10} stroke={stroke} strokeWidth={w} />
          <line x1={23} y1={10} x2={30} y2={10} stroke={stroke} strokeWidth={w} />
          <path d="M 10 3 A 8 8 0 0 0 10 17" fill="none" stroke={stroke} strokeWidth={w} />
          <path d="M 22 3 A 8 8 0 0 1 22 17" fill="none" stroke={stroke} strokeWidth={w} />
          {mark && (
            <text
              x={16}
              y={mark.length > 1 ? 12.5 : 13.5}
              textAnchor="middle"
              fontSize={mark.length > 1 ? 6.5 : 9}
              fontWeight={700}
              fill={stroke}
            >
              {mark}
            </text>
          )}
        </>
      );
    }
  }
  return (
    <svg viewBox="0 0 32 20" className="h-5 w-8 shrink-0" aria-hidden="true">
      {body}
    </svg>
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
  const btn =
    "flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white">
        <button
          type="button"
          data-testid={`${testId}-dec`}
          aria-label={`${label}を減らす`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          className={btn}
        >
          <span aria-hidden="true" className="text-base leading-none">
            −
          </span>
        </button>
        <span
          data-testid={testId}
          className="flex min-w-12 items-center justify-center border-x border-slate-200 bg-slate-50 px-2 font-mono text-sm tabular-nums"
        >
          {value}
        </span>
        <button
          type="button"
          data-testid={`${testId}-inc`}
          aria-label={`${label}を増やす`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          className={btn}
        >
          <span aria-hidden="true" className="text-base leading-none">
            ＋
          </span>
        </button>
      </div>
    </div>
  );
}

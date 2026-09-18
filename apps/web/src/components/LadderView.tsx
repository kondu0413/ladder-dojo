import type { Cell, Circuit, CoilElement, ContactElement, PowerMap } from "@ladder-dojo/core";
import { cellKey, cellMap, describeCircuit } from "@ladder-dojo/core";
import { useMemo } from "react";
import type { InputControl } from "../hooks/useSimulator.js";
import {
  CELL_H,
  CELL_W,
  cellOrigin,
  nodeX,
  RAIL_PAD,
  svgHeight,
  svgWidth,
  wireY,
} from "../lib/geometry.js";
import { type NotationContextValue, useNotation } from "../lib/notation-context.jsx";

export type LadderViewProps = {
  circuit: Circuit;
  power?: PowerMap | undefined;
  /** デバイス名の説明(例: X0 →「起動ボタン」) */
  deviceLabels?: Record<string, string> | undefined;
  /** 入力の操作。指定すると X 接点が押せるようになる(押している間だけ ON、S-027) */
  input?: InputControl | undefined;
  /** セルをタップしたとき(編集モード) */
  onTapCell?: ((row: number, col: number) => void) | undefined;
  /** 編集モードで選択中のセル */
  selected?: { row: number; col: number } | undefined;
  /** 見てほしいセル(つまずき診断)。選択とは別の色で囲む */
  highlight?: ReadonlyArray<{ row: number; col: number }> | undefined;
};

/**
 * 電流が流れている色 / 通電しているだけの色 / 無電圧の色 / 母線。
 * 値は index.css にあり、ダークモードで変わる(S-043)。SVG の属性は Tailwind の
 * クラスを受け取れないので、style で変数を渡す
 */
const FLOW = "var(--ladder-flow)";
const LIVE = "var(--ladder-live)";
const DEAD = "var(--ladder-dead)";
const RAIL = "var(--ladder-rail)";

/**
 * ラダー図の SVG 描画(DECISIONS.md D-004)。
 *
 * 色分けは現場のモニタ表示に合わせる:
 * - 電流が流れている要素は濃い橙(太線)
 * - 電圧は来ているが、その要素を電流が流れていない配線は薄い橙
 * - 無電圧は灰色
 * 並列枝のせいで右側だけ通電している開いた接点は、薄い橙のリードと灰色の接点になる。
 */
export function LadderView({
  circuit,
  power,
  deviceLabels,
  input,
  onTapCell,
  selected,
  highlight,
}: LadderViewProps) {
  const { notation } = useNotation();
  const cells = useMemo(() => cellMap(circuit), [circuit]);
  /**
   * 読み上げ用の文章(改善候補 14 / S-018)。
   *
   * SVG は線と丸の集まりなので、`aria-label="ラダー図"` だけだと
   * **目で見ない人には回路の中身が何も伝わらない**。core で組み立てた
   * 行ごとの説明をここに載せる。動かしているときは通電状態も入る。
   */
  const description = useMemo(
    () => describeCircuit(circuit, { deviceLabels, power, notation }),
    [circuit, deviceLabels, power, notation],
  );
  const highlighted = useMemo(
    () => new Set((highlight ?? []).map((c) => cellKey(c.row, c.col))),
    [highlight],
  );
  const width = svgWidth(circuit);
  const height = svgHeight(circuit);
  const leftX = RAIL_PAD;
  const rightX = RAIL_PAD + circuit.cols * CELL_W;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="touch-manipulation select-none"
      // 画面幅に合わせて縮めるが、1 列 62px を下回ると読めなくなるのでそこからは横スクロールにする
      style={{ width: "100%", height: "auto", minWidth: circuit.cols * 62 }}
      role="img"
      aria-label={description}
    >
      <title>{description}</title>
      <line
        x1={leftX}
        y1={6}
        x2={leftX}
        y2={height - 6}
        style={{ stroke: RAIL }}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1={rightX}
        y1={6}
        x2={rightX}
        y2={height - 6}
        style={{ stroke: RAIL }}
        strokeWidth={5}
        strokeLinecap="round"
      />

      {Array.from({ length: circuit.rows }, (_, row) =>
        Array.from({ length: circuit.cols }, (_, col) => (
          <CellView
            key={cellKey(row, col)}
            row={row}
            col={col}
            cell={cells.get(cellKey(row, col))}
            flowing={power?.cells[row]?.[col] ?? false}
            leftOn={power?.nodes[row]?.[col] ?? false}
            rightOn={power?.nodes[row]?.[col + 1] ?? false}
            deviceLabels={deviceLabels}
            input={input}
            onTapCell={onTapCell}
            isSelected={selected?.row === row && selected?.col === col}
            isHighlighted={highlighted.has(cellKey(row, col))}
          />
        )),
      )}
    </svg>
  );
}

type CellViewProps = {
  row: number;
  col: number;
  cell: Cell | undefined;
  flowing: boolean;
  leftOn: boolean;
  rightOn: boolean;
  deviceLabels: Record<string, string> | undefined;
  input: InputControl | undefined;
  onTapCell: ((row: number, col: number) => void) | undefined;
  isSelected: boolean;
  isHighlighted: boolean;
};

/**
 * リード線(要素の左右に伸びる横線)の描き方。
 *
 * **色だけに頼らない**(改善候補 14 / S-018)。ここは元々、
 * 「電圧は来ているが流れていない」薄い橙と「無電圧」の灰色が、
 * 同じ太さの実線で色だけ違っていた。色の見分けがつかないと区別できない。
 *
 * - 電流が流れている: 太い実線
 * - 電圧は来ているが、この要素を流れていない: **破線**
 * - 無電圧: 細い実線
 */
function leadProps(on: boolean, flowing: boolean) {
  if (flowing)
    return { style: { stroke: FLOW }, strokeWidth: 3.5, strokeLinecap: "round" as const };
  if (on) return { style: { stroke: LIVE }, strokeWidth: 2, strokeDasharray: "5 3" };
  return { style: { stroke: DEAD }, strokeWidth: 2 };
}

/**
 * リード線。電流が流れているときは、上に明るい破線を重ねて左から右へ動かす(S-040)。
 * 元の実線を先に描く(読み上げ・テストは最初の線を見る)。縦線は流れる向きが
 * 枝ごとに違うので動かさない。
 */
function Lead({
  x1,
  x2,
  y,
  on,
  flowing,
}: {
  x1: number;
  x2: number;
  y: number;
  on: boolean;
  flowing: boolean;
}) {
  return (
    <>
      <line x1={x1} y1={y} x2={x2} y2={y} {...leadProps(on, flowing)} />
      {flowing && (
        <line
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          className="flow-dash"
          style={{ stroke: "var(--ladder-flow-dash)" }}
          strokeOpacity={0.9}
          strokeWidth={1.5}
          strokeDasharray="4 10"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function CellView({
  row,
  col,
  cell,
  flowing,
  leftOn,
  rightOn,
  deviceLabels,
  input,
  onTapCell,
  isSelected,
  isHighlighted,
}: CellViewProps) {
  const notation = useNotation();
  const { x, y } = cellOrigin(row, col);
  const y0 = wireY(row);
  const el = cell?.element;
  const cellText = !el || el.type === "wire" ? "" : cellLabel(el, notation);
  const label = el && "device" in el ? deviceLabels?.[el.device] : undefined;
  const isInput = el?.type === "contact" && el.device.startsWith("X");
  const pressable = isInput && input && el?.type === "contact";
  const tappable = Boolean(pressable || onTapCell);

  // 接点は押しボタンとして扱う。押している間だけ ON(S-027)
  const handleDown = () => {
    if (pressable && el?.type === "contact") input.press(el.device);
    else if (onTapCell) onTapCell(row, col);
  };
  const handleUp = () => {
    if (pressable && el?.type === "contact") input.release(el.device);
  };

  return (
    <g
      data-testid={`cell-${row}-${col}`}
      data-flowing={flowing}
      data-highlighted={isHighlighted || undefined}
    >
      {/* 編集中は空のマスにも薄い枠を出す。何も無い白い面では、どこを押せばよいか分からない */}
      {onTapCell && !el && !isSelected && !isHighlighted && (
        <rect
          x={x + 4}
          y={y + 4}
          width={CELL_W - 8}
          height={CELL_H - 8}
          rx={8}
          fill="none"
          style={{ stroke: "var(--ladder-empty)" }}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      )}
      {isHighlighted && (
        <rect
          x={x + 1}
          y={y + 1}
          width={CELL_W - 2}
          height={CELL_H - 2}
          rx={8}
          style={{ fill: "var(--ladder-highlight-fill)", stroke: "var(--ladder-highlight-stroke)" }}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
      {isSelected && (
        <rect
          x={x + 2}
          y={y + 2}
          width={CELL_W - 4}
          height={CELL_H - 4}
          rx={8}
          style={{ fill: "var(--ladder-select-fill)", stroke: "var(--ladder-select-stroke)" }}
          strokeWidth={2}
        />
      )}

      {el?.type === "wire" && <Lead x1={x} x2={x + CELL_W} y={y0} on={leftOn} flowing={flowing} />}
      {el?.type === "contact" && (
        <Contact
          x={x}
          y={y0}
          el={el}
          flowing={flowing}
          leftOn={leftOn}
          rightOn={rightOn}
          risingMark={notation.risingMark}
          fallingMark={notation.fallingMark}
        />
      )}
      {el?.type === "coil" && <Coil x={x} y={y0} el={el} flowing={flowing} leftOn={leftOn} />}

      {cell?.vline && (
        <line
          x1={nodeX(col + 1)}
          y1={y0}
          x2={nodeX(col + 1)}
          y2={wireY(row + 1)}
          style={{ stroke: rightOn ? FLOW : DEAD }}
          strokeWidth={rightOn ? 3.5 : 2}
          strokeLinecap="round"
        />
      )}

      {el && el.type !== "wire" && (
        <text
          x={x + CELL_W / 2}
          y={y + 16}
          textAnchor="middle"
          data-testid={`cell-text-${row}-${col}`}
          className={`fill-slate-800 font-mono font-semibold ${
            cellText.length > 8 ? "text-[10px]" : "text-[13px]"
          }`}
        >
          {cellText}
        </text>
      )}
      {label && (
        <text
          x={x + CELL_W / 2}
          y={y + CELL_H - 6}
          textAnchor="middle"
          className="fill-slate-400 text-[10px]"
        >
          {label}
        </text>
      )}

      {tappable && (
        <rect
          x={x}
          y={y}
          width={CELL_W}
          height={CELL_H}
          rx={8}
          className="cursor-pointer fill-transparent transition-[fill] hover:fill-slate-900/[0.05] active:fill-slate-900/10"
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
        >
          <title>
            {el && "device" in el
              ? `${notation.device(el.device)}${label ? `(${label})` : ""}`
              : `${row},${col}`}
          </title>
        </rect>
      )}
    </g>
  );
}

/**
 * セルの上に出す文字。「C0 K5」「C0000 #0005」のように、表記で長さが変わる(S-028)。
 * 長くなった分はセル幅に収める側(呼び出し元)で小さくする
 */
function cellLabel(el: ContactElement | CoilElement, notation: NotationContextValue): string {
  const name = notation.device(el.device);
  if (el.type !== "coil") return name;
  if (el.kind === "timer" || el.kind === "offdelay") {
    return `${name} ${notation.timerPreset(el.presetMs)}`;
  }
  if (el.kind === "counter") return `${name} ${notation.counterPreset(el.preset)}`;
  return name;
}

/** 接点: 縦棒 2 本。b 接点は斜線、立ち上がり / 立ち下がりは中に記号(↑↓ / P N、S-028) */
function Contact({
  x,
  y,
  el,
  flowing,
  leftOn,
  rightOn,
  risingMark,
  fallingMark,
}: {
  x: number;
  y: number;
  el: ContactElement;
  flowing: boolean;
  leftOn: boolean;
  rightOn: boolean;
  risingMark: string;
  fallingMark: string;
}) {
  const gap = 12;
  const half = CELL_W / 2;
  const barTop = y - 13;
  const barBottom = y + 13;
  const body = flowing ? FLOW : DEAD;
  const w = flowing ? 3.5 : 2;

  return (
    <g>
      <Lead x1={x} x2={x + half - gap} y={y} on={leftOn} flowing={flowing} />
      <Lead x1={x + half + gap} x2={x + CELL_W} y={y} on={rightOn} flowing={flowing} />
      <line
        x1={x + half - gap}
        y1={barTop}
        x2={x + half - gap}
        y2={barBottom}
        style={{ stroke: body }}
        strokeWidth={w}
        strokeLinecap="round"
      />
      <line
        x1={x + half + gap}
        y1={barTop}
        x2={x + half + gap}
        y2={barBottom}
        style={{ stroke: body }}
        strokeWidth={w}
        strokeLinecap="round"
      />
      {el.kind === "nc" && (
        <line
          x1={x + half - gap - 3}
          y1={barBottom - 2}
          x2={x + half + gap + 3}
          y2={barTop + 2}
          style={{ stroke: body }}
          strokeWidth={w}
          strokeLinecap="round"
        />
      )}
      {(el.kind === "rise" || el.kind === "fall") && (
        <text
          x={x + half}
          y={y + 5}
          textAnchor="middle"
          className="fill-slate-700 text-[12px] font-bold"
        >
          {el.kind === "rise" ? risingMark : fallingMark}
        </text>
      )}
    </g>
  );
}

/** コイルの中に描く記号。out は何も書かない */
const COIL_MARKS: Record<CoilElement["kind"], string> = {
  out: "",
  pulse: "P",
  set: "S",
  timer: "T",
  offdelay: "TOF",
  counter: "C",
  reset: "R",
};

/** コイル: 開いた括弧。種別を中に記号で示す(P / S / T / TOF / C / R) */
function Coil({
  x,
  y,
  el,
  flowing,
  leftOn,
}: {
  x: number;
  y: number;
  el: CoilElement;
  flowing: boolean;
  leftOn: boolean;
}) {
  const half = CELL_W / 2;
  const gap = 13;
  const color = flowing ? FLOW : DEAD;
  const w = flowing ? 3.5 : 2;
  const mark = COIL_MARKS[el.kind];
  return (
    <g>
      <Lead x1={x} x2={x + half - gap} y={y} on={leftOn} flowing={flowing} />
      <Lead x1={x + half + gap} x2={x + CELL_W} y={y} on={flowing} flowing={flowing} />
      <path
        d={`M ${x + half - gap} ${y - 13} A 15 15 0 0 0 ${x + half - gap} ${y + 13}`}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={w}
        strokeLinecap="round"
      />
      <path
        d={`M ${x + half + gap} ${y - 13} A 15 15 0 0 1 ${x + half + gap} ${y + 13}`}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={w}
        strokeLinecap="round"
      />
      {mark && (
        <text
          x={x + half}
          y={mark.length > 1 ? y + 3.5 : y + 5}
          textAnchor="middle"
          className={`fill-slate-700 font-bold ${mark.length > 1 ? "text-[8px]" : "text-[12px]"}`}
        >
          {mark}
        </text>
      )}
    </g>
  );
}

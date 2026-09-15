import type {
  Cell,
  Circuit,
  CoilElement,
  ContactElement,
  DeviceId,
  PowerMap,
} from "@ladder-dojo/core";
import { cellKey, cellMap } from "@ladder-dojo/core";
import { useMemo } from "react";
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

export type LadderViewProps = {
  circuit: Circuit;
  power?: PowerMap | undefined;
  /** デバイス名の説明(例: X0 →「起動ボタン」) */
  deviceLabels?: Record<string, string> | undefined;
  /** 入力接点をタップしたとき。指定すると X 接点が押せるようになる */
  onTapInput?: ((device: DeviceId) => void) | undefined;
  /** セルをタップしたとき(編集モード) */
  onTapCell?: ((row: number, col: number) => void) | undefined;
  /** 編集モードで選択中のセル */
  selected?: { row: number; col: number } | undefined;
  /** 見てほしいセル(つまずき診断)。選択とは別の色で囲む */
  highlight?: ReadonlyArray<{ row: number; col: number }> | undefined;
};

/** 電流が流れている色 / 通電しているだけの色 / 無電圧の色 */
const FLOW = "#f59e0b";
const LIVE = "#fcd34d";
const DEAD = "#94a3b8";
const RAIL = "#475569";

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
  onTapInput,
  onTapCell,
  selected,
  highlight,
}: LadderViewProps) {
  const cells = useMemo(() => cellMap(circuit), [circuit]);
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
      aria-label="ラダー図"
    >
      <title>ラダー図</title>
      <line x1={leftX} y1={4} x2={leftX} y2={height - 4} stroke={RAIL} strokeWidth={4} />
      <line x1={rightX} y1={4} x2={rightX} y2={height - 4} stroke={RAIL} strokeWidth={4} />

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
            onTapInput={onTapInput}
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
  onTapInput: ((device: DeviceId) => void) | undefined;
  onTapCell: ((row: number, col: number) => void) | undefined;
  isSelected: boolean;
  isHighlighted: boolean;
};

function leadColor(on: boolean): string {
  return on ? LIVE : DEAD;
}

function CellView({
  row,
  col,
  cell,
  flowing,
  leftOn,
  rightOn,
  deviceLabels,
  onTapInput,
  onTapCell,
  isSelected,
  isHighlighted,
}: CellViewProps) {
  const { x, y } = cellOrigin(row, col);
  const y0 = wireY(row);
  const el = cell?.element;
  const label = el && "device" in el ? deviceLabels?.[el.device] : undefined;
  const isInput = el?.type === "contact" && el.device.startsWith("X");
  const tappable = Boolean((isInput && onTapInput) || onTapCell);

  const handleTap = () => {
    if (isInput && onTapInput && el?.type === "contact") onTapInput(el.device);
    else if (onTapCell) onTapCell(row, col);
  };

  return (
    <g
      data-testid={`cell-${row}-${col}`}
      data-flowing={flowing}
      data-highlighted={isHighlighted || undefined}
    >
      {isHighlighted && (
        <rect
          x={x + 1}
          y={y + 1}
          width={CELL_W - 2}
          height={CELL_H - 2}
          rx={6}
          fill="#fef3c7"
          stroke="#d97706"
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
          rx={6}
          fill="#dbeafe"
          stroke="#2563eb"
          strokeWidth={2}
        />
      )}

      {el?.type === "wire" && (
        <line
          x1={x}
          y1={y0}
          x2={x + CELL_W}
          y2={y0}
          stroke={flowing ? FLOW : leadColor(leftOn)}
          strokeWidth={flowing ? 3.5 : 2}
        />
      )}
      {el?.type === "contact" && (
        <Contact x={x} y={y0} el={el} flowing={flowing} leftOn={leftOn} rightOn={rightOn} />
      )}
      {el?.type === "coil" && <Coil x={x} y={y0} el={el} flowing={flowing} leftOn={leftOn} />}

      {cell?.vline && (
        <line
          x1={nodeX(col + 1)}
          y1={y0}
          x2={nodeX(col + 1)}
          y2={wireY(row + 1)}
          stroke={rightOn ? FLOW : DEAD}
          strokeWidth={rightOn ? 3 : 2}
        />
      )}

      {el && el.type !== "wire" && (
        <text
          x={x + CELL_W / 2}
          y={y + 16}
          textAnchor="middle"
          data-testid={`cell-text-${row}-${col}`}
          className="fill-slate-700 text-[13px] font-medium"
        >
          {el.device}
          {el.type === "coil" && el.kind === "timer" ? ` ${(el.presetMs / 1000).toFixed(1)}s` : ""}
          {el.type === "coil" && el.kind === "counter" ? ` ×${el.preset}` : ""}
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
          fill="transparent"
          className="cursor-pointer"
          onPointerDown={handleTap}
        >
          <title>
            {el && "device" in el ? `${el.device}${label ? `(${label})` : ""}` : `${row},${col}`}
          </title>
        </rect>
      )}
    </g>
  );
}

/** 接点: 縦棒 2 本。b 接点は斜線、立ち上がりは上向きの山を添える */
function Contact({
  x,
  y,
  el,
  flowing,
  leftOn,
  rightOn,
}: {
  x: number;
  y: number;
  el: ContactElement;
  flowing: boolean;
  leftOn: boolean;
  rightOn: boolean;
}) {
  const gap = 12;
  const half = CELL_W / 2;
  const barTop = y - 13;
  const barBottom = y + 13;
  const body = flowing ? FLOW : DEAD;
  const w = flowing ? 3.5 : 2;

  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x + half - gap}
        y2={y}
        stroke={flowing ? FLOW : leadColor(leftOn)}
        strokeWidth={w}
      />
      <line
        x1={x + half + gap}
        y1={y}
        x2={x + CELL_W}
        y2={y}
        stroke={flowing ? FLOW : leadColor(rightOn)}
        strokeWidth={w}
      />
      <line
        x1={x + half - gap}
        y1={barTop}
        x2={x + half - gap}
        y2={barBottom}
        stroke={body}
        strokeWidth={w}
      />
      <line
        x1={x + half + gap}
        y1={barTop}
        x2={x + half + gap}
        y2={barBottom}
        stroke={body}
        strokeWidth={w}
      />
      {el.kind === "nc" && (
        <line
          x1={x + half - gap - 3}
          y1={barBottom - 2}
          x2={x + half + gap + 3}
          y2={barTop + 2}
          stroke={body}
          strokeWidth={w}
        />
      )}
      {el.kind === "rise" && (
        <path
          d={`M ${x + half - 6} ${y + 7} L ${x + half} ${y - 3} L ${x + half + 6} ${y + 7}`}
          fill="none"
          stroke={body}
          strokeWidth={w}
        />
      )}
    </g>
  );
}

/** コイル: 開いた括弧。種別を中に 1 文字で示す(P / T / C / R) */
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
  const mark =
    el.kind === "pulse"
      ? "P"
      : el.kind === "timer"
        ? "T"
        : el.kind === "counter"
          ? "C"
          : el.kind === "reset"
            ? "R"
            : "";
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x + half - gap}
        y2={y}
        stroke={flowing ? FLOW : leadColor(leftOn)}
        strokeWidth={w}
      />
      <line x1={x + half + gap} y1={y} x2={x + CELL_W} y2={y} stroke={color} strokeWidth={w} />
      <path
        d={`M ${x + half - gap} ${y - 13} A 15 15 0 0 0 ${x + half - gap} ${y + 13}`}
        fill="none"
        stroke={color}
        strokeWidth={w}
      />
      <path
        d={`M ${x + half + gap} ${y - 13} A 15 15 0 0 1 ${x + half + gap} ${y + 13}`}
        fill="none"
        stroke={color}
        strokeWidth={w}
      />
      {mark && (
        <text
          x={x + half}
          y={y + 5}
          textAnchor="middle"
          className="fill-slate-600 text-[12px] font-bold"
        >
          {mark}
        </text>
      )}
    </g>
  );
}

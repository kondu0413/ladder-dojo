import {
  type Cell,
  type Circuit,
  cellKey,
  circuitSchema,
  type Element,
  MAX_COLS,
  MAX_ROWS,
} from "./schema/circuit.js";

/**
 * 回路の編集操作(純粋関数)。すべて新しい Circuit を返し、元は変更しない。
 * 返す回路は常に zod スキーマを満たす(コイルは最右列だけ、縦線は最終行・最右列に置けない等)。
 */

/** その位置にその要素を置けるか。UI はボタンの活性・非活性の判定に使う */
export function canPlace(circuit: Circuit, row: number, col: number, element: Element): boolean {
  if (!inRange(circuit, row, col)) return false;
  if (element.type === "coil") return col === circuit.cols - 1;
  // 最右列は右母線に直結するため、コイル以外は置けない
  return col !== circuit.cols - 1;
}

export function putElement(circuit: Circuit, row: number, col: number, element: Element): Circuit {
  if (!canPlace(circuit, row, col, element)) {
    throw new Error(`(${row}, ${col}) にこの要素は置けません`);
  }
  return rebuild(circuit, (map) => {
    map.set(cellKey(row, col), { ...cellAt(map, row, col), element });
  });
}

/** 要素だけを消す(縦線は残す) */
export function clearElement(circuit: Circuit, row: number, col: number): Circuit {
  if (!inRange(circuit, row, col)) return circuit;
  return rebuild(circuit, (map) => {
    const cur = cellAt(map, row, col);
    map.set(cellKey(row, col), {
      row: cur.row,
      col: cur.col,
      ...(cur.vline ? { vline: true } : {}),
    });
  });
}

/** 縦線を置けるか(最終行と最右列には置けない) */
export function canSetVline(circuit: Circuit, row: number, col: number): boolean {
  return inRange(circuit, row, col) && row < circuit.rows - 1 && col < circuit.cols - 1;
}

export function setVline(circuit: Circuit, row: number, col: number, on: boolean): Circuit {
  if (!canSetVline(circuit, row, col)) return circuit;
  return rebuild(circuit, (map) => {
    const cur = cellAt(map, row, col);
    if (on) map.set(cellKey(row, col), { ...cur, vline: true });
    else
      map.set(cellKey(row, col), {
        row: cur.row,
        col: cur.col,
        ...(cur.element ? { element: cur.element } : {}),
      });
  });
}

export function hasVline(circuit: Circuit, row: number, col: number): boolean {
  return circuit.cells.some((c) => c.row === row && c.col === col && c.vline === true);
}

/**
 * 行の空セルを横線で埋めて、左母線から右端の要素までを 1 本につなぐ。
 * スマホで横線を 1 マスずつタップするのは手間なので、UI の「つなぐ」操作に使う。
 * 右端の要素より右は埋めない(コイルがあればコイルの手前まで)。
 */
export function connectRow(circuit: Circuit, row: number): Circuit {
  if (!inRange(circuit, row, 0)) return circuit;
  const inRow = circuit.cells.filter((c) => c.row === row && c.element !== undefined);
  if (inRow.length === 0) return circuit;
  const hasCoil = inRow.some((c) => c.col === circuit.cols - 1);
  const rightmost = hasCoil ? circuit.cols - 2 : Math.max(...inRow.map((c) => c.col));
  if (rightmost < 0) return circuit;

  return rebuild(circuit, (map) => {
    for (let col = 0; col <= rightmost; col++) {
      const cur = cellAt(map, row, col);
      if (cur.element === undefined)
        map.set(cellKey(row, col), { ...cur, element: { type: "wire" } });
    }
  });
}

/** 末尾に行を足す */
export function addRow(circuit: Circuit): Circuit {
  if (circuit.rows >= MAX_ROWS) return circuit;
  return circuitSchema.parse({ ...circuit, rows: circuit.rows + 1 });
}

/** 行を消す。1 行は必ず残す。下の行は 1 つ上にずれる */
export function removeRow(circuit: Circuit, row: number): Circuit {
  if (circuit.rows <= 1 || !inRange(circuit, row, 0)) return circuit;
  const rows = circuit.rows - 1;
  const cells = circuit.cells
    .filter((c) => c.row !== row)
    .map((c) => (c.row > row ? { ...c, row: c.row - 1 } : c))
    // 消した結果、最終行に来た縦線は置けなくなるので落とす
    .map((c) => (c.vline && c.row === rows - 1 ? stripVline(c) : c));
  return circuitSchema.parse({ ...circuit, rows, cells: prune(cells) });
}

/** 右に列を足す。最右列にあったコイルは新しい最右列へ移し、空いた位置は横線でつなぐ */
export function addColumn(circuit: Circuit): Circuit {
  if (circuit.cols >= MAX_COLS) return circuit;
  const oldLast = circuit.cols - 1;
  const cells: Cell[] = [];
  for (const cell of circuit.cells) {
    if (cell.col === oldLast && cell.element?.type === "coil") {
      cells.push({ row: cell.row, col: oldLast, element: { type: "wire" } });
      cells.push({ row: cell.row, col: oldLast + 1, element: cell.element });
    } else {
      cells.push(cell);
    }
  }
  return circuitSchema.parse({ ...circuit, cols: circuit.cols + 1, cells: prune(cells) });
}

/**
 * 右端の列を消す。コイルは新しい最右列へ移し、そこにあった要素は捨てる。
 * 新しい最右列に残る接点・横線も捨てる(最右列はコイル専用、canPlace と同じ規則。S-053)
 */
export function removeColumn(circuit: Circuit): Circuit {
  if (circuit.cols <= 2) return circuit;
  const cols = circuit.cols - 1;
  const coilsByRow = new Map<number, Element>();
  for (const cell of circuit.cells) {
    if (cell.col === circuit.cols - 1 && cell.element?.type === "coil") {
      coilsByRow.set(cell.row, cell.element);
    }
  }
  const cells: Cell[] = [];
  for (const cell of circuit.cells) {
    if (cell.col >= cols) continue; // 消す列
    if (cell.col === cols - 1) {
      if (coilsByRow.has(cell.row)) continue; // コイルで上書きする
      // コイル列に残せるのはコイルだけ。接点・横線は捨て、縦線も最右列には置けない
      if (cell.element && cell.element.type !== "coil") continue;
      cells.push(stripVline(cell));
      continue;
    }
    cells.push(cell);
  }
  for (const [row, element] of coilsByRow) cells.push({ row, col: cols - 1, element });
  return circuitSchema.parse({ ...circuit, cols, cells: prune(cells) });
}

// ---------------------------------------------------------------------------

function inRange(circuit: Circuit, row: number, col: number): boolean {
  return row >= 0 && row < circuit.rows && col >= 0 && col < circuit.cols;
}

function cellAt(map: Map<string, Cell>, row: number, col: number): Cell {
  return map.get(cellKey(row, col)) ?? { row, col };
}

function stripVline(cell: Cell): Cell {
  return { row: cell.row, col: cell.col, ...(cell.element ? { element: cell.element } : {}) };
}

/** 中身が空のセルを落とす(JSON を小さく保つ) */
function prune(cells: Cell[]): Cell[] {
  return cells
    .filter((c) => c.element !== undefined || c.vline === true)
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

function rebuild(circuit: Circuit, mutate: (map: Map<string, Cell>) => void): Circuit {
  const map = new Map<string, Cell>();
  for (const c of circuit.cells) map.set(cellKey(c.row, c.col), c);
  mutate(map);
  return circuitSchema.parse({ ...circuit, cells: prune([...map.values()]) });
}

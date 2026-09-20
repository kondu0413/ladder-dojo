/**
 * 「元に戻す / やり直す」の履歴(S-038)。
 *
 * 回路の編集は 1 手ごとに新しい Circuit を返す純粋な操作なので、
 * 過去の値をそのまま積んでおけば戻れる。React に依存しない形にして、
 * 上限・空の履歴・同じ値の押し直しをここで固める。
 */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

/** 積んでおく手数の上限。回路は小さい JSON なので 100 手でも数百 KB に収まる */
export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * 新しい値を積む。同じ値なら履歴は増やさない(参照が同じか、中身が同じ)。やり直しの枝は捨てる。
 * 空のマスを消す・つながっている行をつなぐ、のような何も変えない操作は新しいオブジェクトを
 * 返すので、中身で比べないと「元に戻す」を 1 回消費して何も起きない(S-053)
 */
export function push<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history;
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
  };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

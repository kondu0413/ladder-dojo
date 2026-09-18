import { useCallback, useState } from "react";
import {
  canRedo,
  canUndo,
  createHistory,
  type History,
  push,
  redo as redoHistory,
  undo as undoHistory,
} from "../lib/history.js";

export type HistoryControls = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

/**
 * 「元に戻す / やり直す」の付いた state(S-038)。
 *
 * `set` は useState と同じ形で使える。`reset` は履歴ごと作り直す
 * (「最初から」「新規」「開く」のように、戻る先が意味を失うとき)。
 */
export function useHistory<T>(initial: T): {
  value: T;
  set: (next: T | ((prev: T) => T)) => void;
  reset: (value: T) => void;
} & HistoryControls {
  const [history, setHistory] = useState<History<T>>(() => createHistory(initial));

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setHistory((cur) =>
      push(cur, typeof next === "function" ? (next as (prev: T) => T)(cur.present) : next),
    );
  }, []);
  const undo = useCallback(() => setHistory((cur) => undoHistory(cur)), []);
  const redo = useCallback(() => setHistory((cur) => redoHistory(cur)), []);
  const reset = useCallback((value: T) => setHistory(createHistory(value)), []);

  return {
    value: history.present,
    set,
    reset,
    undo,
    redo,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}

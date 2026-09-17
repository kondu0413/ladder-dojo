import type { DeviceId } from "@ladder-dojo/core";
import {
  DEFAULT_NOTATION,
  formatCounterPreset,
  formatDevice,
  formatDeviceNames,
  formatTimerPreset,
  NOTATIONS,
  type Notation,
  risingMark,
} from "@ladder-dojo/core";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "ladder-dojo:notation";

/**
 * 表記の切り替え(S-028)。
 *
 * **回路データは変えない。画面に出すときだけ書き方を変える。**
 * 端末ごとの好みなので localStorage に持つ。ログインは要らないし、
 * サーバーに送る意味もない(D1 の書き込みを使わない)
 */
export type NotationContextValue = {
  notation: Notation;
  setNotation: (notation: Notation) => void;
  /** デバイス名 1 つ */
  device: (id: DeviceId | string) => string;
  /** 文章の中のデバイス名 */
  text: (text: string) => string;
  timerPreset: (presetMs: number) => string;
  counterPreset: (preset: number) => string;
  risingMark: string;
};

const NotationContext = createContext<NotationContextValue | undefined>(undefined);

/** 名前を付け替える前に保存された値(S-028 の初版) */
const LEGACY_IDS: Record<string, Notation> = { standard: "mitsubishi", cio: "omron" };

function load(): Notation {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (NOTATIONS as readonly string[]).includes(saved)) return saved as Notation;
    // 前の名前で保存されていたら引き継ぐ。選び直させない
    if (saved && LEGACY_IDS[saved]) return LEGACY_IDS[saved];
  } catch {
    // プライベートモードなどで読めないことがある。既定に落とす
  }
  return DEFAULT_NOTATION;
}

export function NotationProvider({ children }: { children: ReactNode }) {
  const [notation, setState] = useState<Notation>(load);

  const setNotation = useCallback((next: Notation) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても、その場の切り替えは効かせる
    }
  }, []);

  const value = useMemo<NotationContextValue>(
    () => ({
      notation,
      setNotation,
      device: (id) => formatDevice(id as DeviceId, notation),
      text: (text) => formatDeviceNames(text, notation),
      timerPreset: (presetMs) => formatTimerPreset(presetMs, notation),
      counterPreset: (preset) => formatCounterPreset(preset, notation),
      risingMark: risingMark(notation),
    }),
    [notation, setNotation],
  );

  return <NotationContext.Provider value={value}>{children}</NotationContext.Provider>;
}

export function useNotation(): NotationContextValue {
  const ctx = useContext(NotationContext);
  if (!ctx) throw new Error("NotationProvider の中で使ってください");
  return ctx;
}

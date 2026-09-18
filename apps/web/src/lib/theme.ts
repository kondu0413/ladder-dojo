import { useSyncExternalStore } from "react";

/**
 * ライト / ダークの切り替え(S-043)。
 *
 * - 最初の描画より前に index.html の小さなスクリプトが `data-theme` を決める
 *   (保存した選択 → 無ければ端末の設定)。ここはそれを引き継ぐ
 * - 選んだテーマは端末に保存する(表記の切り替えと同じ考え方。サーバーには送らない)
 * - 選んでいない間は、端末の設定が変わればそれに追いつく
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "ladder-dojo:theme";
const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function storedTheme(): Theme | undefined {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function applyTheme(theme: Theme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 保存できなくても、その場の切り替えは効かせる
    }
  }
  for (const listener of listeners) listener();
}

/** 端末の設定に追いつく(選んでいない間だけ)。起動時に 1 回呼ぶ */
export function initTheme(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", (e) => {
    if (storedTheme()) return;
    applyTheme(e.matches ? "dark" : "light", false);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as const);
  return {
    theme,
    setTheme: applyTheme,
    toggle: () => applyTheme(theme === "dark" ? "light" : "dark"),
  };
}

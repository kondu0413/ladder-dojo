import { useTheme } from "../lib/theme.js";
import { Icon } from "./ui.js";

/** ライト / ダークの切り替えボタン。紺のヘッダーに置く前提の色 */
export function ThemeToggle({ className = "" }: { className?: string | undefined }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "ライトモードにする" : "ダークモードにする";
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-theme={theme}
      aria-label={label}
      title={label}
      onClick={toggle}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 hover:text-white ${className}`}
    >
      <Icon name={dark ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}

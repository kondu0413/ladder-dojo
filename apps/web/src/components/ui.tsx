import { cloneElement, isValidElement, useId } from "react";
import { Link } from "react-router";

/**
 * 画面をまたいで使う部品(S-020 / S-036)。
 *
 * 見た目の決まりごとを 1 か所に置く。各画面が自前で角丸や影を書いていると、
 * 少しずつずれていって「なんとなく揃っていない」画面になる。
 * ここにある部品だけで画面を組めるようにしてある。
 *
 * 色の役割:
 * - 紺(slate-900): 主役のボタン、ヘッダー、母線
 * - 橙(amber-400): 「動かす・答え合わせ」など、いちばん押してほしいもの。通電の色と同じ
 * - 緑 / 赤: 正解 / 不正解。それ以外の意味では使わない
 */

// ---------------------------------------------------------------------------
// アイコン(線画。外部ライブラリは入れない)
// ---------------------------------------------------------------------------

const ICONS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  play: "M7 4.5v15l12-7.5z",
  pause: "M8 5v14M16 5v14",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  wrench:
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  pencil: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z",
  flask: "M9 3h6M10 3v6.5L4.5 19a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V3",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  plus: "M12 5v14M5 12h14",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  search: "M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0m18 10-4.3-4.3",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  info: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M12 16v-4M12 8h.01",
  alert:
    "m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  clock: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M12 6v6l4 2",
  hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
  smartphone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01",
  factory:
    "M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM17 18h1M12 18h1M7 18h1",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  logIn: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  logOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  star: "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  target:
    "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  cpu: "M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  medal: "M6 8a6 6 0 1 0 12 0A6 6 0 1 0 6 8M8.2 13.9 7 23l5-3 5 3-1.2-9.1",
  wifiOff:
    "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.5-2.8M2 8.5a15 15 0 0 1 4-2.5M22 8.5a15 15 0 0 0-10-3.5M12 20h.01",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  sparkle:
    "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
  layers: "m12 2 10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
  chart: "M3 3v18h18M7 15l4-4 4 3 5-6",
} as const;

export type IconName = keyof typeof ICONS;

/** 線画のアイコン。文字色をそのまま使う。読み上げには含めない(隣の文字が意味を持つ) */
export function Icon({
  name,
  className = "h-4 w-4",
  strokeWidth = 2,
}: {
  name: IconName;
  className?: string | undefined;
  strokeWidth?: number | undefined;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ページの骨組み
// ---------------------------------------------------------------------------

/** 見出しと説明。ページの先頭に置く */
export function PageHeader({
  title,
  lead,
  actions,
  back,
  eyebrow,
  children,
}: {
  title: string;
  lead?: string | undefined;
  actions?: React.ReactNode | undefined;
  /** 戻り先。指定すると題名の上に小さく出す */
  back?: { to: string; label: string } | undefined;
  /** 題名の上の小さな分類(「自己保持 / 読む」など) */
  eyebrow?: React.ReactNode | undefined;
  /** 題名の下に並べるもの(札など) */
  children?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back && (
        <Link
          to={back.to}
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <Icon name="arrowLeft" className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow && (
            <div className="text-xs font-semibold tracking-wide text-slate-500">{eyebrow}</div>
          )}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-[2rem]">
            {title}
          </h1>
          {lead && <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{lead}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** 白い箱。中身のまとまりを示す */
export function Card({
  children,
  className = "",
  padded = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean | undefined }) {
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-card ${
        padded ? "p-4 sm:p-5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** 節の見出し */
export function SectionTitle({
  children,
  count,
  icon,
  action,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  count?: string | undefined;
  icon?: IconName | undefined;
  action?: React.ReactNode | undefined;
  as?: "h2" | "h3" | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-amber-300">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      )}
      <Tag className="text-lg font-bold tracking-tight text-slate-900">{children}</Tag>
      {count && <span className="text-xs font-semibold tabular-nums text-slate-500">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** 小さな見出し。箱の中の節に使う */
export function Label({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-xs font-semibold tracking-wide text-slate-500 ${className}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 押せるもの
// ---------------------------------------------------------------------------

export type ButtonTone = "primary" | "accent" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const TONE: Record<ButtonTone, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-300",
  accent:
    "bg-amber-400 text-slate-950 hover:bg-amber-300 active:bg-amber-500 disabled:bg-amber-200 disabled:text-slate-500",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-700 hover:bg-slate-200/60 active:bg-slate-200",
  danger:
    "border border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 active:bg-rose-100",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-6 text-base",
};

/** 押せるもの。最小の高さは 44px(指で押せる大きさ) */
export function buttonClass(
  tone: ButtonTone = "primary",
  extra = "",
  size: ButtonSize = "md",
): string {
  return `inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${SIZE[size]} ${TONE[tone]} ${extra}`;
}

export function Button({
  tone = "primary",
  size = "md",
  className = "",
  icon,
  children,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone | undefined;
  size?: ButtonSize | undefined;
  icon?: IconName | undefined;
}) {
  return (
    <button {...rest} type={type} className={buttonClass(tone, className, size)}>
      {icon && <Icon name={icon} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {children}
    </button>
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  testId?: string | undefined;
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
};

/**
 * 切り替え(灰色の溝の中で白い札が動く)。
 * 「編集 / 動かす」「1x / 5x / 即時」のような、同時に 1 つしか選べないもの
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  fill = false,
  mono = false,
  size = "md",
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** 読み上げ用の名前(「確かめ方」など) */
  label?: string | undefined;
  /** 横幅いっぱいに広げて等分する */
  fill?: boolean | undefined;
  mono?: boolean | undefined;
  size?: "sm" | "md" | undefined;
  className?: string | undefined;
}) {
  return (
    <fieldset className={`m-0 min-w-0 border-0 p-0 ${fill ? "w-full" : ""} ${className}`}>
      {label && <legend className="sr-only">{label}</legend>}
      <div
        className={`${fill ? "grid w-full auto-cols-fr grid-flow-col" : "inline-flex"} gap-0.5 rounded-xl bg-slate-200/70 p-1`}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              data-testid={o.testId}
              aria-pressed={active}
              aria-label={o.ariaLabel}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={`${size === "sm" ? "min-h-8 px-2.5 text-xs" : "min-h-9 px-3 text-sm"} rounded-lg font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                mono ? "font-mono" : ""
              } ${
                active
                  ? "bg-white text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.12)]"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 選べる札(複数並べて 1 つを選ぶ。折り返してよいもの向け) */
export function Chip({
  active = false,
  className = "",
  children,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean | undefined }) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------

export function inputClass(extra = ""): string {
  // 幅の指定が渡されたら、既定の w-full は付けない(w-full と w-32 を両方書くと後勝ちで読めない)
  const width = /(^|\s)(w-|max-w-)/.test(extra) ? "" : "w-full";
  return `min-h-11 ${width} rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400 ${extra}`;
}

export function selectClass(extra = ""): string {
  return inputClass(`select-chevron ${extra}`);
}

/**
 * ラベル付きの入力欄。
 * 子が 1 つの入力なら id を振って label と結びつける。複数の要素を渡すときは、
 * 入力側に aria-label を付けておくこと
 */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: React.ReactNode;
  hint?: React.ReactNode | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  const generated = useId();
  const child = isValidElement<{ id?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? generated })
    : children;
  const id = isValidElement<{ id?: string }>(children)
    ? (children.props.id ?? generated)
    : generated;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-slate-600">
        {label}
      </label>
      {child}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// お知らせ・状態
// ---------------------------------------------------------------------------

export type NoticeTone = "info" | "success" | "warning" | "danger" | "neutral";

const NOTICE: Record<NoticeTone, { cls: string; icon: IconName }> = {
  info: { cls: "border-sky-200 bg-sky-50 text-sky-900", icon: "info" },
  success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "check" },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", icon: "alert" },
  danger: { cls: "border-rose-200 bg-rose-50 text-rose-900", icon: "alert" },
  neutral: { cls: "border-slate-200 bg-slate-100 text-slate-700", icon: "info" },
};

/** 色だけに頼らず、記号も添えた短いお知らせ */
export function Notice({
  tone = "neutral",
  children,
  className = "",
  icon = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: NoticeTone | undefined;
  icon?: boolean | undefined;
}) {
  const t = NOTICE[tone];
  return (
    <div
      {...rest}
      className={`rise-in flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${t.cls} ${className}`}
    >
      {icon && <Icon name={t.icon} className="mt-0.5 h-4 w-4 opacity-80" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 何も無いときの案内。「無い」ことを静かに、次にすることを一緒に */
export function EmptyState({
  icon = "info",
  title,
  body,
  action,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: IconName | undefined;
  title: React.ReactNode;
  body?: React.ReactNode | undefined;
  action?: React.ReactNode | undefined;
}) {
  return (
    <div
      {...rest}
      className={`flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center ${className}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {body && <p className="max-w-prose text-xs leading-relaxed text-slate-500">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** 読み込み中の灰色の箱 */
export function Skeleton({ className = "h-4 w-full" }: { className?: string | undefined }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

/** 小さな見出し付きの数値。進捗や集計に使う */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</span>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

export type BadgeTone = "slate" | "blue" | "green" | "amber" | "violet" | "rose" | "navy";

/** 色だけに頼らない小さな札。記号と文字をセットで出す(S-018 と同じ考え方) */
export function Badge({
  children,
  tone = "slate",
  icon,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone | undefined;
  icon?: IconName | undefined;
}) {
  const cls = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-sky-100 text-sky-800",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-900",
    violet: "bg-violet-100 text-violet-800",
    rose: "bg-rose-100 text-rose-800",
    navy: "bg-slate-900 text-white",
  }[tone];
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls} ${className}`}
    >
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** 難易度(1〜5)。数字だけだと軽重が読みにくいので、棒の本数でも見せる */
export function Difficulty({
  level,
  className = "",
}: {
  level: number;
  className?: string | undefined;
}) {
  const n = Math.max(0, Math.min(5, Math.round(level)));
  return (
    <span
      role="img"
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 ${className}`}
      aria-label={`難易度 ${level}`}
      title={`難易度 ${level}`}
    >
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`w-1 rounded-sm ${i <= n ? "bg-slate-800" : "bg-slate-300"}`}
            style={{ height: `${4 + i * 2}px` }}
          />
        ))}
      </span>
      <span>難易度 {level}</span>
    </span>
  );
}

/** 進捗の帯。数字は呼ぶ側で必ず添える(色だけに頼らない) */
export function ProgressBar({
  value,
  max,
  className = "",
  label,
}: {
  value: number;
  max: number;
  className?: string | undefined;
  label: string;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}
      role="img"
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** 「読む / 直す / 書く」の色と記号。一覧・問題ページで同じ意味を持たせる */
export const MODE_STYLE = {
  read: { icon: "eye", tone: "blue", tile: "bg-sky-100 text-sky-700" },
  fix: { icon: "wrench", tone: "amber", tile: "bg-amber-100 text-amber-700" },
  write: { icon: "pencil", tone: "violet", tile: "bg-violet-100 text-violet-700" },
} as const satisfies Record<string, { icon: IconName; tone: BadgeTone; tile: string }>;

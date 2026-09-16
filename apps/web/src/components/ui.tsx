import { Link } from "react-router";

/**
 * 画面をまたいで使う小さな部品(S-020)。
 *
 * 見た目の決まりごとを 1 か所に置く。各画面が自前で角丸や影を書いていると、
 * 少しずつずれていって「なんとなく揃っていない」画面になる。
 */

/** 見出しと説明。ページの先頭に置く */
export function PageHeader({
  title,
  lead,
  actions,
  back,
}: {
  title: string;
  lead?: string;
  actions?: React.ReactNode;
  /** 戻り先。指定すると題名の上に小さく出す */
  back?: { to: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8">
      {back && (
        <Link
          to={back.to}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {lead && <p className="text-sm text-slate-600">{lead}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** 白い箱。中身のまとまりを示す */
export function Card({ children, className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

/** 節の見出し */
export function SectionTitle({ children, count }: { children: React.ReactNode; count?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">{children}</h2>
      {count && <span className="text-xs font-medium text-slate-500">{count}</span>}
    </div>
  );
}

type ButtonTone = "primary" | "secondary" | "ghost";

const TONE: Record<ButtonTone, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
};

/** 押せるもの。最小の高さは 44px(指で押せる大きさ) */
export function buttonClass(tone: ButtonTone = "primary", extra = ""): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed ${TONE[tone]} ${extra}`;
}

/** 小さな見出し付きの数値。進捗や集計に使う */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-xl font-bold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

/** 色だけに頼らない小さな札。記号と文字をセットで出す(S-018 と同じ考え方) */
export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "blue" | "green" | "amber";
}) {
  const cls = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

import type { Problem } from "@ladder-dojo/core";
import { useMemo } from "react";
import { Link } from "react-router";
import { useProgress } from "../lib/progress-context.jsx";
import { dueForReview } from "../lib/review.js";

export type ReviewSuggestionsProps = {
  problems: readonly Problem[];
};

/**
 * 復習の提案(改善候補 5)。
 *
 * クリアしてから日が経った問題を出し直す。覚えたつもりのまま放っておくと忘れるので、
 * 間隔をあけて出す(S-012)。
 *
 * 出すものが無ければ枠ごと消える。「復習はありません」と毎日出しても意味がない。
 */
export function ReviewSuggestions({ problems }: ReviewSuggestionsProps) {
  const { progress } = useProgress();

  const items = useMemo(() => {
    const known = new Set(problems.map((p) => p.id));
    const titles = new Map(problems.map((p) => [p.id, p.title]));
    return dueForReview(progress, { known }).map((item) => ({
      ...item,
      title: titles.get(item.problemId) ?? item.problemId,
    }));
  }, [progress, problems]);

  if (items.length === 0) return null;

  return (
    <section
      data-testid="review-suggestions"
      className="rounded-xl border border-sky-200 bg-sky-50 p-3"
    >
      <h2 className="text-base font-bold text-sky-900">そろそろ復習しませんか</h2>
      <p className="mt-0.5 text-xs text-sky-800">
        前にクリアした問題です。解き直すと、その日の学習にも数えられます。
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.problemId}>
            <Link
              to={`/problems/${item.problemId}`}
              data-testid={`review-${item.problemId}`}
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-800">{item.title}</span>
              <span className="shrink-0 text-xs text-slate-500">{daysLabel(item.daysSince)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function daysLabel(days: number): string {
  if (days >= 365) return `${Math.floor(days / 365)} 年以上ぶり`;
  if (days >= 30) return `${Math.floor(days / 30)} か月ぶり`;
  return `${days} 日ぶり`;
}

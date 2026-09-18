import { DIAGNOSIS_LABELS, isDiagnosisId } from "@ladder-dojo/core";
import { useEffect, useState } from "react";
import { api, isAborted } from "../lib/api.js";
import { Icon } from "./ui.js";

export type CommonMistakesProps = {
  problemId: string;
  /** 見出しの下に出す一言。問題の種類で変えたいとき用 */
  note?: string | undefined;
};

type Row = { diagnosisId: string; users: number };

/**
 * 「みんながつまずくところ」(SPEC.md §3.5「提出回路の履歴は、後のつまずき分析に使う」)。
 *
 * 個人は一切出さず、人数だけを出す。人数が少ないうちはサーバーが何も返さないので、
 * そのときはこの枠ごと消える(「1 人がつまずきました」は「みんな」ではない)。
 *
 * 畳んだ状態で出す。開くかどうかは本人に決めてもらう。先に読むと、
 * どこを直せばいいかの見当がついてしまって、自分で考える機会が減るため。
 */
export function CommonMistakes({ problemId, note }: CommonMistakesProps) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .mistakes(problemId, controller.signal)
      .then((res) => setRows(res.mistakes))
      .catch((err: unknown) => {
        // 集計が取れなくても学習には困らないので、黙って隠す
        if (!isAborted(err)) setRows([]);
      });
    return () => controller.abort();
  }, [problemId]);

  if (rows.length === 0) return null;

  return (
    <details
      data-testid="common-mistakes"
      className="group rounded-2xl border border-slate-200/80 bg-white shadow-card"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
        <Icon name="users" className="h-4 w-4 text-slate-400" />
        <span>みんながつまずくところ</span>
        <Icon
          name="chevronDown"
          className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        {note && <p className="mb-2 text-xs text-slate-500">{note}</p>}
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.diagnosisId}
              data-testid={`common-mistake-${row.diagnosisId}`}
              className="flex items-baseline gap-2 text-sm text-slate-700"
            >
              <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-slate-600">
                {row.users} 人
              </span>
              <span>{labelOf(row.diagnosisId)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-xs text-slate-400">
          この問題を解いた人が実際につまずいたところです。人数が少ないうちは出ません。
        </p>
      </div>
    </details>
  );
}

function labelOf(diagnosisId: string): string {
  return isDiagnosisId(diagnosisId) ? DIAGNOSIS_LABELS[diagnosisId] : diagnosisId;
}

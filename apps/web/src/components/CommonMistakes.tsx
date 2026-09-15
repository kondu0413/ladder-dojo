import { DIAGNOSIS_LABELS, isDiagnosisId } from "@ladder-dojo/core";
import { useEffect, useState } from "react";
import { api, isAborted } from "../lib/api.js";

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
      .mistakes(problemId)
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
      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
    >
      <summary className="cursor-pointer text-sm text-slate-600">みんながつまずくところ</summary>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
      <ul className="mt-2 flex flex-col gap-1">
        {rows.map((row) => (
          <li
            key={row.diagnosisId}
            data-testid={`common-mistake-${row.diagnosisId}`}
            className="flex items-baseline gap-2 text-sm text-slate-700"
          >
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {row.users} 人
            </span>
            <span>{labelOf(row.diagnosisId)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        この問題を解いた人が実際につまずいたところです。人数が少ないうちは出ません。
      </p>
    </details>
  );
}

function labelOf(diagnosisId: string): string {
  return isDiagnosisId(diagnosisId) ? DIAGNOSIS_LABELS[diagnosisId] : diagnosisId;
}

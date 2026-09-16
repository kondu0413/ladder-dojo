import type { MatrixCellDto, MatrixDto } from "@ladder-dojo/api/dto";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { downloadCsv, safeFilePart } from "../lib/csv.js";
import { MODE_LABELS, STAGE_LABELS, STAGE_ORDER, sortedProblems } from "../problems/index.js";

export type ProgressMatrixProps = {
  orgId: string;
  /** 書き出すファイル名に使う */
  orgName: string;
};

type CellState = "cleared" | "stuck" | "untouched";

/**
 * クラス全体の進捗(改善候補 8 / SPEC.md §3.8)。
 *
 * メンバー × 問題の表。1 人ずつ開かなくても、誰がどこで止まっているかを一望できる。
 *
 * 色だけに頼らない。マスには記号(○ / △ / 空)も入れて、
 * 色が見分けにくい人にも読めるようにしている。
 */
export function ProgressMatrix({ orgId, orgName }: ProgressMatrixProps) {
  const [data, setData] = useState<MatrixDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const problems = useMemo(() => sortedProblems(), []);

  useEffect(() => {
    setData(undefined);
    setError(undefined);
    api
      .orgMatrix(orgId)
      .then(setData)
      .catch(() => setError("クラス全体の進捗を読み込めませんでした。"));
  }, [orgId]);

  const byUser = useMemo(() => {
    const map = new Map<string, Map<string, MatrixCellDto>>();
    for (const cell of data?.cells ?? []) {
      const row = map.get(cell.userId) ?? new Map<string, MatrixCellDto>();
      row.set(cell.problemId, cell);
      map.set(cell.userId, row);
    }
    return map;
  }, [data]);

  if (error) {
    return (
      <p data-testid="matrix-error" className="text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-slate-500">読み込み中…</p>;

  /**
   * CSV に落とす(改善候補 10)。
   *
   * 出すのは**氏名と学習状況だけ**。メールアドレスは入れない(S-014)。
   * 画面に出している表をそのまま縦持ちにするので、サーバーへの問い合わせは増えない。
   */
  const exportCsv = () => {
    const rows: string[][] = [["氏名", "権限", "段階", "モード", "問題", "状態", "失敗回数"]];
    for (const member of data.members) {
      const row = byUser.get(member.userId);
      for (const problem of problems) {
        const cell = row?.get(problem.id);
        rows.push([
          member.name,
          member.role === "admin" ? "管理者" : "メンバー",
          STAGE_LABELS[problem.stage],
          MODE_LABELS[problem.mode],
          problem.title,
          cell?.cleared ? "クリア" : cell ? "挑戦中" : "未着手",
          String(cell?.failures ?? 0),
        ]);
      }
    }
    // ファイル名は ASCII だけにする。日本語を入れると保存名ごと失われる(csv.ts 参照)
    const today = new Date().toISOString().slice(0, 10);
    const org = safeFilePart(orgName);
    downloadCsv(`${org ? `${org}-` : ""}ladder-dojo-progress-${today}.csv`, rows);
  };

  return (
    <section className="flex flex-col gap-2" data-testid="progress-matrix">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">
          ○ クリア ・ △ 挑戦したがまだ ・ 空欄 未着手。横に長いので、スクロールしてください。
        </p>
        <button
          type="button"
          data-testid="matrix-export"
          onClick={exportCsv}
          className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700"
        >
          CSV で保存
        </button>
      </div>
      {data.truncated && (
        <p data-testid="matrix-truncated" className="text-xs text-amber-800">
          人数が多いため、一部だけを表示しています。
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-slate-600">
                メンバー
              </th>
              {STAGE_ORDER.map((stage) => {
                const count = problems.filter((p) => p.stage === stage).length;
                if (count === 0) return null;
                return (
                  <th
                    key={stage}
                    colSpan={count}
                    className="border-l border-slate-200 px-1 py-1 text-center font-semibold text-slate-500"
                  >
                    {STAGE_LABELS[stage]}
                  </th>
                );
              })}
              <th className="border-l border-slate-200 px-2 py-1 text-right font-semibold text-slate-600">
                クリア
              </th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => {
              const row = byUser.get(member.userId);
              const cleared = problems.filter((p) => row?.get(p.id)?.cleared).length;
              return (
                <tr key={member.userId} data-testid={`matrix-row-${member.userId}`}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-28 truncate bg-white px-2 py-1 text-left font-medium text-slate-800"
                  >
                    {member.name}
                    {member.role === "admin" && (
                      <span className="ml-1 text-[10px] text-slate-400">管理者</span>
                    )}
                  </th>
                  {problems.map((problem) => {
                    const cell = row?.get(problem.id);
                    const state: CellState = cell?.cleared
                      ? "cleared"
                      : cell
                        ? "stuck"
                        : "untouched";
                    return (
                      <td
                        key={problem.id}
                        data-testid={`matrix-cell-${member.userId}-${problem.id}`}
                        data-state={state}
                        title={`${member.name} / ${problem.title}${
                          cell && !cell.cleared ? ` (失敗 ${cell.failures} 回)` : ""
                        }`}
                        className={`h-6 w-6 border border-white text-center align-middle ${CELL_CLASS[state]}`}
                      >
                        {CELL_MARK[state]}
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-200 px-2 py-1 text-right tabular-nums text-slate-700">
                    {cleared} / {problems.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CELL_CLASS: Record<CellState, string> = {
  cleared: "bg-emerald-500 text-white",
  stuck: "bg-amber-200 text-amber-900",
  untouched: "bg-slate-100 text-slate-300",
};

/** 色だけに頼らないための記号 */
const CELL_MARK: Record<CellState, string> = {
  cleared: "○",
  stuck: "△",
  untouched: "",
};

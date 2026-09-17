import type { Circuit, TestCase } from "@ladder-dojo/core";
import { judge, PUBLISH_LIMITS } from "@ladder-dojo/core";
import { useEffect, useState } from "react";
import { ApiError, api, type OrgSummary, type SolutionFailure } from "../lib/api.js";

export type PublishDialogProps = {
  circuit: Circuit;
  testCases: TestCase[];
  defaultTitle: string;
  onPublished: (id: string) => void;
  onCancel: () => void;
};

/** 通らなかった理由の説明。打ち切りは原因が違うので、別の言い方にする */
function failureMessage(hitLimit: boolean): string {
  if (hitLimit) {
    return `テストが重すぎて最後まで確認できませんでした。1 件あたりの待ち時間は ${
      PUBLISH_LIMITS.maxScansPerCase / 100
    } 秒まで、問題ぜんぶで ${
      PUBLISH_LIMITS.maxScansTotal / 100
    } 秒までです。待ち時間を減らすか、テストケースを減らしてください。`;
  }
  return "あなたの回路が、付けたテストを通りませんでした。投稿するには全て通す必要があります。";
}

/**
 * サンドボックスの回路を問題として投稿する(SPEC.md §3.6)。
 * 投稿時にサーバーが模範解答をテストにかけ、通らなければ理由を返す。
 */
export function PublishDialog({
  circuit,
  testCases,
  defaultTitle,
  onPublished,
  onCancel,
}: PublishDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [spec, setSpec] = useState("");
  const [difficulty, setDifficulty] = useState(3);
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "org" | "private">("public");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgId, setOrgId] = useState("");

  // 組織限定で公開する選択肢は、どこかの組織に入っているときだけ出す(§3.8)
  useEffect(() => {
    api
      .listOrgs()
      .then((res) => {
        setOrgs(res.orgs);
        setOrgId((cur) => cur || (res.orgs[0]?.id ?? ""));
      })
      .catch(() => setOrgs([]));
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [failures, setFailures] = useState<SolutionFailure[]>([]);

  const publish = async () => {
    setBusy(true);
    setError(undefined);
    setFailures([]);
    try {
      /**
       * **送る前に、サーバーと同じ条件で確かめる**(S-030)。
       * 手元の答え合わせは上限が緩いので、そのまま送ると
       * 「手元では通ったのに投稿だけ弾かれた」になる
       */
      const pre = judge(circuit, testCases, {
        maxScansPerCase: PUBLISH_LIMITS.maxScansPerCase,
        maxScansTotal: PUBLISH_LIMITS.maxScansTotal,
      });
      if (!pre.passed) {
        setFailures(
          pre.cases
            .filter((c) => !c.passed)
            .map((c) => ({
              caseId: c.caseId,
              title: c.title,
              kind: c.failure?.kind ?? "mismatch",
            })),
        );
        setError(failureMessage(pre.cases.some((c) => c.failure?.kind === "limit")));
        return;
      }
      const res = await api.publishProblem({
        title: title.trim(),
        spec: spec.trim(),
        circuit,
        testCases,
        difficulty,
        tags: tags
          .split(/[,、\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
        visibility,
        ...(visibility === "org" && orgId ? { orgId } : {}),
      });
      onPublished(res.problem.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "solution_failed") {
        const list = err.failures ?? [];
        setFailures(list);
        setError(failureMessage(list.some((f) => f.kind === "limit")));
      } else if (err instanceof ApiError && err.code === "invalid_body") {
        setError(
          "入力に不足があります。タイトル・仕様文・テストケース(1 件以上)を確認してください。",
        );
      } else {
        setError("投稿できませんでした。");
      }
    } finally {
      setBusy(false);
    }
  };

  const canPublish =
    title.trim().length > 0 &&
    spec.trim().length > 0 &&
    testCases.length > 0 &&
    (visibility !== "org" || orgId !== "");

  return (
    <section
      data-testid="publish-dialog"
      className="flex flex-col gap-3 rounded-xl border border-sky-300 bg-sky-50 p-4"
    >
      <h2 className="text-base font-bold text-sky-900">問題として投稿する</h2>
      <p className="text-xs text-sky-800">
        いまの回路が模範解答、付けたテストが判定に使われます。投稿するとサーバーが模範解答を自動でチェックします。
      </p>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        タイトル
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          data-testid="publish-title"
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        仕様文(解く人に見える説明)
        <textarea
          value={spec}
          onChange={(e) => setSpec(e.target.value.slice(0, 2000))}
          data-testid="publish-spec"
          rows={4}
          placeholder="例: 起動ボタン X0 を押すとランプ Y0 が点灯し、離しても点いたままになる。X1 で消灯する。"
          className="rounded-lg border border-slate-300 p-2"
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          難易度
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            data-testid="publish-difficulty"
            className="min-h-11 rounded-lg border border-slate-300 px-2"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
          タグ(カンマ区切り)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value.slice(0, 120))}
            data-testid="publish-tags"
            placeholder="自己保持, タイマ"
            className="min-h-11 rounded-lg border border-slate-300 px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          公開範囲
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "public" | "org" | "private")}
            data-testid="publish-visibility"
            className="min-h-11 rounded-lg border border-slate-300 px-2"
          >
            <option value="public">みんなに公開</option>
            {orgs.length > 0 && <option value="org">組織のメンバーだけ</option>}
            <option value="private">自分だけ</option>
          </select>
        </label>
        {visibility === "org" && orgs.length > 0 && (
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            公開先の組織
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              data-testid="publish-org"
              className="min-h-11 rounded-lg border border-slate-300 px-2"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {testCases.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          テストケースが 1 件も付いていません。「テスト」タブで追加してください。
        </p>
      )}

      {error && (
        <div
          data-testid="publish-error"
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <p>{error}</p>
          {failures.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {failures.map((f) => (
                <li key={f.caseId}>
                  {f.title}
                  {f.kind === "unstable" && "(回路が発振しています)"}
                  {f.kind === "limit" && "(ここで打ち切りました)"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="publish-submit"
          disabled={busy || !canPublish}
          onClick={() => void publish()}
          className="min-h-11 flex-1 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          投稿する
        </button>
        <button
          type="button"
          data-testid="publish-cancel"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700"
        >
          やめる
        </button>
      </div>
    </section>
  );
}

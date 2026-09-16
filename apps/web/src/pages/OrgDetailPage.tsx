import { circuitSchema } from "@ladder-dojo/core";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { AuthBar } from "../components/AuthBar.js";
import { LadderView } from "../components/LadderView.js";
import { ProgressMatrix } from "../components/ProgressMatrix.js";
import {
  type Assignment,
  api,
  type OrgDetail,
  type OrgMember,
  type ProgressDto,
} from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";
import { findProblem, MODE_LABELS, STAGE_LABELS, sortedProblems } from "../problems/index.js";

type Tab = "members" | "assignments" | "matrix" | "stuck";

/** 組織の詳細。管理者ビュー(SPEC.md §3.8) */
export function OrgDetailPage() {
  const { id } = useParams();
  const { user } = useProgress();
  const [detail, setDetail] = useState<OrgDetail | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("members");
  const [error, setError] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [invite, setInvite] = useState<string | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await api.getOrg(id));
      setError(undefined);
    } catch {
      setError("この組織は見つかりませんでした。");
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!user) {
    return (
      <Shell>
        <p className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600">
          組織を見るにはログインしてください。
        </p>
      </Shell>
    );
  }

  if (error || !id) {
    return (
      <Shell>
        <p data-testid="org-error" className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700">
          {error ?? "組織が指定されていません。"}
        </p>
      </Shell>
    );
  }

  if (!detail) {
    return (
      <Shell>
        <p className="text-sm text-slate-500">読み込み中…</p>
      </Shell>
    );
  }

  const isAdmin = detail.org.role === "admin";

  const makeInvite = async () => {
    try {
      const res = await api.createInvite(id);
      setInvite(res.invite.code);
      setMessage("招待コードを発行しました。期限は 14 日です。");
    } catch {
      setMessage("招待コードを発行できませんでした。");
    }
  };

  return (
    <Shell>
      <header className="flex flex-col gap-1">
        <Link to="/orgs" className="text-sm text-slate-500 underline">
          ← 組織一覧
        </Link>
        <h1 className="text-lg font-bold text-slate-900">{detail.org.name}</h1>
        <p className="text-xs text-slate-500">
          {isAdmin ? "あなたは管理者です" : "あなたはメンバーです"}
        </p>
      </header>

      {message && (
        <p
          data-testid="org-message"
          role="status"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
        >
          {message}
        </p>
      )}

      {invite && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-3">
          <p className="text-xs text-sky-900">この招待コードを伝えてください</p>
          <p data-testid="invite-code" className="mt-1 font-mono text-lg font-bold text-sky-900">
            {invite}
          </p>
        </div>
      )}

      {isAdmin && (
        <button
          type="button"
          data-testid="create-invite"
          onClick={() => void makeInvite()}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
        >
          招待コードを発行
        </button>
      )}

      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {(
          [
            { value: "members", label: isAdmin ? "メンバー" : "この組織" },
            { value: "assignments", label: "課題" },
            ...(isAdmin
              ? [
                  { value: "matrix" as const, label: "一覧表" },
                  { value: "stuck" as const, label: "つまずき" },
                ]
              : []),
          ] as Array<{ value: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            data-testid={`org-tab-${t.value}`}
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`min-h-11 flex-1 text-sm font-medium ${
              tab === t.value ? "bg-slate-700 text-white" : "bg-white text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "members" &&
        (isAdmin ? (
          <MembersPanel orgId={id} members={detail.members} me={user.id} onChanged={reload} />
        ) : (
          <p className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600">
            メンバー一覧は管理者だけが見られます。
          </p>
        ))}

      {tab === "assignments" && (
        <AssignmentsPanel orgId={id} isAdmin={isAdmin} members={detail.members} />
      )}

      {tab === "matrix" && isAdmin && <ProgressMatrix orgId={id} />}

      {tab === "stuck" && isAdmin && <StuckPanel orgId={id} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 px-4 py-6">
      <AuthBar />
      {children}
    </main>
  );
}

function MembersPanel({
  orgId,
  members,
  me,
  onChanged,
}: {
  orgId: string;
  members: OrgMember[];
  me: string;
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<OrgMember | undefined>(undefined);
  const [progress, setProgress] = useState<ProgressDto[]>([]);
  const [submissions, setSubmissions] = useState<
    Array<{ id: string; problemId: string; circuit: unknown; passed: boolean; createdAt: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const open = async (member: OrgMember) => {
    setSelected(member);
    setProgress([]);
    setSubmissions([]);
    try {
      const [p, s] = await Promise.all([
        api.memberProgress(orgId, member.userId),
        api.memberSubmissions(orgId, member.userId),
      ]);
      setProgress(p.progress);
      setSubmissions(s.submissions);
    } catch {
      setError("学習状況を読み込めませんでした。");
    }
  };

  const changeRole = async (member: OrgMember, role: "admin" | "member") => {
    setBusy(true);
    setError(undefined);
    try {
      await api.setMemberRole(orgId, member.userId, role);
      await onChanged();
    } catch {
      setError("権限を変更できませんでした(最後の管理者は降格できません)。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: OrgMember) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.removeMember(orgId, member.userId);
      setSelected(undefined);
      await onChanged();
    } catch {
      setError("外せませんでした(最後の管理者は脱退できません)。");
    } finally {
      setBusy(false);
    }
  };

  const cleared = progress.filter((p) => p.clearedAt !== null).length;
  const stuck = progress.filter((p) => p.clearedAt === null);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2" data-testid="member-list">
        {members.map((m) => (
          <li
            key={m.userId}
            data-testid={`member-${m.userId}`}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-800">{m.name}</span>
              <span className="block truncate text-xs text-slate-500">{m.email}</span>
            </span>
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {m.role === "admin" ? "管理者" : "メンバー"}
            </span>
            <button
              type="button"
              data-testid={`view-${m.userId}`}
              onClick={() => void open(m)}
              className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-700"
            >
              学習状況
            </button>
            <button
              type="button"
              data-testid={`role-${m.userId}`}
              disabled={busy}
              onClick={() => void changeRole(m, m.role === "admin" ? "member" : "admin")}
              className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-700"
            >
              {m.role === "admin" ? "メンバーに" : "管理者に"}
            </button>
            {m.userId !== me && (
              <button
                type="button"
                data-testid={`remove-${m.userId}`}
                disabled={busy}
                onClick={() => void remove(m)}
                className="min-h-11 shrink-0 rounded-lg border border-red-300 px-3 text-xs text-red-600"
              >
                外す
              </button>
            )}
          </li>
        ))}
      </ul>

      {selected && (
        <section
          data-testid="member-detail"
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3"
        >
          <h3 className="text-sm font-semibold text-slate-700">{selected.name} の学習状況</h3>
          <p className="text-sm text-slate-600" data-testid="member-cleared">
            クリア {cleared} 問 / 挑戦した問題 {progress.length} 問
          </p>
          {stuck.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500">止まっている問題</p>
              <ul className="mt-1 flex flex-col gap-1">
                {stuck.slice(0, 10).map((p) => (
                  <li key={p.problemId} className="text-sm text-slate-700">
                    {findProblem(p.problemId)?.title ?? p.problemId}
                    <span className="ml-2 text-xs text-slate-500">失敗 {p.failures} 回</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500">
              提出した回路(新しい順・最大 50 件)
            </p>
            {submissions.length === 0 ? (
              <p data-testid="member-submissions-empty" className="mt-1 text-sm text-slate-500">
                まだ提出がありません。
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-2" data-testid="member-submissions">
                {submissions.slice(0, 10).map((sub) => {
                  const parsed = circuitSchema.safeParse(sub.circuit);
                  return (
                    <li
                      key={sub.id}
                      data-testid={`submission-${sub.id}`}
                      className="rounded-lg border border-slate-200 p-2"
                    >
                      <p className="flex items-center gap-2 text-xs text-slate-600">
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            sub.passed
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {sub.passed ? "正解" : "不正解"}
                        </span>
                        <span className="truncate">
                          {findProblem(sub.problemId)?.title ?? sub.problemId}
                        </span>
                        <span className="ml-auto shrink-0 text-slate-400">
                          {new Date(sub.createdAt).toLocaleString("ja-JP")}
                        </span>
                      </p>
                      {parsed.success && (
                        <div className="mt-1 overflow-x-auto">
                          <LadderView circuit={parsed.data} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function AssignmentsPanel({
  orgId,
  isAdmin,
  members,
}: {
  orgId: string;
  isAdmin: boolean;
  members: OrgMember[];
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [problemRef, setProblemRef] = useState(sortedProblems()[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      setAssignments((await api.listAssignments(orgId)).assignments);
    } catch {
      setMessage("課題を読み込めませんでした。");
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assign = async () => {
    try {
      await api.createAssignment(orgId, {
        kind: "official",
        problemRef,
        ...(target ? { userId: target } : {}),
        ...(note ? { note } : {}),
      });
      setNote("");
      await reload();
      setMessage("課題を割り当てました。");
    } catch {
      setMessage("割り当てできませんでした。");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {message && (
        <p
          data-testid="assignment-message"
          role="status"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
        >
          {message}
        </p>
      )}

      <ul className="flex flex-col gap-2" data-testid="assignment-list">
        {assignments.map((a) => {
          const problem = findProblem(a.problemRef);
          const assignee = members.find((m) => m.userId === a.userId);
          return (
            <li
              key={a.id}
              data-testid={`assignment-${a.id}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <Link
                  to={
                    a.kind === "official"
                      ? `/problems/${a.problemRef}`
                      : `/community/${a.problemRef}`
                  }
                  className="block truncate text-sm font-medium text-slate-800 underline"
                >
                  {problem?.title ?? a.problemRef}
                </Link>
                <span className="block truncate text-xs text-slate-500">
                  {a.userId ? `${assignee?.name ?? "メンバー"} に` : "全員に"}
                  {a.note ? ` ・ ${a.note}` : ""}
                </span>
              </span>
              {isAdmin && (
                <button
                  type="button"
                  data-testid={`unassign-${a.id}`}
                  onClick={() => {
                    void api.deleteAssignment(orgId, a.id).then(reload);
                  }}
                  className="min-h-11 shrink-0 rounded-lg border border-red-300 px-3 text-xs text-red-600"
                >
                  取り消す
                </button>
              )}
            </li>
          );
        })}
        {assignments.length === 0 && (
          <li
            data-testid="assignment-empty"
            className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600"
          >
            割り当てられた課題はありません。
          </li>
        )}
      </ul>

      {isAdmin && (
        <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-700">課題を割り当てる</h3>
          <select
            value={problemRef}
            onChange={(e) => setProblemRef(e.target.value)}
            data-testid="assign-problem"
            aria-label="割り当てる問題"
            className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm"
          >
            {sortedProblems().map((p) => (
              <option key={p.id} value={p.id}>
                {STAGE_LABELS[p.stage]} / {MODE_LABELS[p.mode]} ・ {p.title}
              </option>
            ))}
          </select>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="assign-target"
            aria-label="割り当て先"
            className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm"
          >
            <option value="">組織の全員</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="ひとこと(任意)"
            data-testid="assign-note"
            aria-label="ひとこと"
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <button
            type="button"
            data-testid="assign-submit"
            onClick={() => void assign()}
            className="min-h-11 rounded-lg bg-slate-700 px-4 text-sm font-medium text-white"
          >
            割り当てる
          </button>
        </section>
      )}
    </div>
  );
}

function StuckPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<
    | {
        stuck: Array<{ problemId: string; stuckUsers: number; failures: number }>;
        memberCount: number;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    api
      .orgStuck(orgId)
      .then(setData)
      .catch(() => setData({ stuck: [], memberCount: 0 }));
  }, [orgId]);

  if (!data) return <p className="text-sm text-slate-500">読み込み中…</p>;

  return (
    <div className="flex flex-col gap-2" data-testid="stuck-panel">
      <p className="text-xs text-slate-500">
        メンバー {data.memberCount} 人のうち、まだクリアできていない人が多い問題です。
      </p>
      {data.stuck.length === 0 ? (
        <p
          data-testid="stuck-empty"
          className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-600"
        >
          止まっている問題はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.stuck.map((s) => (
            <li
              key={s.problemId}
              data-testid={`stuck-${s.problemId}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm text-slate-800">
                {findProblem(s.problemId)?.title ?? s.problemId}
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                {s.stuckUsers} 人 ・ 失敗 {s.failures} 回
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

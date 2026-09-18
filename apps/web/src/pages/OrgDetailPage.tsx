import { circuitSchema } from "@ladder-dojo/core";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { AppShell } from "../components/AppShell.js";
import { LadderView } from "../components/LadderView.js";
import { ProgressMatrix } from "../components/ProgressMatrix.js";
import { PushSettings } from "../components/PushSettings.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  inputClass,
  Label,
  Notice,
  PageHeader,
  Segmented,
  Skeleton,
  selectClass,
} from "../components/ui.js";
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
  const { user, loading } = useProgress();
  const [detail, setDetail] = useState<OrgDetail | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("members");
  const [error, setError] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [invite, setInvite] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

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
    // セッションが決まってから読む。未ログインのまま叩いても 401 で「見つからない」になるだけ
    if (loading || !user) return;
    void reload();
  }, [reload, loading, user]);

  // セッションの確認中は何も断定しない。ログイン済みの人に「ログインしてください」が一瞬見えてしまう
  if (loading) {
    return (
      <AppShell width="wide">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40" />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell width="wide">
        <EmptyState
          icon="lock"
          title="組織を見るにはログインしてください。"
          body="右上の「Google でログイン」から入れます。"
        />
      </AppShell>
    );
  }

  if (error || !id) {
    return (
      <AppShell width="wide">
        <Notice tone="danger" data-testid="org-error">
          {error ?? "組織が指定されていません。"}
        </Notice>
        <Link
          to="/orgs"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          組織一覧へ戻る
        </Link>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell width="wide">
        <p className="sr-only" role="status">
          読み込み中
        </p>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40" />
      </AppShell>
    );
  }

  const isAdmin = detail.org.role === "admin";

  const makeInvite = async () => {
    try {
      const res = await api.createInvite(id);
      setInvite(res.invite.code);
      setCopied(false);
      setMessage("招待コードを発行しました。期限は 14 日です。");
    } catch {
      setMessage("招待コードを発行できませんでした。");
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const tabs: Array<{ value: Tab; label: string; testId: string }> = [
    { value: "members", label: isAdmin ? "メンバー" : "この組織", testId: "org-tab-members" },
    { value: "assignments", label: "課題", testId: "org-tab-assignments" },
    ...(isAdmin
      ? [
          { value: "matrix" as const, label: "一覧表", testId: "org-tab-matrix" },
          { value: "stuck" as const, label: "つまずき", testId: "org-tab-stuck" },
        ]
      : []),
  ];

  return (
    <AppShell width="wide">
      <PageHeader
        title={detail.org.name}
        back={{ to: "/orgs", label: "組織一覧" }}
        actions={
          isAdmin ? (
            <Button
              tone="secondary"
              icon="logIn"
              data-testid="create-invite"
              onClick={() => void makeInvite()}
            >
              招待コードを発行
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isAdmin ? "navy" : "slate"} icon={isAdmin ? "star" : "users"}>
            {isAdmin ? "あなたは管理者です" : "あなたはメンバーです"}
          </Badge>
          {isAdmin && detail.members.length > 0 && (
            <span className="text-xs text-slate-500">メンバー {detail.members.length} 人</span>
          )}
        </div>
      </PageHeader>

      {message && (
        <Notice
          tone={message.includes("ません") ? "warning" : "success"}
          role="status"
          data-testid="org-message"
        >
          {message}
        </Notice>
      )}

      {invite && (
        <Card padded className="flex flex-wrap items-center gap-4 border-amber-200 bg-amber-50/60">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label>この招待コードを伝えてください</Label>
            <p
              data-testid="invite-code"
              className="select-all font-mono text-2xl font-bold tracking-widest text-slate-900"
            >
              {invite}
            </p>
          </div>
          <Button
            tone="secondary"
            icon={copied ? "check" : "copy"}
            onClick={() => void copyInvite()}
          >
            {copied ? "コピーしました" : "コピー"}
          </Button>
        </Card>
      )}

      <Segmented<Tab>
        fill
        label="表示する内容"
        value={tab}
        onChange={setTab}
        options={tabs}
        className="max-w-2xl"
      />

      {tab === "members" &&
        (isAdmin ? (
          <MembersPanel orgId={id} members={detail.members} me={user.id} onChanged={reload} />
        ) : (
          <EmptyState
            icon="lock"
            title="メンバー一覧は管理者だけが見られます。"
            body="課題のタブで、あなたに割り当てられた課題を確認できます。"
          />
        ))}

      {tab === "assignments" && (
        <>
          <PushSettings />
          <AssignmentsPanel orgId={id} isAdmin={isAdmin} members={detail.members} />
        </>
      )}

      {tab === "matrix" && isAdmin && <ProgressMatrix orgId={id} orgName={detail.org.name} />}

      {tab === "stuck" && isAdmin && <StuckPanel orgId={id} />}
    </AppShell>
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
    <div className="flex flex-col gap-4">
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      <ul className="flex flex-col gap-2" data-testid="member-list">
        {members.map((m) => (
          <li
            key={m.userId}
            data-testid={`member-${m.userId}`}
            className={`flex flex-wrap items-center gap-2 rounded-2xl border bg-white px-4 py-3 shadow-card ${
              selected?.userId === m.userId ? "border-slate-900/30" : "border-slate-200/80"
            }`}
          >
            <span
              aria-hidden="true"
              className="theme-fixed flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-amber-300"
            >
              {[...m.name.trim()][0]?.toUpperCase() ?? "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">
                {m.name}
                {m.userId === me && (
                  <span className="ml-1.5 text-xs font-normal text-slate-400">(あなた)</span>
                )}
              </span>
              <span className="block truncate text-xs text-slate-500">{m.email}</span>
            </span>
            <Badge tone={m.role === "admin" ? "navy" : "slate"}>
              {m.role === "admin" ? "管理者" : "メンバー"}
            </Badge>
            <div className="flex flex-wrap gap-1.5">
              <Button
                tone="secondary"
                size="sm"
                icon="chart"
                data-testid={`view-${m.userId}`}
                onClick={() => void open(m)}
              >
                学習状況
              </Button>
              <Button
                tone="secondary"
                size="sm"
                data-testid={`role-${m.userId}`}
                disabled={busy}
                onClick={() => void changeRole(m, m.role === "admin" ? "member" : "admin")}
              >
                {m.role === "admin" ? "メンバーに" : "管理者に"}
              </Button>
              {m.userId !== me && (
                <Button
                  tone="danger"
                  size="sm"
                  data-testid={`remove-${m.userId}`}
                  disabled={busy}
                  onClick={() => void remove(m)}
                >
                  外す
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {selected && (
        <Card padded data-testid="member-detail" className="rise-in flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-base font-bold text-slate-900">{selected.name} の学習状況</h3>
            <p className="text-sm text-slate-600" data-testid="member-cleared">
              クリア {cleared} 問 / 挑戦した問題 {progress.length} 問
            </p>
          </div>
          {stuck.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>止まっている問題</Label>
              <ul className="flex flex-col gap-1">
                {stuck.slice(0, 10).map((p) => (
                  <li
                    key={p.problemId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-slate-800"
                  >
                    <span className="truncate">
                      {findProblem(p.problemId)?.title ?? p.problemId}
                    </span>
                    <span className="shrink-0 text-xs text-amber-800">失敗 {p.failures} 回</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>提出した回路(新しい順・最大 50 件)</Label>
            {submissions.length === 0 ? (
              <p data-testid="member-submissions-empty" className="text-sm text-slate-500">
                まだ提出がありません。
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="member-submissions">
                {submissions.slice(0, 10).map((sub) => {
                  const parsed = circuitSchema.safeParse(sub.circuit);
                  return (
                    <li
                      key={sub.id}
                      data-testid={`submission-${sub.id}`}
                      className="rounded-xl border border-slate-200 p-2.5"
                    >
                      <p className="flex items-center gap-2 text-xs text-slate-600">
                        <Badge tone={sub.passed ? "green" : "rose"}>
                          {sub.passed ? "正解" : "不正解"}
                        </Badge>
                        <span className="truncate font-medium text-slate-800">
                          {findProblem(sub.problemId)?.title ?? sub.problemId}
                        </span>
                        <span className="ml-auto shrink-0 text-slate-400">
                          {new Date(sub.createdAt).toLocaleString("ja-JP")}
                        </span>
                      </p>
                      {parsed.success && (
                        <div className="mt-2 overflow-x-auto">
                          <LadderView circuit={parsed.data} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * 課題の期限(改善候補 9)。
 *
 * 過ぎているかどうかが一目で分かるようにする。色だけに頼らず、文言でも言う。
 */
function DueBadge({ dueAt, assignmentId }: { dueAt: string | null; assignmentId: string }) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const days = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const overdue = days < 0;
  const soon = !overdue && days <= 3;
  const label = overdue ? `期限切れ(${-days} 日前)` : days === 0 ? "今日まで" : `あと ${days} 日`;

  return (
    <Badge
      data-testid={`due-${assignmentId}`}
      data-overdue={overdue || undefined}
      icon="calendar"
      tone={overdue ? "rose" : soon ? "amber" : "slate"}
      className="mt-1"
    >
      {due.toLocaleDateString("ja-JP")} まで ・ {label}
    </Badge>
  );
}

/**
 * 課題の達成率(改善候補 9)。管理者にだけ入る。
 *
 * 帯は色分けするが、数字も必ず出す。色が見分けにくい人にも読めるように
 */
function AchievementBar({
  stats,
  assignmentId,
}: {
  stats: { total: number; cleared: number; attempting: number; untouched: number };
  assignmentId: string;
}) {
  const pct = (n: number) => (stats.total === 0 ? 0 : (n / stats.total) * 100);
  return (
    <span className="mt-1.5 block" data-testid={`achievement-${assignmentId}`}>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-slate-200">
        <span className="bg-emerald-500" style={{ width: `${pct(stats.cleared)}%` }} />
        <span className="bg-amber-400" style={{ width: `${pct(stats.attempting)}%` }} />
      </span>
      <span className="mt-1 block text-[11px] tabular-nums text-slate-500">
        クリア {stats.cleared} ・ 挑戦中 {stats.attempting} ・ 未着手 {stats.untouched} / 全{" "}
        {stats.total} 人
      </span>
    </span>
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
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      await api.createAssignment(orgId, {
        kind: "official",
        problemRef,
        ...(target ? { userId: target } : {}),
        // <input type="date"> は "2026-12-31"。その日の終わりを期限とする
        ...(dueAt ? { dueAt: new Date(`${dueAt}T23:59:59`).toISOString() } : {}),
        ...(note ? { note } : {}),
      });
      setNote("");
      setDueAt("");
      await reload();
      setMessage("課題を割り当てました。");
    } catch {
      setMessage("割り当てできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (assignmentId: string) => {
    setBusy(true);
    try {
      await api.deleteAssignment(orgId, assignmentId);
      await reload();
      setMessage("課題を取り消しました。");
    } catch {
      setMessage("取り消せませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <Notice
          tone={message.includes("ません") ? "warning" : "success"}
          role="status"
          data-testid="assignment-message"
        >
          {message}
        </Notice>
      )}

      <ul className="flex flex-col gap-2" data-testid="assignment-list">
        {assignments.map((a) => {
          const problem = findProblem(a.problemRef);
          const assignee = members.find((m) => m.userId === a.userId);
          return (
            <li
              key={a.id}
              data-testid={`assignment-${a.id}`}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Icon name={a.userId ? "users" : "grid"} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  to={
                    a.kind === "official"
                      ? `/problems/${a.problemRef}`
                      : `/community/${a.problemRef}`
                  }
                  className="block truncate text-sm font-semibold text-slate-900 underline-offset-4 hover:underline"
                >
                  {problem?.title ?? a.problemRef}
                </Link>
                <span className="block truncate text-xs text-slate-500">
                  {a.userId ? `${assignee?.name ?? "メンバー"} に` : "全員に"}
                  {a.note ? ` ・ ${a.note}` : ""}
                </span>
                <DueBadge dueAt={a.dueAt} assignmentId={a.id} />
                {a.stats && <AchievementBar stats={a.stats} assignmentId={a.id} />}
              </span>
              {isAdmin && (
                <Button
                  tone="danger"
                  size="sm"
                  data-testid={`unassign-${a.id}`}
                  disabled={busy}
                  onClick={() => void unassign(a.id)}
                >
                  取り消す
                </Button>
              )}
            </li>
          );
        })}
        {assignments.length === 0 && (
          <li>
            <EmptyState
              icon="calendar"
              data-testid="assignment-empty"
              title="割り当てられた課題はありません。"
              body={isAdmin ? "下から問題を選んで割り当てられます。" : undefined}
            />
          </li>
        )}
      </ul>

      {isAdmin && (
        <Card padded className="flex flex-col gap-3">
          <h3 className="text-base font-bold text-slate-900">課題を割り当てる</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="割り当てる問題" className="sm:col-span-2">
              <select
                value={problemRef}
                onChange={(e) => setProblemRef(e.target.value)}
                data-testid="assign-problem"
                aria-label="割り当てる問題"
                className={selectClass()}
              >
                {sortedProblems().map((p) => (
                  <option key={p.id} value={p.id}>
                    {STAGE_LABELS[p.stage]} / {MODE_LABELS[p.mode]} ・ {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="割り当て先">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                data-testid="assign-target"
                aria-label="割り当て先"
                className={selectClass()}
              >
                <option value="">組織の全員</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="期限(任意)">
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                data-testid="assign-due"
                className={inputClass()}
              />
            </Field>
            <Field label="ひとこと(任意)" className="sm:col-span-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="例: 今週中に"
                data-testid="assign-note"
                aria-label="ひとこと"
                className={inputClass()}
              />
            </Field>
          </div>
          <Button
            icon="calendar"
            className="self-start"
            data-testid="assign-submit"
            disabled={busy || !problemRef}
            onClick={() => void assign()}
          >
            割り当てる
          </Button>
        </Card>
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

  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="stuck-panel">
      <p className="text-xs text-slate-500">
        メンバー {data.memberCount} 人のうち、まだクリアできていない人が多い問題です。
      </p>
      {data.stuck.length === 0 ? (
        <EmptyState icon="check" data-testid="stuck-empty" title="止まっている問題はありません。" />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {data.stuck.map((s) => (
              <li
                key={s.problemId}
                data-testid={`stuck-${s.problemId}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                  {findProblem(s.problemId)?.title ?? s.problemId}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  <Badge tone="amber">{s.stuckUsers} 人</Badge>
                  失敗 {s.failures} 回
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

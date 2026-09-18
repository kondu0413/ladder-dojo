import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { AppShell } from "../components/AppShell.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  inputClass,
  Notice,
  PageHeader,
  SectionTitle,
  Skeleton,
} from "../components/ui.js";
import { ApiError, api, type OrgSummary } from "../lib/api.js";
import { useProgress } from "../lib/progress-context.jsx";

/** 自分が所属する組織の一覧・作成・参加(SPEC.md §3.8) */
export function OrgListPage() {
  const { user, loading } = useProgress();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      return;
    }
    try {
      setOrgs((await api.listOrgs()).orgs);
    } catch {
      setMessage("組織を読み込めませんでした。");
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      await api.createOrg(name.trim());
      setName("");
      await reload();
      setMessage("組織を作りました。");
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.code === "quota_exceeded"
          ? "所属できる組織の上限に達しています。"
          : "組織を作れませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await api.joinOrg(code.trim());
      setCode("");
      await reload();
      setMessage(res.joined ? `${res.org.name} に参加しました。` : "すでに参加しています。");
    } catch {
      setMessage("招待コードが見つからないか、期限切れです。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell width="wide">
      <PageHeader
        title="組織"
        lead="会社やチームで使う単位です。管理者はメンバーの学習状況を見て、課題を割り当てられます。"
      />

      {/* セッションの確認中は「ログインしてください」を出さない。ログイン済みの人に一瞬見えてしまう */}
      {loading && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}

      {!loading && !user && (
        <EmptyState
          icon="lock"
          title="組織を使うにはログインしてください。"
          body="右上の「Google でログイン」から入れます。ログインすると、組織の作成と参加ができます。"
        />
      )}

      {message && (
        <Notice
          tone={message.includes("ません") ? "warning" : "success"}
          role="status"
          data-testid="org-message"
        >
          {message}
        </Notice>
      )}

      {user && (
        <>
          <section className="flex flex-col gap-2">
            <SectionTitle icon="factory" count={orgs.length > 0 ? `${orgs.length} 件` : undefined}>
              所属している組織
            </SectionTitle>
            <ul className="grid gap-2 sm:grid-cols-2" data-testid="org-list">
              {orgs.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/orgs/${o.id}`}
                    data-testid={`org-${o.id}`}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card transition-[box-shadow,border-color] hover:border-slate-300 hover:shadow-float"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-amber-300">
                      <Icon name="factory" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                      {o.name}
                    </span>
                    <Badge tone={o.role === "admin" ? "navy" : "slate"}>
                      {o.role === "admin" ? "管理者" : "メンバー"}
                    </Badge>
                    <Icon
                      name="chevronRight"
                      className="h-4 w-4 text-slate-300 group-hover:text-slate-500"
                    />
                  </Link>
                </li>
              ))}
              {orgs.length === 0 && (
                <li className="sm:col-span-2">
                  <EmptyState
                    icon="users"
                    data-testid="org-empty"
                    title="まだどの組織にも入っていません。"
                    body="下から作るか、招待コードで参加できます。"
                  />
                </li>
              )}
            </ul>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Card padded className="flex flex-col gap-3">
              <SectionTitle as="h2" icon="plus">
                組織を作る
              </SectionTitle>
              <Field label="組織の名前" hint="作った人が管理者になります。">
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 60))}
                    placeholder="例: 第 2 製造課"
                    data-testid="org-name"
                    aria-label="組織の名前"
                    className={inputClass("min-w-0 flex-1")}
                  />
                  <Button
                    data-testid="org-create"
                    disabled={busy || name.trim().length === 0}
                    onClick={() => void create()}
                  >
                    作る
                  </Button>
                </div>
              </Field>
            </Card>

            <Card padded className="flex flex-col gap-3">
              <SectionTitle as="h2" icon="logIn">
                招待コードで参加する
              </SectionTitle>
              <Field label="招待コード" hint="管理者から受け取った 12 桁のコードを入れてください。">
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.slice(0, 64))}
                    placeholder="招待コード"
                    data-testid="org-code"
                    aria-label="招待コード"
                    className={inputClass("min-w-0 flex-1 font-mono")}
                  />
                  <Button
                    tone="secondary"
                    data-testid="org-join"
                    disabled={busy || code.trim().length < 6}
                    onClick={() => void join()}
                  >
                    参加
                  </Button>
                </div>
              </Field>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}

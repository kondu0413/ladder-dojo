import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { disablePush, enablePush, type PushState, readPushState } from "../lib/push.js";
import { Button, Icon } from "./ui.js";

const STATUS: Record<PushState | "loading", string> = {
  loading: "確認中…",
  unsupported: "このブラウザは通知に対応していません。",
  unavailable: "この環境では通知を用意できていません。",
  denied: "通知がブラウザで拒否されています。サイトの設定から許可すると使えます。",
  off: "通知は OFF です。",
  on: "通知は ON です(この端末に届きます)。",
};

/**
 * 課題の通知の設定(S-045)。組織の「課題」タブに置く。
 * 毎朝 9 時に、期限が近い課題と新しい課題をこの端末へ知らせる。
 */
export function PushSettings() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    readPushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unavailable"));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
        setMessage("通知を止めました。");
      } else {
        const next = await enablePush();
        setState(next);
        setMessage(
          next === "on"
            ? "この端末に通知します。毎朝 9 時に、期限が近い課題と新しい課題をお知らせします。"
            : next === "denied"
              ? "ブラウザで通知が拒否されました。サイトの設定から許可すると使えます。"
              : "通知を登録できませんでした。",
        );
      }
    } catch {
      setMessage("この端末では通知を登録できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const r = await api.sendTestPush();
      setMessage(
        r.sent > 0
          ? "テスト通知を送りました。届かない場合は端末の通知設定を確かめてください。"
          : "送れる端末がありませんでした。いったん OFF にしてから ON にし直してください。",
      );
      if (r.sent === 0) setState("off");
    } catch {
      setMessage("テスト通知を送れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const canToggle = state === "on" || state === "off";

  return (
    <section
      data-testid="push-settings"
      className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="theme-fixed flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-amber-300">
          <Icon name="bell" className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-sm font-bold text-slate-900">課題のお知らせ</h3>
          <p className="text-xs text-slate-500" data-testid="push-status" data-state={state}>
            {STATUS[state]}
          </p>
        </div>
        <div className="flex gap-2">
          {state === "on" && (
            <Button
              tone="secondary"
              size="sm"
              data-testid="push-test"
              disabled={busy}
              onClick={() => void sendTest()}
            >
              テスト通知を送る
            </Button>
          )}
          <Button
            tone={state === "on" ? "secondary" : "primary"}
            size="sm"
            icon={state === "on" ? "close" : "bell"}
            data-testid="push-toggle"
            disabled={busy || !canToggle}
            onClick={() => void toggle()}
          >
            {state === "on" ? "通知を止める" : "この端末で受け取る"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        毎朝 9 時に、期限が 3 日以内の課題と新しく割り当てられた課題をまとめて 1
        通お知らせします。クリア済みの課題は含みません。iPhone / iPad
        は、ホーム画面に追加したアプリからだけ受け取れます。
      </p>
      {message && (
        <p role="status" className="text-xs font-medium text-slate-700" data-testid="push-message">
          {message}
        </p>
      )}
    </section>
  );
}

import type { Circuit } from "@ladder-dojo/core";
import { useEffect, useState } from "react";
import { shareUrl } from "../lib/share.js";
import { Button, inputClass } from "./ui.js";

/**
 * 回路の共有(S-039)。押すとリンクが出て、コピーや端末の共有機能で送れる。
 * リンクには回路そのものが入っているので、ログインも保存も要らない。
 * `LadderEditor` の `extra` に置く前提(折り返しの行の中で、パネルは 1 行を占める)。
 */
export function ShareButton({ circuit, title }: { circuit: Circuit; title?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"ok" | "ng" | undefined>(undefined);
  // 開いている間は、回路を編集するたびにリンクも追いかける
  const url = open ? shareUrl(circuit, title) : "";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(undefined), 2_500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("ng");
    }
  };

  // 端末の共有シート(スマホの LINE やメールなど)。無い環境ではボタンを出さない
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async () => {
    try {
      await navigator.share({ title: title?.trim() || "ラダー道場の回路", url });
    } catch {
      // 途中でやめただけ。何もしない
    }
  };

  return (
    <>
      <Button
        tone="secondary"
        size="sm"
        icon="share"
        data-testid="share-open"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        共有
      </Button>
      {open && (
        <div
          data-testid="share-panel"
          className="rise-in flex basis-full flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-card"
        >
          <p className="text-xs leading-relaxed text-slate-600">
            このリンクを開くと、同じ回路がサンドボックスに出ます。回路はリンクの中に入っていて、
            サーバーには保存されません。
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={url}
              data-testid="share-url"
              aria-label="共有リンク"
              onFocus={(e) => e.currentTarget.select()}
              className={inputClass("min-w-0 flex-1 basis-48 font-mono text-xs")}
            />
            <Button icon="copy" data-testid="share-copy" onClick={() => void copy()}>
              {copied === "ok" ? "コピーしました" : "コピー"}
            </Button>
            {canShare && (
              <Button tone="secondary" icon="external" onClick={() => void share()}>
                送る
              </Button>
            )}
          </div>
          <p role="status" className="min-h-4 text-xs text-slate-500">
            {copied === "ok" && "リンクをコピーしました。"}
            {copied === "ng" && (
              <span className="text-rose-700">
                コピーできませんでした。リンクを選んで手でコピーしてください。
              </span>
            )}
          </p>
        </div>
      )}
    </>
  );
}

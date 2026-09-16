import { useOnline } from "../hooks/useOnline.js";

/**
 * オフラインの案内(改善候補 6)。
 *
 * つながっていないときだけ出す。何ができて何ができないかをその場で伝える。
 * 黙って保存に失敗するより、先に言っておくほうが親切なので。
 */
export function OfflineNotice() {
  const online = useOnline();
  if (online) return null;

  return (
    <p
      data-testid="offline-notice"
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      オフラインです。公式問題とサンドボックスはこのまま使えます。保存・投稿・ランキングは、つながってからになります。
    </p>
  );
}

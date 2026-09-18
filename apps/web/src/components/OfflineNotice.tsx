import { useOnline } from "../hooks/useOnline.js";
import { Notice } from "./ui.js";

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
    <Notice tone="warning" role="status" data-testid="offline-notice">
      オフラインです。公式問題とサンドボックスはこのまま使えます。保存・投稿・ランキングは、つながってからになります。
    </Notice>
  );
}

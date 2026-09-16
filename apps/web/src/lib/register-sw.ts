/**
 * Service Worker の登録(改善候補 6 / DECISIONS.md S-013)。
 *
 * 開発サーバー(Vite)では登録しない。キャッシュが挟まると、直したはずの画面が
 * 出てこなくて悩むことになるため。ビルドしたものを配信するときだけ登録する。
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // Vite の dev サーバーでは import.meta.env.DEV が true
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    // 失敗しても学習には困らないので、黙って諦める
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        // 初回訪問では、アセットの読み込みが登録より先に終わっている。
        // fetch では拾えないので、このページが使っているものを教えてやる
        registration.active?.postMessage({ type: "cache-assets", urls: assetUrls() });
      })
      .catch(() => undefined);
  });
}

/** このページが読み込んでいる同一オリジンのアセット */
function assetUrls(): string[] {
  const urls = new Set<string>();
  for (const el of document.querySelectorAll("script[src]")) {
    if (el instanceof HTMLScriptElement) urls.add(el.src);
  }
  for (const el of document.querySelectorAll("link[href]")) {
    if (!(el instanceof HTMLLinkElement)) continue;
    // 先読みとスタイルシートだけ。manifest と icon は Service Worker 側で持っている
    if (el.rel === "stylesheet" || el.rel === "modulepreload" || el.rel === "preload") {
      urls.add(el.href);
    }
  }
  return [...urls].filter((url) => {
    try {
      return new URL(url).origin === location.origin;
    } catch {
      return false;
    }
  });
}

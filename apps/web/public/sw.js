/**
 * Service Worker(改善候補 6: オフライン対応 / DECISIONS.md S-013)。
 *
 * シミュレータ・判定・公式問題はすべてクライアント側にある(SPEC.md §6)ので、
 * 画面とアセットさえ手元にあれば、未ログインの学習はオフラインで完結する。
 * 現場のスマホで電波が悪い状況を想定している。
 *
 * 方針:
 * - `/api/*` は絶対にキャッシュしない。素通しする。
 *   進捗も提出も投げっぱなしで送っているので(S-002 / S-007)、失敗しても学習は止まらない
 * - `/assets/*` は内容ハッシュ付きのファイル名なので、中身が変わることはない。
 *   キャッシュ優先で即返し、裏で取り直す
 * - 画面の遷移(navigate)はネットワーク優先。デプロイ直後に古い画面を掴まないため。
 *   つながらなければキャッシュした index.html を返す
 *
 * ビルド時のファイル一覧は持たない。初回訪問で通った分を貯めるだけにして、
 * ビルド設定を増やさずに済ませている。つまり**2 回目の訪問からオフラインで動く**。
 */

/** キャッシュ名。中身の持ち方を変えたら上げる(古いものは activate で消える) */
const CACHE = "ladder-dojo-v1";

/** 最初から入れておくもの。これだけあれば SPA は起動できる */
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  // ホーム画面のアイコン。圏外で追加されても出るように先に貯めておく
  "/apple-touch-icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 1 つでも失敗したら install ごと落ちるので、個別に試して落とさない
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/**
 * 画面から「このページが使っているアセット」を教えてもらって貯める。
 *
 * いちばん最初の訪問では、アセットの読み込みが Service Worker の登録より先に
 * 終わってしまうので、fetch では拾えない。ここで拾っておかないと、
 * 「1 回開いてすぐ圏外」の人がオフラインで白い画面になる。
 *
 * ビルド時のファイル一覧を持たずに済ませるための工夫でもある(S-013)。
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type !== "cache-assets" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(data.urls.map((url) => cache.add(url)));
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 他のドメイン(Google ログインなど)には触らない
  if (url.origin !== self.location.origin) return;
  // API は素通し。古い進捗やランキングを見せると混乱するだけ
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

/** つながればそれを使い、つながらなければキャッシュした画面を返す */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put("/index.html", res.clone());
    }
    return res;
  } catch {
    const cached = (await caches.match("/index.html")) ?? (await caches.match("/"));
    if (cached) return cached;
    return new Response("オフラインです。一度オンラインで開くと、次からは使えます。", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

/** キャッシュにあれば即返し、裏で取り直す */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  const fetching = fetch(request)
    .then(async (res) => {
      if (res.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => undefined);

  if (cached) {
    // 取り直しは待たない。失敗しても放っておく
    void fetching;
    return cached;
  }
  const fresh = await fetching;
  if (fresh) return fresh;
  return new Response("", { status: 504 });
}

// ---------------------------------------------------------------------------
// Web Push(S-045)。課題の期限と新しい課題を、毎朝サーバーが送ってくる
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = { title: "ラダー道場", body: "", url: "/orgs", tag: "ladder-dojo" };
  try {
    data = { ...data, ...(event.data ? event.data.json() : {}) };
  } catch {
    // 本文が JSON でなければ既定の文面で出す
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // 同じ tag の通知は置き換わる(毎朝の通知が溜まらない)
      tag: data.tag,
      data: { url: data.url },
      lang: "ja",
    }),
  );
});

/** 通知を押したら、その画面を開く。すでに開いているタブがあればそれを使う */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/** プッシュサービス側で購読が作り直されたら、新しいものをサーバーに登録し直す */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription?.options?.applicationServerKey;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    })().catch(() => undefined),
  );
});

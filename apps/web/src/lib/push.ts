import { api } from "./api.js";

/**
 * Web Push の購読(S-045)。
 *
 * 通知そのものはサーバーの Cron が送る。ここでやるのは
 * 「この端末で受け取る」と決めたときに、ブラウザの購読を作ってサーバーに預けることだけ。
 * 外部サービスは使わないので 0 円。
 */
export type PushState =
  /** ブラウザが対応していない */
  | "unsupported"
  /** サーバーに鍵が無い(開発環境など) */
  | "unavailable"
  /** ブラウザで通知が拒否されている */
  | "denied"
  | "off"
  | "on";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  return (await navigator.serviceWorker.getRegistration("/")) ?? undefined;
}

/** いまの状態。サーバー側に残っている購読だけを ON と数える(別アカウントに付け替わることがある) */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const { publicKey } = await api.pushPublicKey();
  if (!publicKey) return "unavailable";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "off";
  const { endpoints } = await api.listPushSubscriptions();
  return endpoints.includes(sub.endpoint) ? "on" : "off";
}

/** 通知を受け取る。許可を求め、購読を作ってサーバーに預ける */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { publicKey } = await api.pushPublicKey();
  if (!publicKey) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  const reg = await registration();
  // Service Worker が無い(開発サーバー)なら受け取る手段が無い
  if (!reg) return "unavailable";
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toApplicationServerKey(publicKey),
    }));
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("購読の形式が違います");
  await api.subscribePush({ endpoint: json.endpoint, keys: { p256dh, auth } });
  return "on";
}

/** 通知を止める。サーバーの登録を消してから、ブラウザの購読も解く */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe();
}

/** base64url の公開鍵を、購読 API が受け取る形にする */
function toApplicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const normalized = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

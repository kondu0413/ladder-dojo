/**
 * Web Push の送信(S-045)。外部ライブラリを使わず、Workers の WebCrypto だけで組む。
 *
 * - 認証: VAPID(RFC 8292)。ES256 の JWT を自前で作る
 * - 本文の暗号化: RFC 8291 + RFC 8188 の aes128gcm。ECDH → HKDF → AES-128-GCM
 *
 * 使うのは Cloudflare Workers に入っている crypto.subtle だけなので、
 * 費用はプッシュサービスへの fetch 1 回ぶん(Workers Free のサブリクエスト)で済む。
 */

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** VAPID の鍵。公開鍵は 65 バイトの生の点(0x04 + x + y)、秘密鍵は 32 バイト。どちらも base64url */
export type VapidKeys = { publicKey: string; privateKey: string };

export type PushSendResult = {
  ok: boolean;
  status: number;
  /** 購読が無効(404 / 410)。行を消してよい */
  gone: boolean;
};

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** 生の公開鍵(0x04 + x + y)を JWK の x / y に分ける */
function splitPublicKey(publicKey: string): { x: string; y: string } {
  const raw = b64urlDecode(publicKey);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("VAPID 公開鍵の形式が違います");
  return { x: b64urlEncode(raw.slice(1, 33)), y: b64urlEncode(raw.slice(33, 65)) };
}

async function importVapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const { x, y } = splitPublicKey(keys.publicKey);
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d: keys.privateKey },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** VAPID の Authorization ヘッダ。JWT の有効期限は 12 時間(上限 24 時間) */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now = Date.now(),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    utf8(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject })),
  );
  const input = `${header}.${claims}`;
  const key = await importVapidPrivateKey(keys);
  // WebCrypto の ECDSA 署名は r || s の生の 64 バイト。JWS が求める形そのもの
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(input)),
  );
  return `vapid t=${input}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** 1 レコードに収める本文の上限(RFC 8188 の rs は 4096 にする) */
const RECORD_SIZE = 4096;
export const MAX_PAYLOAD_BYTES = 3_800;

/**
 * 本文を aes128gcm で暗号化する(RFC 8291)。
 *
 * 返すのはヘッダ(salt 16 + rs 4 + idlen 1 + サーバ公開鍵 65)と暗号文をつないだもの。
 * テストで復号できるよう、サーバ側の鍵と salt を外から渡せる
 */
export async function encryptPayload(
  subscription: PushSubscriptionInput,
  plaintext: Uint8Array,
  options: { serverKeys?: CryptoKeyPair; salt?: Uint8Array } = {},
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error("本文が大きすぎます");
  const clientPublic = b64urlDecode(subscription.keys.p256dh);
  const authSecret = b64urlDecode(subscription.keys.auth);
  if (clientPublic.length !== 65 || authSecret.length !== 16) {
    throw new Error("購読の鍵の形式が違います");
  }

  // workers-types は generateKey の戻りを CryptoKey | CryptoKeyPair の合併にしているので絞る
  const server =
    options.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const serverPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", server.publicKey)) as ArrayBuffer,
  );
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // workers-types では public が $public と書かれているが、実行時の名前は public
  const ecdh = { name: "ECDH", public: clientKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, server.privateKey, 256));

  // RFC 8291 §3.3: IKM = HKDF(auth, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public)
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(utf8("WebPush: info\0"), clientPublic, serverPublic),
    32,
  );
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // 1 レコードだけなので、区切りは 0x02(最後のレコード)。詰め物は入れない
  const record = concat(plaintext, new Uint8Array([2]));
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);
  return concat(salt, rs, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

/** プッシュサービスへ 1 通送る。失敗しても投げない(呼ぶ側が件数を数える) */
export async function sendWebPush(
  subscription: PushSubscriptionInput,
  payload: string,
  keys: VapidKeys,
  subject: string,
): Promise<PushSendResult> {
  const body = await encryptPayload(subscription, utf8(payload));
  const authorization = await vapidAuthorization(subscription.endpoint, keys, subject);
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "normal",
    },
    body,
  });
  // 本文は要らない。読み捨てて接続を返す
  await res.body?.cancel().catch(() => undefined);
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

/** 通知の中身。Service Worker がこの形で受け取る */
export type PushMessage = {
  title: string;
  body: string;
  /** 押したときに開く画面(同一オリジンのパス) */
  url: string;
  /** 同じ tag の通知は置き換わる(毎朝の通知が溜まらない) */
  tag: string;
};

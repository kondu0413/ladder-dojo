import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import type { Env } from "../src/env.js";
import { composeMessage, sendDueReminders } from "../src/push/reminders.js";
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  utf8,
  vapidAuthorization,
} from "../src/push/webpush.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * Web Push(S-045)。外部ライブラリ無し・0 円で、課題の期限と新しい課題を朝に知らせる。
 *
 * プッシュサービスには繋がないので、fetch を差し替えて「何を送ったか」を見る。
 * 本文は RFC 8291 の手順を逆にたどって復号し、中身まで確かめる。
 */

type Vapid = { publicKey: string; privateKey: string; verifyKey: CryptoKey };

async function generateVapid(): Promise<Vapid> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(b64urlDecode(jwk.x as string), 1);
  raw.set(b64urlDecode(jwk.y as string), 33);
  return {
    publicKey: b64urlEncode(raw),
    privateKey: jwk.d as string,
    verifyKey: pair.publicKey,
  };
}

function withVapid(vapid: Vapid): Env {
  return { ...env, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey };
}

/** ブラウザ側の購読(鍵はブラウザが作る)。復号できるように秘密鍵も持っておく */
async function makeClient(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publicRaw = new Uint8Array(
    (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
  );
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    subscription: { endpoint, keys: { p256dh: b64urlEncode(publicRaw), auth: b64urlEncode(auth) } },
    publicRaw,
    auth,
    privateKey: pair.privateKey,
  };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** RFC 8291 をブラウザ側の立場で逆にたどる */
async function decrypt(client: Awaited<ReturnType<typeof makeClient>>, body: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20] as number;
  const serverPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);

  const serverKey = await crypto.subtle.importKey(
    "raw",
    serverPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = { name: "ECDH", public: serverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, client.privateKey, 256));
  const ikm = await hkdf(
    client.auth,
    shared,
    concat(utf8("WebPush: info\0"), client.publicRaw, serverPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
  );
  // 末尾の区切り(0x02)を外す
  expect(record[record.length - 1]).toBe(2);
  return new TextDecoder().decode(record.slice(0, -1));
}

type Sent = { url: string; headers: Headers; body: Uint8Array };

/** fetch を差し替えて、プッシュサービスに送った中身を貯める */
function stubPushService(status = 201): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as ArrayBuffer | Uint8Array;
      sent.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: body instanceof Uint8Array ? body : new Uint8Array(body),
      });
      return new Response(null, { status });
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VAPID と本文の暗号化", () => {
  it("Authorization ヘッダの JWT は公開鍵で検証でき、aud / sub / exp が入っている", async () => {
    const vapid = await generateVapid();
    const header = await vapidAuthorization(
      "https://push.example.test/send/abc",
      vapid,
      "https://ladder-dojo.example",
      1_800_000_000_000,
    );
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, jwt, k] = m as RegExpExecArray;
    expect(k).toBe(vapid.publicKey);
    const [h, c, s] = (jwt as string).split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h as string)))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c as string)));
    expect(claims).toEqual({
      aud: "https://push.example.test",
      exp: 1_800_000_000 + 12 * 3600,
      sub: "https://ladder-dojo.example",
    });
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.verifyKey,
      b64urlDecode(s as string),
      utf8(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it("aes128gcm で暗号化した本文を、ブラウザ側の手順で復号できる", async () => {
    const client = await makeClient("https://push.example.test/send/1");
    const body = await encryptPayload(client.subscription, utf8("こんにちは"));
    expect(await decrypt(client, body)).toBe("こんにちは");
    // 毎回 salt と鍵が違うので、同じ本文でも暗号文は変わる
    const again = await encryptPayload(client.subscription, utf8("こんにちは"));
    expect(b64urlEncode(again)).not.toBe(b64urlEncode(body));
  });

  it("大きすぎる本文と壊れた鍵は拒む", async () => {
    const client = await makeClient("https://push.example.test/send/2");
    await expect(encryptPayload(client.subscription, new Uint8Array(4000))).rejects.toThrow();
    await expect(
      encryptPayload({ ...client.subscription, keys: { p256dh: "AAAA", auth: "AAAA" } }, utf8("x")),
    ).rejects.toThrow();
  });
});

async function subscribe(user: TestUser, subscription: unknown) {
  return app.request(
    "/api/push/subscriptions",
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify(subscription) },
    env,
  );
}

async function listEndpoints(user: TestUser): Promise<string[]> {
  const res = await app.request("/api/push/subscriptions", { headers: authHeaders(user) }, env);
  expect(res.status).toBe(200);
  return ((await res.json()) as { endpoints: string[] }).endpoints;
}

describe("購読の API", () => {
  it("公開鍵は鍵が無ければ null、あればそのまま返す", async () => {
    const res = await app.request("/api/push/public-key", {}, env);
    expect(await res.json()).toEqual({ publicKey: null });
    const vapid = await generateVapid();
    const res2 = await app.request("/api/push/public-key", {}, withVapid(vapid));
    expect(await res2.json()).toEqual({ publicKey: vapid.publicKey });
  });

  it("未ログインでは購読できない", async () => {
    const client = await makeClient("https://push.example.test/send/anon");
    const res = await app.request(
      "/api/push/subscriptions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(client.subscription),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("購読を登録・一覧・削除できる。同じ endpoint は 1 行にまとまる", async () => {
    const user = await signUp("push");
    const client = await makeClient("https://push.example.test/send/dup");
    expect((await subscribe(user, client.subscription)).status).toBe(201);
    expect((await subscribe(user, client.subscription)).status).toBe(201);
    expect(await listEndpoints(user)).toEqual([client.subscription.endpoint]);

    const res = await app.request(
      "/api/push/subscriptions",
      {
        method: "DELETE",
        headers: jsonHeaders(user),
        body: JSON.stringify({ endpoint: client.subscription.endpoint }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await listEndpoints(user)).toEqual([]);
  });

  it("http の endpoint や壊れた鍵は 400", async () => {
    const user = await signUp("push-bad");
    const client = await makeClient("http://push.example.test/insecure");
    expect((await subscribe(user, client.subscription)).status).toBe(400);
    expect(
      (await subscribe(user, { endpoint: "https://x.test/1", keys: { p256dh: "a", auth: "b" } }))
        .status,
    ).toBe(400);
  });

  it("端末は 5 つまで。増えたら古いものから消える", async () => {
    const user = await signUp("push-many");
    for (let i = 0; i < 6; i++) {
      const client = await makeClient(`https://push.example.test/send/many-${i}`);
      expect((await subscribe(user, client.subscription)).status).toBe(201);
    }
    const endpoints = await listEndpoints(user);
    expect(endpoints).toHaveLength(5);
    expect(endpoints).not.toContain("https://push.example.test/send/many-0");
  });

  it("別のアカウントが同じ端末で購読すると、持ち主が付け替わる", async () => {
    const a = await signUp("push-a");
    const b = await signUp("push-b");
    const client = await makeClient("https://push.example.test/send/shared");
    await subscribe(a, client.subscription);
    await subscribe(b, client.subscription);
    expect(await listEndpoints(a)).toEqual([]);
    expect(await listEndpoints(b)).toEqual([client.subscription.endpoint]);
  });

  it("テスト通知は自分の端末に届き、無効な端末は消える", async () => {
    const vapid = await generateVapid();
    const user = await signUp("push-test");
    const client = await makeClient("https://push.example.test/send/test");
    await subscribe(user, client.subscription);

    const sent = stubPushService(201);
    const res = await app.request(
      "/api/push/test",
      { method: "POST", headers: authHeaders(user) },
      withVapid(vapid),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, removed: 0 });
    expect(sent).toHaveLength(1);
    const [req] = sent as [Sent];
    expect(req.url).toBe(client.subscription.endpoint);
    expect(req.headers.get("content-encoding")).toBe("aes128gcm");
    expect(req.headers.get("ttl")).toBe("86400");
    expect(req.headers.get("authorization")).toMatch(/^vapid t=.+, k=.+$/);
    const message = JSON.parse(await decrypt(client, req.body)) as { body: string; tag: string };
    expect(message.body).toContain("テスト通知");
    expect(message.tag).toBe("test");

    // プッシュサービスが 410 を返したら、その購読はもう使えない
    vi.unstubAllGlobals();
    stubPushService(410);
    const res2 = await app.request(
      "/api/push/test",
      { method: "POST", headers: authHeaders(user) },
      withVapid(vapid),
    );
    expect(await res2.json()).toEqual({ sent: 0, removed: 1 });
    expect(await listEndpoints(user)).toEqual([]);
  });

  it("鍵が無い環境ではテスト通知は 503", async () => {
    const user = await signUp("push-nokey");
    const res = await app.request(
      "/api/push/test",
      { method: "POST", headers: authHeaders(user) },
      env,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "push_unavailable" });
  });
});

// ---------------------------------------------------------------------------
// 朝の通知
// ---------------------------------------------------------------------------

async function createOrg(admin: TestUser): Promise<string> {
  const res = await app.request(
    "/api/orgs",
    { method: "POST", headers: jsonHeaders(admin), body: JSON.stringify({ name: "通知テスト" }) },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { org: { id: string } }).org.id;
}

async function joinOrg(admin: TestUser, orgId: string, member: TestUser) {
  const inv = await app.request(
    `/api/orgs/${orgId}/invites`,
    { method: "POST", headers: authHeaders(admin) },
    env,
  );
  const { code } = ((await inv.json()) as { invite: { code: string } }).invite;
  const res = await app.request(
    "/api/orgs/join",
    { method: "POST", headers: jsonHeaders(member), body: JSON.stringify({ code }) },
    env,
  );
  expect(res.status).toBe(200);
}

async function assign(admin: TestUser, orgId: string, body: Record<string, unknown>) {
  const res = await app.request(
    `/api/orgs/${orgId}/assignments`,
    {
      method: "POST",
      headers: jsonHeaders(admin),
      body: JSON.stringify({ kind: "official", ...body }),
    },
    env,
  );
  expect(res.status).toBe(201);
}

describe("課題の通知(毎朝)", () => {
  it("期限が近い課題を、購読しているメンバーに 1 通にまとめて送る", async () => {
    const vapid = await generateVapid();
    const admin = await signUp("remind-admin");
    const member = await signUp("remind-member");
    const orgId = await createOrg(admin);
    await joinOrg(admin, orgId, member);
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    await assign(admin, orgId, { problemRef: "selfhold-read-0", dueAt: tomorrow.toISOString() });
    await assign(admin, orgId, { problemRef: "selfhold-read-1" });

    const client = await makeClient(`https://push.example.test/send/remind-${orgId}`);
    await subscribe(member, client.subscription);
    const sent = stubPushService(201);

    const result = await sendDueReminders(withVapid(vapid), now);
    expect(result).toEqual({ sent: 1, removed: 0, failed: 0, truncated: 0 });
    const mine = sent.filter((s) => s.url === client.subscription.endpoint);
    expect(mine).toHaveLength(1);
    const message = JSON.parse(await decrypt(client, (mine[0] as Sent).body)) as {
      body: string;
      url: string;
    };
    expect(message.body).toContain("期限が近い課題が 1 件");
    expect(message.body).toContain("明日");
    expect(message.body).toContain("新しい課題が 1 件");
    expect(message.url).toBe(`/orgs/${orgId}`);
  });

  it("クリア済みの課題は知らせない。無効になった購読は消す", async () => {
    const vapid = await generateVapid();
    const admin = await signUp("remind-admin2");
    const member = await signUp("remind-member2");
    const orgId = await createOrg(admin);
    await joinOrg(admin, orgId, member);
    const now = new Date();
    await assign(admin, orgId, {
      problemRef: "timer-read-0",
      userId: member.id,
      dueAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });
    const client = await makeClient(`https://push.example.test/send/cleared-${orgId}`);
    await subscribe(member, client.subscription);

    // クリアしたら、その日の通知には入らない
    const cleared = await app.request(
      "/api/progress/timer-read-0/attempts",
      { method: "POST", headers: jsonHeaders(member), body: JSON.stringify({ passed: true }) },
      env,
    );
    expect(cleared.status).toBe(200);
    // 同じ D1 を他のテストと共有しているので、自分の端末に来ていないことだけを見る
    const sent = stubPushService(201);
    await sendDueReminders(withVapid(vapid), now);
    expect(sent.filter((s) => s.url === client.subscription.endpoint)).toHaveLength(0);

    // まだ残っている課題があって、プッシュサービスが 410 なら購読を消す
    await assign(admin, orgId, { problemRef: "timer-read-1", userId: member.id });
    vi.unstubAllGlobals();
    stubPushService(410);
    const result2 = await sendDueReminders(withVapid(vapid), now);
    expect(result2.removed).toBeGreaterThanOrEqual(1);
    expect(await listEndpoints(member)).toEqual([]);
  });

  it("鍵が無ければ何もしない", async () => {
    const result = await sendDueReminders(env, new Date());
    expect(result).toEqual({ sent: 0, removed: 0, failed: 0, truncated: 0 });
  });

  it("文面: 今日 / 明日 / n 日後、組織が 1 つならその画面へ", () => {
    const now = new Date("2026-09-18T00:00:00Z"); // JST 09:00
    const msg = composeMessage(
      [
        { orgId: "o1", problemRef: "a", kind: "official", dueAt: new Date("2026-09-18T10:00:00Z") },
        { orgId: "o1", problemRef: "b", kind: "official", dueAt: new Date("2026-09-20T10:00:00Z") },
        { orgId: "o1", problemRef: "c", kind: "posted", dueAt: null },
      ],
      now,
    );
    expect(msg?.body).toBe(
      "期限が近い課題が 2 件(いちばん近いのは今日)、新しい課題が 1 件あります。",
    );
    expect(msg?.url).toBe("/orgs/o1");
    const two = composeMessage(
      [
        { orgId: "o1", problemRef: "a", kind: "official", dueAt: new Date("2026-09-19T01:00:00Z") },
        { orgId: "o2", problemRef: "b", kind: "official", dueAt: null },
      ],
      now,
    );
    expect(two?.body).toContain("明日");
    expect(two?.url).toBe("/orgs");
    expect(composeMessage([], now)).toBeUndefined();
  });
});

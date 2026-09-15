import { env } from "cloudflare:test";
import { ladder, no, out } from "@ladder-dojo/core";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * 権限判定のテスト(SPEC.md §2.4 必須 / DECISIONS.md D-017)。
 * D1 に RLS が無いため、ここが唯一の安全網になる。
 */

const circuit = ladder(3).row(no("X0"), out("Y0")).build();

/** 保護ルート(未ログインは全て 401 でなければならない) */
const protectedRoutes: Array<{ method: string; path: string; body?: unknown }> = [
  { method: "GET", path: "/api/progress" },
  { method: "GET", path: "/api/progress/selfhold-1" },
  { method: "POST", path: "/api/progress/selfhold-1/attempts", body: { passed: true } },
  {
    method: "POST",
    path: "/api/progress/merge",
    body: { entries: [{ problemId: "selfhold-write-1", attempts: 1, failures: 0, cleared: true }] },
  },
  { method: "GET", path: "/api/sandbox" },
  { method: "POST", path: "/api/sandbox", body: { title: "t", circuit } },
  { method: "GET", path: "/api/sandbox/some-id" },
  { method: "PUT", path: "/api/sandbox/some-id", body: { title: "t", circuit } },
  { method: "DELETE", path: "/api/sandbox/some-id" },
  {
    method: "POST",
    path: "/api/problems",
    body: { title: "t", spec: "s", circuit, testCases: [], difficulty: 1 },
  },
  { method: "DELETE", path: "/api/problems/some-id" },
  { method: "POST", path: "/api/problems/some-id/attempts", body: { passed: true } },
  { method: "POST", path: "/api/problems/some-id/like" },
  { method: "DELETE", path: "/api/problems/some-id/like" },
  { method: "PUT", path: "/api/problems/some-id/difficulty", body: { difficulty: 3 } },
  { method: "POST", path: "/api/problems/some-id/report", body: { reason: "x" } },
  { method: "GET", path: "/api/orgs" },
  { method: "POST", path: "/api/orgs", body: { name: "org" } },
  { method: "POST", path: "/api/orgs/join", body: { code: "abcdefghijkl" } },
  { method: "GET", path: "/api/orgs/some-org" },
  { method: "POST", path: "/api/orgs/some-org/invites" },
  { method: "GET", path: "/api/orgs/some-org/stuck" },
  { method: "GET", path: "/api/orgs/some-org/assignments" },
  { method: "GET", path: "/api/submissions" },
  {
    method: "POST",
    path: "/api/submissions",
    body: { problemId: "selfhold-1", circuit, passed: true },
  },
];

describe("未ログインのアクセス", () => {
  it.each(protectedRoutes)("$method $path は 401", async ({ method, path, body }) => {
    const init: RequestInit = body
      ? { method, headers: jsonHeaders(), body: JSON.stringify(body) }
      : { method };
    const res = await app.request(path, init, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("全体ランキングは未ログインでも見える(§3.7)", async () => {
    const res = await app.request("/api/rankings?metric=solved&period=weekly", {}, env);
    expect(res.status).toBe(200);
  });

  it("組織内ランキングは未ログインでは 401", async () => {
    const res = await app.request("/api/rankings?metric=solved&orgId=some-org", {}, env);
    expect(res.status).toBe(401);
  });

  it("投稿問題の一覧と取得は、未ログインでも見える(§3.5)", async () => {
    const list = await app.request("/api/problems", {}, env);
    expect(list.status).toBe(200);
    // 存在しない ID は 404(401 ではない)
    const one = await app.request("/api/problems/no-such-id", {}, env);
    expect(one.status).toBe(404);
  });

  it("壊れた Cookie を送っても 401(500 にしない)", async () => {
    const res = await app.request(
      "/api/progress",
      { headers: { cookie: "better-auth.session_token=garbage.signature" } },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("他人のデータには触れない(D-017 方針 3)", () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceCircuitId: string;

  beforeEach(async () => {
    alice = await signUp("alice");
    bob = await signUp("bob");
    const res = await app.request(
      "/api/sandbox",
      {
        method: "POST",
        headers: jsonHeaders(alice),
        body: JSON.stringify({ title: "アリスの回路", circuit }),
      },
      env,
    );
    expect(res.status).toBe(201);
    aliceCircuitId = ((await res.json()) as { circuit: { id: string } }).circuit.id;
  });

  it("他人のサンドボックス回路の取得は 404(存在を漏らさない)", async () => {
    const res = await app.request(
      `/api/sandbox/${aliceCircuitId}`,
      { headers: authHeaders(bob) },
      env,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("他人のサンドボックス回路の更新は 404 で、DB も変わらない", async () => {
    const res = await app.request(
      `/api/sandbox/${aliceCircuitId}`,
      {
        method: "PUT",
        headers: jsonHeaders(bob),
        body: JSON.stringify({ title: "ボブに乗っ取られた", circuit }),
      },
      env,
    );
    expect(res.status).toBe(404);

    const row = await env.DB.prepare("select title, user_id from sandbox_circuits where id = ?")
      .bind(aliceCircuitId)
      .first<{ title: string; user_id: string }>();
    expect(row?.title).toBe("アリスの回路");
    expect(row?.user_id).toBe(alice.id);
  });

  it("他人のサンドボックス回路の削除は 404 で、行は残る", async () => {
    const res = await app.request(
      `/api/sandbox/${aliceCircuitId}`,
      { method: "DELETE", headers: authHeaders(bob) },
      env,
    );
    expect(res.status).toBe(404);

    const row = await env.DB.prepare("select count(*) as n from sandbox_circuits where id = ?")
      .bind(aliceCircuitId)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("一覧には自分のものだけが出る", async () => {
    const res = await app.request("/api/sandbox", { headers: authHeaders(bob) }, env);
    expect(res.status).toBe(200);
    expect((await res.json()) as { circuits: unknown[] }).toEqual({ circuits: [] });

    const mine = await app.request("/api/sandbox", { headers: authHeaders(alice) }, env);
    const body = (await mine.json()) as { circuits: Array<{ id: string }> };
    expect(body.circuits.map((x) => x.id)).toEqual([aliceCircuitId]);
  });

  it("本人なら取得できる(404 が権限由来であることの確認)", async () => {
    const res = await app.request(
      `/api/sandbox/${aliceCircuitId}`,
      { headers: authHeaders(alice) },
      env,
    );
    expect(res.status).toBe(200);
  });
});

describe("ボディの user_id は信用しない(D-017 方針 3)", () => {
  it("進捗の記録は常にセッションのユーザーに紐づく", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    // ボブが「アリスの user_id」を混ぜて送っても、自分の行しか作られない
    const res = await app.request(
      "/api/progress/selfhold-1/attempts",
      {
        method: "POST",
        headers: jsonHeaders(bob),
        body: JSON.stringify({ passed: true, userId: alice.id, user_id: alice.id }),
      },
      env,
    );
    expect(res.status).toBe(200);

    const aliceRows = await env.DB.prepare("select count(*) as n from progress where user_id = ?")
      .bind(alice.id)
      .first<{ n: number }>();
    expect(aliceRows?.n).toBe(0);

    const bobRows = await env.DB.prepare("select count(*) as n from progress where user_id = ?")
      .bind(bob.id)
      .first<{ n: number }>();
    expect(bobRows?.n).toBe(1);
  });

  it("提出履歴も同じ", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    await app.request(
      "/api/submissions",
      {
        method: "POST",
        headers: jsonHeaders(bob),
        body: JSON.stringify({
          problemId: "selfhold-1",
          circuit,
          passed: false,
          userId: alice.id,
        }),
      },
      env,
    );
    const res = await app.request("/api/submissions", { headers: authHeaders(alice) }, env);
    expect((await res.json()) as { submissions: unknown[] }).toEqual({ submissions: [] });
  });
});

describe("入力検証", () => {
  it("壊れた回路 JSON は保存しない", async () => {
    const user = await signUp();
    const res = await app.request(
      "/api/sandbox",
      {
        method: "POST",
        headers: jsonHeaders(user),
        body: JSON.stringify({ title: "壊れた", circuit: { schemaVersion: 1, cols: 3 } }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const row = await env.DB.prepare("select count(*) as n from sandbox_circuits where user_id = ?")
      .bind(user.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("不正な problemId は 404", async () => {
    const user = await signUp();
    const res = await app.request(
      "/api/progress/Bad_Id/attempts",
      { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ passed: true }) },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("ボディが JSON でなければ 400", async () => {
    const user = await signUp();
    const res = await app.request(
      "/api/progress/selfhold-1/attempts",
      { method: "POST", headers: jsonHeaders(user), body: "not json" },
      env,
    );
    expect(res.status).toBe(400);
  });
});

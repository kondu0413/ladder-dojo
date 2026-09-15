import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import type { Env } from "../src/env.js";
import { cookieHeader, jsonHeaders, productionEnv } from "./helpers.js";

async function signUpRequest(target: Env, email: string): Promise<Response> {
  return app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password: "correct-horse-battery", name: email }),
    },
    target,
  );
}

describe("E2E 専用ログイン(D-014)", () => {
  it("E2E 環境ではメール/パスワードでサインアップできる", async () => {
    const res = await signUpRequest(env, "e2e-user@example.test");
    expect(res.status).toBe(200);
    expect(cookieHeader(res)).toContain("better-auth");
  });

  it("本番設定ではメール/パスワードのエンドポイントが無効", async () => {
    const res = await signUpRequest(productionEnv(), "prod-user@example.test");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const row = await env.DB.prepare("select count(*) as n from user where email = ?")
      .bind("prod-user@example.test")
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("本番設定ではサインインも無効", async () => {
    const res = await app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ email: "e2e-user@example.test", password: "correct-horse-battery" }),
      },
      productionEnv(),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("GET /api/me", () => {
  it("未ログインでは 200 で user: null", async () => {
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("ログイン後は自分の情報を返す", async () => {
    const signUp = await signUpRequest(env, "me@example.test");
    const cookie = cookieHeader(signUp);
    const res = await app.request("/api/me", { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } | null };
    expect(body.user?.email).toBe("me@example.test");
  });
});

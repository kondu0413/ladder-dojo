import { env } from "cloudflare:test";
import type { Env } from "../src/env.js";

/**
 * API テストの共通部品。
 *
 * 注意: vitest-pool-workers 0.22 ではテストごとの D1 分離が無く、同じファイル内の
 * テストは同じローカル D1 を共有する。件数を数えるアサーションは必ず `user_id` で
 * 絞ること(`signUp()` はテストごとに別ユーザーを作る)。
 */

/** テスト内で「本番と同じ設定」を作る。E2E 専用ログインが無い状態(D-014 の検証用) */
export function productionEnv(): Env {
  const prod = { ...env, APP_ENV: "production" as const };
  delete (prod as { E2E_AUTH_BYPASS?: string }).E2E_AUTH_BYPASS;
  return prod;
}

export type TestUser = { id: string; email: string; cookie: string };

/** Set-Cookie 群を Cookie ヘッダ 1 本にまとめる */
export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c): c is string => Boolean(c))
    .join("; ");
}

/** 認証つきのリクエストヘッダ */
export function authHeaders(user: TestUser, extra: Record<string, string> = {}): HeadersInit {
  return { cookie: user.cookie, ...extra };
}

export function jsonHeaders(user?: TestUser): HeadersInit {
  return user
    ? { cookie: user.cookie, "content-type": "application/json" }
    : { "content-type": "application/json" };
}

let seq = 0;

/** メール/パスワードでユーザーを作り、セッション Cookie 付きで返す(E2E 専用ログイン、D-014) */
export async function signUp(label = "user"): Promise<TestUser> {
  seq += 1;
  const email = `${label}-${seq}@example.test`;
  const { app } = await import("../src/app.js");
  const res = await app.request(
    "/api/auth/sign-up/email",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: label }),
    },
    env,
  );
  if (!res.ok) throw new Error(`サインアップに失敗: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, email, cookie: cookieHeader(res) };
}

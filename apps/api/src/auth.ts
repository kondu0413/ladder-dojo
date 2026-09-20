import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "./db/schema.js";
import type { Env } from "./env.js";

/**
 * Better Auth のインスタンス(DECISIONS.md D-006 / D-007 / D-014)。
 *
 * - Google ログインのみ。メール送信は行わない
 * - セッションは D1 の `session` テーブル。Cookie(HttpOnly, Secure, SameSite=Lax)で保持
 * - D1 のバインディングはリクエストごとに渡されるため、env ごとに 1 つ作って使い回す
 * - E2E 環境(`E2E_AUTH_BYPASS=1`)でのみメール/パスワードを有効にする。本番には無い
 */
const cache = new WeakMap<Env, Auth>();

export function getAuth(env: Env): Auth {
  const cached = cache.get(env);
  if (cached) return cached;
  const auth = createAuth(env);
  cache.set(env, auth);
  return auth;
}

/** E2E 専用ログインが有効か(本番では常に false) */
export function isE2EAuthBypass(env: Env): boolean {
  return env.E2E_AUTH_BYPASS === "1";
}

/** 署名の秘密。本番で無ければ例外にして、認証を使う要求を止める(fail closed) */
function authSecret(env: Env): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.APP_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET が設定されていません(deploy.yml の secrets を確認)");
  }
  return "dev-secret-not-for-production";
}

function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema, logger: false });
  return betterAuth({
    appName: "ラダー図トレーニング",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    // 本番では deploy.yml が wrangler secret で設定する。本番で未設定なら認証を使う
    // リクエストだけを失敗させる(公開の固定値で署名すると、セッションの Cookie を
    // 誰でも作れてしまう。S-054)。開発と E2E では固定値でよい
    secret: authSecret(env),
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    // D-014: E2E でのみ有効。Google の画面は CI で通せないため
    emailAndPassword: isE2EAuthBypass(env)
      ? { enabled: true, requireEmailVerification: false, autoSignIn: true }
      : { enabled: false },
    session: {
      // D-018: 毎リクエストの session 読み取り・書き込みを減らして D1 の行数を節約する
      cookieCache: { enabled: true, maxAge: 5 * 60 },
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Worker のバインディングと環境変数(wrangler.jsonc と対応) */
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_URL: string;
  APP_ENV: "production" | "e2e" | "development";
  /** E2E 専用環境(env.e2e)にのみ存在する。本番では undefined */
  E2E_AUTH_BYPASS?: string;
  /** 以下はシークレット(CI が登録)。未設定のこともある */
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Web Push の VAPID 鍵(S-045)。CI が初回に生成して登録する。
   * 公開鍵は 65 バイトの生の点、秘密鍵は 32 バイトのスカラー。どちらも base64url
   */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

/** ハンドラから見えるログイン中のユーザー */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/** 組織のメンバーシップ(フェーズ3。requireOrgMember / requireOrgAdmin が設定する) */
export type Membership = { orgId: string; role: "admin" | "member" };

/** Hono のジェネリクスに渡す型 */
export type AppBindings = {
  Bindings: Env;
  Variables: { user: SessionUser; membership: Membership };
};

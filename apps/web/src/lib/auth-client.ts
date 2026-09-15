import { createAuthClient } from "better-auth/react";

/**
 * 認証クライアント(DECISIONS.md D-007 / D-016)。
 * SPA と API が同一オリジンなので baseURL は現在のオリジンでよい。
 */
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost:8787" : window.location.origin,
  basePath: "/api/auth",
});

export const { useSession, signOut } = authClient;

/** Google ログインを開始する(§3.5: ログインは Google のみ) */
export async function signInWithGoogle(callbackURL = "/"): Promise<void> {
  await authClient.signIn.social({ provider: "google", callbackURL });
}

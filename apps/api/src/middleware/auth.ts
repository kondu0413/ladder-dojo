import { createMiddleware } from "hono/factory";
import { getAuth } from "../auth.js";
import type { AppBindings, SessionUser } from "../env.js";

/**
 * 認証ミドルウェア(DECISIONS.md D-017 方針 2)。
 * セッション Cookie を検証し `c.var.user` を設定する。未ログインは 401。
 */
export const requireUser = createMiddleware<AppBindings>(async (c, next) => {
  const user = await loadUser(c.env, c.req.raw.headers);
  if (!user) return c.json({ error: "unauthorized" } as const, 401);
  c.set("user", user);
  await next();
});

/** ログインしていれば `c.var.user` を設定し、していなくても通す(公開ルート用) */
export const optionalUser = createMiddleware<AppBindings>(async (c, next) => {
  const user = await loadUser(c.env, c.req.raw.headers);
  if (user) c.set("user", user);
  await next();
});

async function loadUser(
  env: AppBindings["Bindings"],
  headers: Headers,
): Promise<SessionUser | undefined> {
  try {
    const session = await getAuth(env).api.getSession({ headers });
    if (!session?.user) return undefined;
    const { id, name, email, image } = session.user;
    return { id, name, email, image: image ?? null };
  } catch {
    // セッション取得に失敗した場合(シークレット未設定など)は未ログイン扱いにする
    return undefined;
  }
}

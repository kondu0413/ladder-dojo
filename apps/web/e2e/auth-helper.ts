import { expect, type Page } from "@playwright/test";

/**
 * E2E 専用のサインアップ(D-014)。
 *
 * 本番の Google ログインは CI で通せないため、E2E 環境だけで有効な
 * メール/パスワードで登録する。
 */
export async function signUp(page: Page, name = "テスト太郎"): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: "correct-horse-battery", name },
  });
  expect(res.status()).toBe(200);
  return email;
}

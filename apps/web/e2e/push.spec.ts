import { expect, test } from "@playwright/test";

/**
 * 課題の通知(S-045)。
 *
 * E2E 環境には VAPID の鍵が無いので、購読そのものは試せない(プッシュサービスにも
 * つながらない)。ここでは「鍵が無い環境ではその旨を出して、ボタンを押せなくする」
 * ところまでを確かめる。送信と暗号化は API のテストで確かめている。
 */
test("鍵が無い環境では、通知を用意できていない旨が出る", async ({ page }) => {
  const email = `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: "correct-horse-battery", name: "通知テスト" },
  });
  expect(signUp.status()).toBe(200);
  const created = await page.request.post("/api/orgs", { data: { name: "通知の組織" } });
  expect(created.status()).toBe(201);
  const { org } = (await created.json()) as { org: { id: string } };

  await page.goto(`/orgs/${org.id}`);
  await page.getByTestId("org-tab-assignments").click();
  await expect(page.getByTestId("push-status")).toHaveAttribute("data-state", "unavailable");
  await expect(page.getByTestId("push-status")).toContainText("通知を用意できていません");
  await expect(page.getByTestId("push-toggle")).toBeDisabled();
});

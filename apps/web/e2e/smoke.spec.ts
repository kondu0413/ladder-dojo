import { expect, test } from "@playwright/test";

test("トップページが表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ラダー図トレーニング" })).toBeVisible();
  await expect(page.getByTestId("schema-version")).toHaveText("schema v1");
});

test("SPA フォールバック: 未知のパスでもトップが出る", async ({ page }) => {
  await page.goto("/some/unknown/path");
  await expect(page.getByRole("heading", { name: "ラダー図トレーニング" })).toBeVisible();
});

test("API が E2E 環境で応答する", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, env: "e2e", core: { schemaVersion: 1 } });
});

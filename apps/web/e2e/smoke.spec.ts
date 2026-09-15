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

test("E2E 専用ログインでセッションが保持され、保存した回路が読み戻せる", async ({ request }) => {
  const email = `e2e-${Date.now()}@example.test`;

  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { email, password: "correct-horse-battery", name: "E2E" },
  });
  expect(signUp.status()).toBe(200);

  const me = await request.get("/api/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user?.email).toBe(email);

  const circuit = {
    schemaVersion: 1,
    cols: 3,
    rows: 1,
    cells: [
      { row: 0, col: 0, element: { type: "contact", kind: "no", device: "X0" } },
      { row: 0, col: 1, element: { type: "wire" } },
      { row: 0, col: 2, element: { type: "coil", kind: "out", device: "Y0" } },
    ],
  };
  const created = await request.post("/api/sandbox", { data: { title: "E2E の回路", circuit } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).circuit.id;

  const reloaded = await request.get(`/api/sandbox/${id}`);
  expect(reloaded.status()).toBe(200);
  const body = await reloaded.json();
  expect(body.circuit.title).toBe("E2E の回路");
  expect(body.circuit.circuit).toEqual(circuit);
});

test("未ログインでは保護 API が 401", async ({ playwright }) => {
  const fresh = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8787",
  });
  const res = await fresh.get("/api/sandbox");
  expect(res.status()).toBe(401);
  await fresh.dispose();
});

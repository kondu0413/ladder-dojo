import { expect, test } from "@playwright/test";

test("トップページに公式問題の一覧が出る", async ({ page }) => {
  await page.goto("/problems");
  await expect(page.getByRole("heading", { name: "公式問題" })).toBeVisible();
  await expect(page.getByTestId("cleared-count")).toContainText(/0 \/ \d+ 問クリア/);
  await expect(page.getByTestId("problem-selfhold-read-1")).toBeVisible();
});

test("SPA フォールバック: 未知のパスでもトップが出る", async ({ page }) => {
  await page.goto("/some/unknown/path");
  await expect(page.getByRole("heading", { name: "公式問題" })).toBeVisible();
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

test.describe("シミュレータ", () => {
  test("X0 を押すと Y0 が点灯し、離しても保持される(自己保持)", async ({ page }) => {
    await page.goto("/samples");
    const y0 = page.getByTestId("device-Y0");
    await expect(y0).toHaveAttribute("data-on", "false");

    // 入力は押しボタン。1 回押すと押して離したことになる(S-027)
    await page.getByTestId("input-X0").click();
    await expect(y0).toHaveAttribute("data-on", "true");
    // 離しても自己保持で点いたまま
    await expect(page.getByTestId("input-X0")).toHaveAttribute("data-on", "false");
    await expect(y0).toHaveAttribute("data-on", "true");

    // 停止ボタンで消える
    await page.getByTestId("input-X1").click();
    await expect(y0).toHaveAttribute("data-on", "false");
  });

  test("ラダー図の接点を直接タップしても操作できる", async ({ page }) => {
    await page.goto("/samples");
    const y0 = page.getByTestId("device-Y0");
    // 行 0 / 列 0 の X0 接点
    await page.getByTestId("cell-0-0").click();
    await expect(y0).toHaveAttribute("data-on", "true");
  });

  test("タイマが実時間で進み、3 秒後に自動消灯する", async ({ page }) => {
    await page.goto("/samples");
    await page.getByTestId("sample-timer").click();
    const y0 = page.getByTestId("device-Y0");

    await page.getByTestId("input-X0").click();
    await expect(y0).toHaveAttribute("data-on", "true");
    // 3 秒のタイマなので、1 秒後はまだ自己保持で点いている
    await page.waitForTimeout(1000);
    await expect(y0).toHaveAttribute("data-on", "true");
    // 3 秒を過ぎると消える
    await expect(y0).toHaveAttribute("data-on", "false", { timeout: 5000 });
  });

  test("一時停止中は 1 スキャンずつ進められる(S-038)", async ({ page }) => {
    await page.goto("/samples");
    await expect(page.getByTestId("sim-step")).toBeDisabled();
    await page.getByTestId("sim-toggle-run").click();
    await expect(page.getByTestId("sim-step")).toBeEnabled();

    // 止めている間は、押しても次のスキャンまで反映されない
    await page.getByTestId("hold-X0").click();
    await expect(page.getByTestId("input-X0")).toHaveAttribute("data-on", "true");
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "false");

    await page.getByTestId("sim-step").click();
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");
  });

  test("リセットで全デバイスが初期状態に戻る", async ({ page }) => {
    await page.goto("/samples");
    await page.getByTestId("sample-counter").click();
    const y0 = page.getByTestId("device-Y0");
    // 1 回押すごとに 1 つ数える
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("input-X0").click();
      await page.waitForTimeout(60);
    }
    await expect(y0).toHaveAttribute("data-on", "true");

    await page.getByTestId("sim-reset").click();
    await expect(y0).toHaveAttribute("data-on", "false");
  });
});

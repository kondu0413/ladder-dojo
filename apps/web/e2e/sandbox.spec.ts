import { expect, test } from "@playwright/test";

/**
 * サンドボックスの編集(SPEC.md §3.1「部品パレットからグリッドに置く。スマホでも操作できる」)。
 * ここで組む回路は自己保持: (X0 または Y0) かつ X1 でない → Y0
 */
test("回路を組み立てて、その場で動かせる", async ({ page }) => {
  await page.goto("/sandbox");
  await expect(page.getByRole("heading", { name: "サンドボックス" })).toBeVisible();

  const selectCell = async (row: number, col: number) => {
    await page.getByTestId(`cell-${row}-${col}`).click();
    await expect(page.getByTestId("editor-hint")).toHaveText(`選択中: ${row + 1} 行 ${col + 1} 列`);
  };

  // 1 行目: X0(a接点)→ X1(b接点)→ Y0(出力コイル)
  await selectCell(0, 0);
  await page.getByTestId("device-type-X").click();
  await expect(page.getByTestId("current-device")).toHaveText("X0");
  await page.getByTestId("part-no").click();

  await selectCell(0, 1);
  await page.getByTestId("device-number-inc").click();
  await expect(page.getByTestId("current-device")).toHaveText("X1");
  await page.getByTestId("part-nc").click();

  await selectCell(0, 5);
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("device-number-dec").click();
  await expect(page.getByTestId("current-device")).toHaveText("Y0");
  await page.getByTestId("part-out").click();

  // 接点とコイルの間を横線でつなぐ
  await page.getByTestId("connect-row").click();

  // 2 行目: Y0 の a 接点(自己保持の枝)
  await selectCell(1, 0);
  await page.getByTestId("part-no").click();

  // 1 行目の 1 列目の右端から下へ縦線を引いて並列にする
  await selectCell(0, 0);
  await page.getByTestId("toggle-vline").click();
  await expect(page.getByTestId("toggle-vline")).toHaveText("縦線を外す");

  // 動かす
  await page.getByTestId("mode-run").click();
  const y0 = page.getByTestId("device-Y0");
  await expect(y0).toHaveAttribute("data-on", "false");

  await page.getByRole("button", { name: /^X0/ }).click();
  await expect(y0).toHaveAttribute("data-on", "true");
  await page.getByRole("button", { name: /^X0/ }).click();
  await expect(y0).toHaveAttribute("data-on", "true"); // 離しても保持

  await page.getByRole("button", { name: /^X1/ }).click();
  await expect(y0).toHaveAttribute("data-on", "false"); // 停止で解除
});

test("置けない場所には置けず、理由が出る", async ({ page }) => {
  await page.goto("/sandbox");

  // 最右列に接点は置けない
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("part-no").click();
  await expect(page.getByRole("alert")).toHaveText("一番右の列にはコイルしか置けません");

  // 最右列以外にコイルは置けない
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-out").click();
  await expect(page.getByRole("alert")).toHaveText("コイルは一番右の列にだけ置けます");
});

test("行と列を増減できる", async ({ page }) => {
  await page.goto("/sandbox");
  await expect(page.getByTestId("cell-2-5")).toBeVisible();
  await expect(page.getByTestId("cell-3-0")).toHaveCount(0);

  await page.getByTestId("add-row").click();
  await expect(page.getByTestId("cell-3-0")).toBeVisible();

  await page.getByTestId("add-col").click();
  await expect(page.getByTestId("cell-0-6")).toBeVisible();

  await page.getByTestId("remove-col").click();
  await expect(page.getByTestId("cell-0-6")).toHaveCount(0);

  await page.getByTestId("cell-3-0").click();
  await page.getByTestId("remove-row").click();
  await expect(page.getByTestId("cell-3-0")).toHaveCount(0);
});

test("置いた部品を消せる", async ({ page }) => {
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");

  await page.getByTestId("part-delete").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
});

test("タイマの設定値を変えて置ける", async ({ page }) => {
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();

  await page.getByTestId("preset-sec-inc").click(); // 3.0 → 3.5
  await expect(page.getByTestId("preset-sec")).toHaveText("3.5");

  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("part-timer").click();
  await expect(page.getByTestId("current-device")).toHaveText("T0");
  await expect(page.getByTestId("cell-text-0-5")).toHaveText("T0 3.5s");
});

test.describe("保存とテストケース(§3.4)", () => {
  async function signUp(page: import("@playwright/test").Page) {
    const email = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const res = await page.request.post("/api/auth/sign-up/email", {
      data: { email, password: "correct-horse-battery", name: "保存テスト" },
    });
    expect(res.status()).toBe(200);
  }

  /** X0 の a 接点 → Y0 コイルの最小回路を作る */
  async function buildMinimal(page: import("@playwright/test").Page) {
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("part-no").click();
    await page.getByTestId("cell-0-5").click();
    await page.getByTestId("device-type-Y").click();
    await page.getByTestId("part-out").click();
    await page.getByTestId("connect-row").click();
  }

  test("未ログインでは保存できない旨が出る", async ({ page }) => {
    await page.goto("/sandbox");
    await expect(page.getByText("保存するにはログインしてください")).toBeVisible();
    await expect(page.getByTestId("sandbox-save")).toHaveCount(0);
  });

  test("テストケースを付けて保存し、読み込み直せる", async ({ page }) => {
    await signUp(page);
    await page.goto("/sandbox");
    await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "true");

    await buildMinimal(page);

    // テストケース: X0 を ON にして Y0 が ON になることを確かめる
    await page.getByTestId("mode-test").click();
    await page.getByTestId("add-test-case").click();
    await page.getByTestId("test-title-0").fill("押すと点く");
    await page.getByTestId("case-0-add-on").click();
    await page.getByTestId("case-0-expect-on").click();
    await expect(page.getByTestId("case-0-step-0")).toContainText("X0 を ON");
    await expect(page.getByTestId("case-0-step-1")).toContainText("Y0=ON");

    // その場で実行できる
    await page.getByTestId("run-tests").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");

    // 保存
    await page.getByTestId("sandbox-title").fill("保存テスト回路");
    await page.getByTestId("sandbox-save").click();
    await expect(page.getByTestId("sandbox-message")).toContainText("保存しました");

    // 新規にしてから読み込み直すと、回路もテストも戻る
    await page.getByTestId("sandbox-new").click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);

    // 「開く」だけで引くと、ヘッダーの「メニューを開く」と当たる。
    // 保存した回路の「開く」を名指しする(保存したのは 1 件)
    await page.locator('[data-testid^="load-"]').first().click();
    await expect(page.getByTestId("sandbox-title")).toHaveValue("保存テスト回路");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");
    await expect(page.getByTestId("mode-test")).toContainText("テスト (1)");
  });

  test("保存した回路を削除できる", async ({ page }) => {
    await signUp(page);
    await page.goto("/sandbox");
    await buildMinimal(page);
    await page.getByTestId("sandbox-title").fill("消す回路");
    await page.getByTestId("sandbox-save").click();
    await expect(page.getByTestId("sandbox-message")).toContainText("保存しました");
    await expect(page.getByText("消す回路")).toBeVisible();

    await page.getByRole("button", { name: "削除" }).click();
    await expect(page.getByTestId("sandbox-message")).toContainText("削除しました");
    await expect(page.getByText("消す回路")).toHaveCount(0);
  });

  test("テストが通らない回路は、その場で差分が出る", async ({ page }) => {
    await signUp(page);
    await page.goto("/sandbox");
    await buildMinimal(page);

    await page.getByTestId("mode-test").click();
    await page.getByTestId("add-test-case").click();
    // わざと「押していないのに ON」という誤ったテストを書く
    await page.getByTestId("case-0-expect-on").click();
    await page.getByTestId("run-tests").click();

    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
    await expect(page.getByTestId("diff-Y0")).toContainText("OFF");
  });
});

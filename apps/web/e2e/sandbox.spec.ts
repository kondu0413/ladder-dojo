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

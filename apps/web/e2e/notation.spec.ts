import { expect, test } from "@playwright/test";

/**
 * 表記の切り替え(S-028)。
 *
 * **回路データは変えず、画面の書き方だけ変える。** 図だけ切り替わって問題文が
 * 元のままだと、読んでいる人は照合できない。両方が揃って初めて意味がある
 */
test.describe("表記の切り替え", () => {
  test("図と問題文が同時に切り替わる", async ({ page }) => {
    await page.goto("/problems/counter-read-1");
    const spec = page.getByTestId("problem-spec");
    await expect(spec).toContainText("X0 を 5 回押すと");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");

    await page.getByTestId("notation-omron").click();

    // 問題文・ラダー図・設問がまとめて変わる
    await expect(spec).toContainText("0.00 を 5 回押すと");
    await expect(spec).toContainText("100.00 が点灯し");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("0.00");
    await expect(page.getByText("0.00 を押したまま")).toBeVisible();

    // 設定値の書き方も変わる(カウンタの設定 5 回)
    await expect(page.getByTestId("cell-text-0-3")).toHaveText("C0000 #0005");
  });

  test("読み上げ用の説明も切り替わる", async ({ page }) => {
    await page.goto("/problems/counter-read-1");
    await page.getByTestId("notation-omron").click();
    await expect(
      page.getByRole("img", { name: /0\.00\(カウント\)の a 接点/ }).first(),
    ).toBeVisible();
  });

  test("選んだ表記は次に開いても残る", async ({ page }) => {
    await page.goto("/problems/counter-read-1");
    await page.getByTestId("notation-omron").click();
    await expect(page.getByTestId("notation-omron")).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByTestId("notation-omron")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("0.00");

    // 別の問題に移っても効いている
    await page.goto("/problems/selfhold-read-1");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("0.00");
  });

  test("IEC ではデバイス名は変えず、立ち上がり接点と設定値の書き方を変える", async ({ page }) => {
    await page.goto("/problems/counter-read-1");
    await page.getByTestId("notation-iec").click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");
    await expect(page.getByTestId("cell-text-0-3")).toHaveText("C0 PV 5");
  });

  test("既定は三菱系(X0 / Y0)", async ({ page }) => {
    await page.goto("/problems/counter-read-1");
    await expect(page.getByTestId("notation-mitsubishi")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cell-text-0-3")).toHaveText("C0 K5");
  });
});

import { expect, test } from "@playwright/test";

/**
 * アクセシビリティ(改善候補 14 / S-018)。
 *
 * ラダー図は SVG で描いているので、放っておくとスクリーンリーダーには
 * 「ラダー図」としか伝わらない。線と丸の集まりなので、中身は何も分からない。
 *
 * ここでは `getByRole` で引いている。読み上げソフトが見るのと同じ道筋なので、
 * 見た目の作りを変えても、伝わるかどうかだけを確かめ続けられる。
 */

test.describe("ラダー図の読み上げ", () => {
  test("SVG に回路の中身が書かれている(「ラダー図」だけにしない)", async ({ page }) => {
    await page.goto("/samples");

    // 自己保持の見本。名前で引けること自体が、中身が載っている証拠になる
    const ladder = page.getByRole("img", { name: /行目.*接点/ });
    await expect(ladder.first()).toBeVisible();

    const label = await ladder.first().getAttribute("aria-label");
    expect(label).toContain("コイル");
    expect(label).toMatch(/X0|Y0/);
    // 「ラダー図」という一言だけで終わっていない
    expect((label ?? "").length).toBeGreaterThan(20);
  });

  test("動かすと読み上げにも通電状態が出る", async ({ page }) => {
    await page.goto("/samples");

    await expect(page.getByRole("img", { name: /無電圧/ }).first()).toBeVisible();

    await page.getByTestId("input-X0").click();
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");

    await expect(page.getByRole("img", { name: /通電中/ }).first()).toBeVisible();
  });
});

test.describe("色だけに頼らない通電表示", () => {
  test("電圧が来ているだけの配線は破線で描く(色の見分けがつかなくても分かる)", async ({ page }) => {
    await page.goto("/samples");

    // 何も押していない状態。左母線から最初の接点までは電圧が来ている
    const lead = page.getByTestId("cell-0-0").locator("line").first();
    await expect(lead).toHaveAttribute("stroke-dasharray", "5 3");

    // 押している間は電流が流れる。流れている線は破線にしない(太い実線)。
    // 入力は押しボタンなので、押したままにする「保持」で ON を続ける(S-027)
    await page.getByTestId("hold-X0").click();
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");
    await expect(lead).not.toHaveAttribute("stroke-dasharray", "5 3");
  });
});

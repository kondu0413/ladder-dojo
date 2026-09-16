import { expect, test } from "@playwright/test";
import { signUp } from "./auth-helper.js";

/**
 * ログイン前の紹介画面(S-021)。
 *
 * **行き止まりにしないこと**が要点。SPEC.md §3.5 のとおり未ログインでも公式問題は
 * 解けるので、LP から 1 回のタップで問題にたどり着けなければ、改悪になる。
 */

test.describe("トップの出し分け", () => {
  test("未ログインだと紹介の画面が出る", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ラダー図が");
    await expect(page.getByTestId("lp-try")).toBeVisible();
    await expect(page.getByTestId("lp-sign-in")).toBeVisible();
  });

  test("**ログインせずに問題まで行ける**(未ログインでも解ける方針を壊さない)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("lp-try").click();

    await expect(page).toHaveURL(/\/problems$/);
    await expect(page.getByTestId("problem-selfhold-read-0")).toBeVisible();
    // ログインしていないまま解ける
    await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "false");
    await page.getByTestId("problem-selfhold-read-0").click();
    await expect(page.getByTestId("choice-0")).toBeVisible();
  });

  test("ログイン済みなら、トップはそのまま問題一覧", async ({ page }) => {
    await signUp(page);
    await page.goto("/");
    await expect(page.getByTestId("problem-selfhold-read-0")).toBeVisible();
    await expect(page.getByTestId("lp-try")).toHaveCount(0);
  });

  test("/problems は未ログインでも直接開ける", async ({ page }) => {
    await page.goto("/problems");
    await expect(page.getByTestId("problem-selfhold-read-0")).toBeVisible();
  });
});

test.describe("狭い画面のメニュー", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("狭いときは畳まれ、開くと行ける", async ({ page }) => {
    await page.goto("/problems");
    const toggle = page.getByTestId("nav-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("navigation", { name: "メニュー" }).getByText("ランキング").click();
    await expect(page).toHaveURL(/\/rankings$/);
  });

  test("題名が折り返して崩れない(以前は 3 行に割れていた)", async ({ page }) => {
    await page.goto("/problems");
    const brand = page.getByRole("banner").getByText("ラダー道場");
    const box = await brand.boundingBox();
    // 1 行に収まっていれば、高さはフォント 1 行ぶんで済む
    expect(box?.height ?? 99).toBeLessThan(32);
  });
});

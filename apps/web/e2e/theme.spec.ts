import { expect, test } from "@playwright/test";

/** ダークモード(S-043)。端末の設定に従い、切り替えは端末に残る */
test.describe("ダークモード", () => {
  test("端末がダークならダークで開き、切り替えると次に開いても残る", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/problems");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    // 地は紺(slate-950 相当)、ヘッダーは元の紺のまま
    await expect(page.locator("body")).toHaveCSS("color-scheme", "dark");
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme", "dark");

    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");

    // 端末の設定が変わっても、選んだほうが優先される
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("ライトからダークにすると、別の画面でもダークのまま", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.goto("/sandbox");
    await expect(html).toHaveAttribute("data-theme", "dark");
    // カードの面は暗く、文字は明るい
    const title = page.getByRole("heading", { name: "サンドボックス" });
    const color = await title.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe("rgb(15, 23, 42)");
  });

  test("選んでいない間は、端末の設定の変化に追いつく", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/problems");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
  });
});

import { expect, test } from "@playwright/test";

/** 用語集(S-041)。読むだけでなく、その回路を押して動かせる */
test.describe("用語集", () => {
  test("用語を探して、回路を動かして見られる", async ({ page }) => {
    await page.goto("/glossary");
    await expect(page.getByRole("heading", { name: "用語集" })).toBeVisible();
    const entries = page.getByTestId("glossary-entry");
    const all = await entries.count();
    expect(all).toBeGreaterThan(15);
    await expect(page.getByTestId("glossary-count")).toHaveText(`${all} 語`);

    await page.getByTestId("glossary-search").fill("自己保持");
    await expect(entries.first()).toHaveAttribute("data-term", "selfhold");
    expect(await entries.count()).toBeLessThan(all);

    // 自己保持の回路: X0 を押して離しても Y0 が点いたまま、X1 で消える
    const selfhold = page.locator('[data-testid="glossary-entry"][data-term="selfhold"]');
    const coil = selfhold.getByTestId("cell-0-4");
    await expect(coil).toHaveAttribute("data-flowing", "false");
    await selfhold.getByTestId("cell-0-0").click();
    await expect(coil).toHaveAttribute("data-flowing", "true");
    await selfhold.getByTestId("cell-0-1").click();
    await expect(coil).toHaveAttribute("data-flowing", "false");

    await page.getByTestId("glossary-search").fill("そんな語はない");
    await expect(entries).toHaveCount(0);
    await expect(page.getByText("見つかりませんでした")).toBeVisible();
  });

  test("問題文の用語から、用語集の該当箇所へ飛べる", async ({ page }) => {
    await page.goto("/problems/selfhold-read-0");
    const term = page.getByTestId("problem-spec").getByTestId("glossary-term").first();
    await expect(term).toHaveAttribute("href", /\/glossary#[a-z-]+$/);
    const id = (await term.getAttribute("data-term")) ?? "";
    expect(id).not.toBe("");

    await term.click();
    await expect(page).toHaveURL(new RegExp(`/glossary#${id}$`));
    const entry = page.locator(`[data-testid="glossary-entry"][data-term="${id}"]`);
    await expect(entry).toHaveAttribute("data-active", "true");
    await expect(entry).toBeInViewport();
  });

  test("ヒントの中の用語もリンクになり、強調が効く", async ({ page }) => {
    await page.goto("/problems/counter-write-3");
    await page.getByText("ヒントを見る").click();
    const hint = page.getByText("並べる順番が大事").locator("..");
    await expect(hint.locator("strong")).toHaveText("並べる順番が大事");
    await expect(hint.getByTestId("glossary-term").first()).toBeVisible();
  });
});

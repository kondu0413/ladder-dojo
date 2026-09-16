import { expect, test } from "@playwright/test";

/**
 * 「読む」の答え合わせ(SPEC.md §3.2 (1) / S-022)。
 *
 * 予測して選んだあと、**設問と同じ操作が再生されて、そのとおりになるのを見る**
 * ところまでが 1 つの学習。ここが動かないと「読む」15 問の狙いが立たない。
 */

/** selfhold-read-1「押して離すと保持される」を開いて 1 問目に答える */
async function answerFirst(page: import("@playwright/test").Page) {
  await page.goto("/problems/selfhold-read-1");
  await page.getByTestId("choice-1").click();
  await expect(page.getByTestId("read-result")).toHaveAttribute("data-correct", "true");
}

test.describe("答え合わせの再生", () => {
  test("答えたあと、設問と同じ操作を再生できる", async ({ page }) => {
    await answerFirst(page);

    await page.getByTestId("verify-with-simulator").click();
    await expect(page.getByTestId("scenario-replay")).toBeVisible();

    // 最初の駒は「何も操作していない状態」
    await expect(page.getByTestId("replay-position")).toHaveText("1 / 2");
    await expect(page.getByTestId("replay-caption")).toContainText("何も操作していない");
  });

  test("**操作を送ると回路の通電が変わる**(予測どおりになるのを目で見る)", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("verify-with-simulator").click();

    // 問題文の静止図にも同じマスがあるので、再生側に絞る
    const replay = page.getByTestId("scenario-replay");

    // 操作前: 自己保持の枝(1 行目)は通電していない
    await expect(replay.getByTestId("cell-1-0")).toHaveAttribute("data-flowing", "false");

    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText("X0");

    // 押して離したあと、保持しているのは自己保持の枝のほう。
    // X0 の接点は離したので通っていない
    await expect(replay.getByTestId("cell-1-0")).toHaveAttribute("data-flowing", "true");
    await expect(replay.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "false");
    await expect(replay.getByRole("img", { name: /通電中/ })).toBeVisible();
  });

  test("戻る・最初から で行ったり来たりできる", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("verify-with-simulator").click();

    await expect(page.getByTestId("replay-prev")).toBeDisabled();
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-position")).toHaveText("2 / 2");
    await expect(page.getByTestId("replay-next")).toBeDisabled();

    await page.getByTestId("replay-prev").click();
    await expect(page.getByTestId("replay-position")).toHaveText("1 / 2");

    await page.getByTestId("replay-next").click();
    await page.getByTestId("replay-restart").click();
    await expect(page.getByTestId("replay-position")).toHaveText("1 / 2");
  });

  test("自分で動かすほうにも切り替えられる", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("verify-with-simulator").click();

    await page.getByTestId("verify-mode-free").click();
    await expect(page.getByTestId("scenario-replay")).toHaveCount(0);

    // 自由操作では入力を押せる
    await page.getByRole("button", { name: /^X0/ }).click();
    await expect(page.getByRole("img", { name: /通電中/ }).first()).toBeVisible();

    await page.getByTestId("verify-mode-replay").click();
    await expect(page.getByTestId("scenario-replay")).toBeVisible();
  });

  test("答える前は答え合わせを出さない(先に予測させる)", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    await expect(page.getByTestId("verify-with-simulator")).toHaveCount(0);
  });

  test("待ち時間のある設問でも再生できる", async ({ page }) => {
    await page.goto("/problems/timer-read-1");
    await page.getByTestId("choice-1").click();
    await page.getByTestId("verify-with-simulator").click();

    await expect(page.getByTestId("replay-position")).toHaveText("1 / 3");
    await page.getByTestId("replay-next").click();
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText("秒 待つ");
    // 5 秒後は自動停止しているので消えている
    await expect(page.getByRole("img", { name: /無電圧/ }).first()).toBeVisible();
  });
});

/**
 * 設問が切り替わったことが分かるか(S-024)。
 *
 * 「読む」は画面上部(題名・仕様文・ラダー図)が設問をまたいで変わらず、
 * ページ全体が 1 画面に収まるのでスクロールも起きない。何も変わらないように
 * 見えると、**押しても元に戻ったと受け取られる**(実際にそう報告された)。
 */
test.describe("設問が進んだことが分かる", () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test("何問目かの印が実際に変わる", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    const steps = page.getByTestId("question-steps");
    const first = await steps.getAttribute("data-current");
    expect(first).toBeTruthy();

    await page.getByTestId("choice-1").click();
    await page.getByTestId("next-question").click();

    await expect(steps).not.toHaveAttribute("data-current", first ?? "");
    await expect(page.getByText(/設問 2 \/ 2/)).toBeVisible();
  });

  test("設問は独立した箱に入っていて、入れ替わったと分かる", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    const before = await page.getByTestId("question-steps").locator("xpath=../..").innerText();
    await page.getByTestId("choice-1").click();
    await page.getByTestId("next-question").click();
    await page.waitForTimeout(400);
    const after = await page.getByTestId("question-steps").locator("xpath=../..").innerText();
    expect(after).not.toBe(before);
  });
});

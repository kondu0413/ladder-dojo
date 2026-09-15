import { expect, test } from "@playwright/test";

/**
 * 学習モード(SPEC.md §3.2)と判定結果の表示(§3.3)。
 */

test.describe("読む", () => {
  test("正解を選ぶと解説が出て、動かして確かめられる", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    await expect(
      page.getByRole("heading", { name: "押しボタンを離したらどうなる?" }),
    ).toBeVisible();

    // 設問 1: 正解は「点灯したままになる」
    await page.getByTestId("choice-1").click();
    await expect(page.getByTestId("read-result")).toHaveAttribute("data-correct", "true");
    await expect(page.getByTestId("read-result")).toContainText("点灯が保持されます");

    // シミュレータで答え合わせできる
    await page.getByTestId("verify-with-simulator").click();
    const y0 = page.getByTestId("device-Y0");
    await expect(y0).toHaveAttribute("data-on", "false");
    await page.getByRole("button", { name: /^X0/ }).click();
    await expect(y0).toHaveAttribute("data-on", "true");
  });

  test("間違えると正解が示され、全問答えるとクリア判定が出る", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");

    // わざと間違える
    await page.getByTestId("choice-0").click();
    await expect(page.getByTestId("read-result")).toHaveAttribute("data-correct", "false");
    await expect(page.getByTestId("choice-1")).toHaveAttribute("data-state", "answer");

    await page.getByTestId("next-question").click();
    await page.getByTestId("choice-0").click();

    await expect(page.getByTestId("read-complete")).toHaveAttribute("data-cleared", "false");
  });

  test("全問正解するとクリアになり、一覧に反映される", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    await page.getByTestId("choice-1").click();
    await page.getByTestId("next-question").click();
    await page.getByTestId("choice-0").click();
    await expect(page.getByTestId("read-complete")).toHaveAttribute("data-cleared", "true");

    await page.goto("/");
    await expect(page.getByTestId("problem-selfhold-read-1")).toHaveAttribute(
      "data-cleared",
      "true",
    );
    await expect(page.getByTestId("cleared-count")).toContainText("クリア: 1 / 30 問");
  });
});

test.describe("直す", () => {
  test("不正解のときは、どの操作で何が違ったかが出る", async ({ page }) => {
    await page.goto("/problems/selfhold-fix-1");
    await expect(page.getByText("この回路には間違いが 1 か所あります。")).toBeVisible();

    await page.getByTestId("check-answer").click();
    const result = page.getByTestId("judge-result");
    await expect(result).toHaveAttribute("data-passed", "false");
    await expect(page.getByTestId("failed-case-title")).toContainText(
      "起動ボタンを押して離しても点いたまま",
    );
    // 差分: Y0 は ON のはずが OFF
    const diff = page.getByTestId("diff-Y0");
    await expect(diff).toContainText("ON");
    await expect(diff).toContainText("OFF");
    await expect(result).toContainText("X0(起動) を押して離す");
  });

  test("直すと正解になり、模範解答と指標が並ぶ", async ({ page }) => {
    await page.goto("/problems/selfhold-fix-1");

    // 2 行目に Y0 の a 接点を置き、1 行目から縦線でつないで自己保持にする
    await page.getByTestId("cell-1-0").click();
    await page.getByTestId("device-type-Y").click();
    await page.getByTestId("part-no").click();
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("toggle-vline").click();

    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");
    await expect(page.getByTestId("solution-compare")).toBeVisible();
    await expect(page.getByRole("heading", { name: "模範解答" })).toBeVisible();
    await expect(page.getByTestId("metric-mine-ラング数")).toHaveText("1");
  });
});

test.describe("書く", () => {
  test("白紙から組み立てて正解できる", async ({ page }) => {
    await page.goto("/problems/selfhold-write-1");

    // 1 行目: X0(a接点)→ X1(b接点)→ Y0(コイル)
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("part-no").click();
    await page.getByTestId("cell-0-1").click();
    await page.getByTestId("device-number-inc").click();
    await page.getByTestId("part-nc").click();
    await page.getByTestId("cell-0-5").click();
    await page.getByTestId("device-type-Y").click();
    await page.getByTestId("device-number-dec").click();
    await page.getByTestId("part-out").click();
    await page.getByTestId("connect-row").click();

    // 2 行目: Y0 の a 接点 + 縦線で並列に
    await page.getByTestId("cell-1-0").click();
    await page.getByTestId("part-no").click();
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("toggle-vline").click();

    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");
    await expect(page.getByTestId("solution-compare")).toBeVisible();

    // 一覧でクリア済みになる
    await page.goto("/");
    await expect(page.getByTestId("problem-selfhold-write-1")).toHaveAttribute(
      "data-cleared",
      "true",
    );
  });

  test("途中の回路を動かして確かめられる", async ({ page }) => {
    await page.goto("/problems/selfhold-write-1");
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("part-no").click();
    await page.getByTestId("cell-0-5").click();
    await page.getByTestId("device-type-Y").click();
    await page.getByTestId("part-out").click();
    await page.getByTestId("connect-row").click();

    await page.getByTestId("mode-run").click();
    const y0 = page.getByTestId("device-Y0");
    await expect(y0).toHaveAttribute("data-on", "false");
    await page.getByRole("button", { name: /^X0/ }).click();
    await expect(y0).toHaveAttribute("data-on", "true");
  });

  test("最初からで初期状態に戻る", async ({ page }) => {
    await page.goto("/problems/selfhold-write-1");
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("part-no").click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");

    await page.getByTestId("reset-circuit").click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
  });
});

test.describe("つまずき診断", () => {
  test("1 回目の失敗では出ないが、2 回目から出る", async ({ page }) => {
    // selfhold-fix-1 は「ボタンを離すと消えてしまう」= 自己保持の枝が無い問題
    await page.goto("/problems/selfhold-fix-1");

    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
    // 1 回目は自分で考えてもらう
    await expect(page.getByTestId("diagnosis")).toHaveCount(0);

    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("diagnosis")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("diagnosis")).toContainText("ここを見てみましょう");
    // 直し方までは言わない
    await expect(page.getByTestId("diagnosis")).toContainText("自分で考えてみてください");
  });

  test("診断が指したセルがラダー図で囲まれる", async ({ page }) => {
    await page.goto("/problems/timer-fix-1");
    await page.getByTestId("check-answer").click();
    await page.getByTestId("check-answer").click();
    const panel = page.getByTestId("diagnosis");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    // timer-fix-1 は設定値の間違い。タイマのセルが囲まれる
    await expect(panel.getByTestId("diagnosis-timer-preset")).toBeVisible();
    await expect(panel.locator("[data-highlighted]")).toHaveCount(1);
  });

  test("正解したら診断は出ない", async ({ page }) => {
    await page.goto("/problems/selfhold-fix-1");
    await page.getByTestId("check-answer").click();
    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("diagnosis")).toBeVisible({ timeout: 15_000 });

    // 「最初から」を押すと失敗回数もリセットされ、診断が消える
    await page.getByTestId("reset-circuit").click();
    await expect(page.getByTestId("diagnosis")).toHaveCount(0);
  });
});

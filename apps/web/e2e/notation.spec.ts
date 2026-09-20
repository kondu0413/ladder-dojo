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

  /**
   * つまずき診断は「囲ったところを見て考えて」と、**文章と図の照合**を求める。
   * 片方だけ切り替わると照合が成り立たない
   */
  test("つまずき診断の文章も図と同じ表記になる", async ({ page }) => {
    await page.goto("/problems/selfhold-fix-1");
    await page.getByTestId("notation-omron").click();

    await page.getByTestId("check-answer").click();
    await page.getByTestId("check-answer").click();
    const panel = page.getByTestId("diagnosis");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // 図が 100.00 なら、文章も 100.00 でなければ照らし合わせられない
    await expect(panel).toContainText("100.00 がボタンを離すと消えます");
    await expect(panel).not.toContainText("Y0");
  });

  /**
   * 表記の取りこぼし(S-052)。図だけ切り替わって説明文が X0 のままの画面が残っていた
   * (サンプル回路・用語集・判定結果のヒント・投稿一覧)。図と文は必ず揃える
   */
  test("サンプル回路の説明文も図と同じ表記になる", async ({ page }) => {
    await page.goto("/samples");
    await page.getByRole("button", { name: "オムロン系" }).click();
    const description = page.getByTestId("sample-description");
    await expect(description).toContainText("0.00");
    await expect(description).not.toContainText("X0");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("0.00");
  });

  test("用語集の説明文も小さな図と同じ表記になる", async ({ page }) => {
    await page.goto("/glossary");
    await page.getByRole("button", { name: "オムロン系" }).click();
    const body = page.getByTestId("term-body-device");
    await expect(body).toContainText("0.00");
    await expect(body).not.toContainText("X0");
  });

  test("判定結果の操作の言い方は、再生と同じ(押したまま / 秒待つ)", async ({ page }) => {
    await page.goto("/problems/timer-fix-1");
    await page.getByTestId("check-answer").click();
    const result = page.getByTestId("judge-result");
    await expect(result).toHaveAttribute("data-passed", "false");
    // 「X0 を ON」ではなく「押したまま」、「3.0 秒待つ」ではなく「3 秒待つ」
    await expect(result).not.toContainText("を ON");
    await expect(result).not.toContainText("を OFF");
  });

  test("ログイン前の紹介画面でも図と説明文が揃う", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    await page.getByTestId("notation-omron").click();

    await page.goto("/");
    await expect(page.getByText("押しボタン 0.00 を押すと、ランプ 100.00 が点く")).toBeVisible();
  });
});

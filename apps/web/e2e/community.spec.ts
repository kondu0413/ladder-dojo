import { expect, type Page, test } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

/**
 * E2E のローカル D1 は全プロジェクト(モバイル / デスクトップ)で共有されるので、
 * 同じタイトルの投稿が複数できてしまう。タイトルは毎回一意にする。
 */
function uniqueTitle(base: string): string {
  return `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 投稿問題(SPEC.md §3.6 / フェーズ2)。
 * サンドボックスで回路を作り、テストを付けて投稿し、他人が解いていいね・投票・通報するところまで。
 */

async function signUp(page: Page, label = "user"): Promise<void> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: "correct-horse-battery", name: label },
  });
  expect(res.status()).toBe(200);
}

/** 自己保持回路を組み、「押して離しても点いたまま」のテストを 1 件付ける */
async function buildSelfHoldWithTest(page: Page) {
  await page.goto("/sandbox");
  await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "true");

  // 1 行目: X0 → /X1 → Y0
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
  // 2 行目: Y0 の a 接点を並列に
  await page.getByTestId("cell-1-0").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("toggle-vline").click();

  // テスト: X0 を押して離す → Y0 が ON
  await page.getByTestId("mode-test").click();
  await page.getByTestId("add-test-case").click();
  await page.getByTestId("test-title-0").fill("押して離しても点いたまま");
  await page.getByTestId("case-0-add-press").click();
  await page.getByTestId("case-0-expect-on").click();
  await page.getByTestId("run-tests").click();
  await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");
}

test("サンドボックスから投稿でき、模範解答が自動チェックされる", async ({ page }) => {
  await signUp(page, "author");
  await buildSelfHoldWithTest(page);

  await page.getByTestId("sandbox-publish").click();
  const title = uniqueTitle("自己保持をつくろう");
  await page.getByTestId("publish-title").fill(title);
  await page
    .getByTestId("publish-spec")
    .fill("X0 で点灯・保持、X1 で消灯する回路を作ってください。");
  await page.getByTestId("publish-tags").fill("自己保持, 入門");
  await page.getByTestId("publish-submit").click();

  // 投稿後は問題ページへ移動する
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByTestId("clear-rate")).toContainText("—");
  // 投稿者には模範解答が見える
  await expect(page.getByTestId("posted-solution")).toBeVisible();
});

test("テストを通らない回路は投稿できず、理由が出る", async ({ page }) => {
  await signUp(page, "author");
  await page.goto("/sandbox");

  // X0 → Y0 だけの回路(保持しない)に、「押して離しても点いたまま」のテストを付ける
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("part-out").click();
  await page.getByTestId("connect-row").click();

  await page.getByTestId("mode-test").click();
  await page.getByTestId("add-test-case").click();
  await page.getByTestId("test-title-0").fill("押して離しても点いたまま");
  await page.getByTestId("case-0-add-press").click();
  await page.getByTestId("case-0-expect-on").click();

  await page.getByTestId("sandbox-publish").click();
  await page.getByTestId("publish-title").fill("通らない問題");
  await page.getByTestId("publish-spec").fill("これは投稿できないはず");
  await page.getByTestId("publish-submit").click();

  const error = page.getByTestId("publish-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("付けたテストを通りませんでした");
  await expect(error).toContainText("押して離しても点いたまま");
});

test("テストが 1 件も無いと投稿ボタンが押せない", async ({ page }) => {
  await signUp(page, "author");
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();

  await page.getByTestId("sandbox-publish").click();
  await page.getByTestId("publish-title").fill("テスト無し");
  await page.getByTestId("publish-spec").fill("説明");
  await expect(page.getByTestId("publish-submit")).toBeDisabled();
  await expect(page.getByText("テストケースが 1 件も付いていません")).toBeVisible();
});

test("投稿した問題を他の人が解き、いいね・難易度投票・クリア率が動く", async ({
  page,
  browser,
}) => {
  // 投稿者
  await signUp(page, "author");
  await buildSelfHoldWithTest(page);
  await page.getByTestId("sandbox-publish").click();
  const title = uniqueTitle("みんなで解く自己保持");
  await page.getByTestId("publish-title").fill(title);
  await page.getByTestId("publish-spec").fill("X0 で点灯・保持。X1 で消灯。");
  await page.getByTestId("publish-submit").click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const url = page.url();

  // 別のユーザーで解く
  const other = await browser.newContext({ baseURL: BASE_URL });
  const solver = await other.newPage();
  await signUp(solver, "solver");
  await solver.goto(url);
  await expect(solver.getByRole("heading", { name: title })).toBeVisible();
  // 解く前は模範解答が見えない
  await expect(solver.getByTestId("posted-solution")).toHaveCount(0);

  // 一覧からも辿れる
  await solver.goto("/community");
  await solver.getByTestId("search-input").fill(title);
  await expect(solver.getByText(title)).toBeVisible();
  await solver.getByText(title).click();

  // 自己保持を組んで答え合わせ
  await solver.getByTestId("cell-0-0").click();
  await solver.getByTestId("part-no").click();
  await solver.getByTestId("cell-0-1").click();
  await solver.getByTestId("device-number-inc").click();
  await solver.getByTestId("part-nc").click();
  await solver.getByTestId("cell-0-5").click();
  await solver.getByTestId("device-type-Y").click();
  await solver.getByTestId("device-number-dec").click();
  await solver.getByTestId("part-out").click();
  await solver.getByTestId("connect-row").click();
  await solver.getByTestId("cell-1-0").click();
  await solver.getByTestId("part-no").click();
  await solver.getByTestId("cell-0-0").click();
  await solver.getByTestId("toggle-vline").click();
  await solver.getByTestId("check-answer").click();

  await expect(solver.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");
  await expect(solver.getByTestId("clear-rate")).toContainText("100%");
  // クリアすると模範解答が見える
  await expect(solver.getByTestId("posted-solution")).toBeVisible();

  // いいねと難易度投票
  await solver.getByTestId("like-button").click();
  await expect(solver.getByTestId("like-button")).toContainText("いいね済み");
  await solver.getByTestId("vote-4").click();
  await expect(solver.getByTestId("vote-4")).toHaveAttribute("aria-pressed", "true");

  await other.close();
});

test("未ログインでも一覧と問題は見られるが、いいねにはログインが要る", async ({
  page,
  browser,
}) => {
  const authorContext = await browser.newContext({ baseURL: BASE_URL });
  const author = await authorContext.newPage();
  await signUp(author, "author");
  await buildSelfHoldWithTest(author);
  await author.getByTestId("sandbox-publish").click();
  const title = uniqueTitle("未ログインでも見える問題");
  await author.getByTestId("publish-title").fill(title);
  await author.getByTestId("publish-spec").fill("説明文");
  await author.getByTestId("publish-submit").click();
  await expect(author.getByRole("heading", { name: title })).toBeVisible();
  const url = author.url();
  await authorContext.close();

  await page.goto("/community");
  await page.getByTestId("search-input").fill(title);
  await expect(page.getByText(title)).toBeVisible();
  await page.goto(url);
  await page.getByTestId("like-button").click();
  await expect(page.getByTestId("notice")).toContainText("ログイン");
});

test("検索と絞り込みが効く", async ({ page }) => {
  await signUp(page, "author");
  await buildSelfHoldWithTest(page);
  await page.getByTestId("sandbox-publish").click();
  const title = uniqueTitle("検索用のユニークな題名");
  const tag = `タグ${Math.random().toString(36).slice(2, 8)}`;
  await page.getByTestId("publish-title").fill(title);
  await page.getByTestId("publish-spec").fill("説明");
  await page.getByTestId("publish-tags").fill(tag);
  await page.getByTestId("publish-difficulty").selectOption("5");
  await page.getByTestId("publish-submit").click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.goto("/community");
  await page.getByTestId("search-input").fill(title);
  await expect(page.getByText(title)).toBeVisible();

  await page.getByTestId("search-input").fill("存在しない語句QQQ");
  await expect(page.getByTestId("empty-list")).toBeVisible();

  await page.getByTestId("search-input").fill("");
  await page.getByTestId("filter-tag").fill(tag);
  await expect(page.getByText(title)).toBeVisible();

  await page.getByTestId("filter-difficulty").selectOption("1");
  await expect(page.getByTestId("empty-list")).toBeVisible();
});

test("通報するとお礼が出る(3 件で非表示になる)", async ({ page, browser }) => {
  const authorContext = await browser.newContext({ baseURL: BASE_URL });
  const author = await authorContext.newPage();
  await signUp(author, "author");
  await buildSelfHoldWithTest(author);
  await author.getByTestId("sandbox-publish").click();
  const title = uniqueTitle("通報される投稿");
  await author.getByTestId("publish-title").fill(title);
  await author.getByTestId("publish-spec").fill("説明");
  await author.getByTestId("publish-submit").click();
  await expect(author.getByRole("heading", { name: title })).toBeVisible();
  const url = author.url();
  await authorContext.close();

  await signUp(page, "reporter");
  await page.goto(url);
  page.on("dialog", (d) => void d.accept("内容が不適切です"));
  await page.getByTestId("report-button").click();
  await expect(page.getByTestId("notice")).toContainText("通報を受け付けました");
});

test("投稿者は自分の投稿を削除できる", async ({ page }) => {
  await signUp(page, "author");
  await buildSelfHoldWithTest(page);
  await page.getByTestId("sandbox-publish").click();
  const title = uniqueTitle("消す予定の投稿");
  await page.getByTestId("publish-title").fill(title);
  await page.getByTestId("publish-spec").fill("説明");
  await page.getByTestId("publish-submit").click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("delete-posted").click();
  await expect(page.getByRole("heading", { name: "みんなの問題" })).toBeVisible();
  await page.getByTestId("search-input").fill(title);
  await expect(page.getByTestId("empty-list")).toBeVisible();
});

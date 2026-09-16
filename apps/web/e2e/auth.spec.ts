import { expect, type Page, test } from "@playwright/test";
import { signUp } from "./auth-helper.js";
import { ATTEMPTS, SUBMISSIONS, waitForPost } from "./sync.js";

/**
 * ログインと進捗同期(SPEC.md §3.5 / DECISIONS.md S-002)。
 *
 * 本番の Google ログインは CI で通せないため、E2E 環境だけで有効なメール/パスワードで
 * サインアップし、そのあとの画面と同期の挙動を確かめる(D-014)。
 */

/**
 * 読む問題を全問正解してクリアにする。
 *
 * ログイン中はクリアがサーバーへ投げっぱなしで送られる(S-002)。そのまま次の操作に
 * 進むと送信が間に合わないことがあるので、`syncsToServer` のときは完了を待つ。
 */
async function clearReadProblem(page: Page, syncsToServer = false) {
  await page.goto("/problems/selfhold-read-1");
  await page.getByTestId("choice-1").click();
  await page.getByTestId("next-question").click();
  const saved = syncsToServer ? waitForPost(page, ATTEMPTS) : undefined;
  await page.getByTestId("choice-0").click();
  await expect(page.getByTestId("read-complete")).toHaveAttribute("data-cleared", "true");
  await saved;
}

test("未ログインでも問題は解け、ログインを促す表示が出る", async ({ page }) => {
  await page.goto("/problems");
  await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "false");
  await expect(page.getByTestId("sign-in-google")).toBeVisible();

  await clearReadProblem(page);
  await page.goto("/problems");
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);
});

test("ログインすると名前が出て、ログアウトできる", async ({ page }) => {
  await signUp(page);
  await page.goto("/problems");
  await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "true");
  await expect(page.getByTestId("auth-user")).toContainText("テスト太郎");

  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "false");
});

test("ログイン中の進捗はサーバーに保存され、再読み込みしても残る", async ({ page }) => {
  await signUp(page);
  await page.goto("/problems");
  await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "true");

  await clearReadProblem(page, true);
  await page.goto("/problems");
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);

  // localStorage を空にしても、サーバーから読み直せる
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);
  await expect(page.getByTestId("problem-selfhold-read-1")).toHaveAttribute("data-cleared", "true");
});

test("端末に溜めた進捗をログイン時に引き継げる(S-002)", async ({ page }) => {
  // 未ログインで 1 問クリア
  await clearReadProblem(page);
  await page.goto("/problems");
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);

  // ログインすると引き継ぎを聞かれる
  await signUp(page);
  await page.reload();
  await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "true");
  const prompt = page.getByTestId("merge-prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("1 問ぶんの進捗");

  await page.getByTestId("merge-accept").click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);

  // サーバー側に入ったので、端末の記録を消しても残る
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);
});

test("引き継ぎを「あとで」にすると端末の記録は消えない", async ({ page }) => {
  await clearReadProblem(page);
  await signUp(page);
  await page.goto("/problems");
  await page.getByTestId("merge-dismiss").click();
  await expect(page.getByTestId("merge-prompt")).toHaveCount(0);

  // サーバー側は空なので 0 問。端末の記録はログアウトすれば戻る
  await expect(page.getByTestId("cleared-count")).toContainText(/0 \/ \d+ 問クリア/);
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);
});

test("セッション確認中に答え合わせしても、進捗と提出がサーバーに残る", async ({ page }) => {
  await signUp(page);

  // セッションの確認をわざと遅らせて、「ログイン済みかどうかまだ分からない」状態を作る。
  // ここで判断を急ぐと、ログイン済みなのに端末にしか記録されず、提出は黙って捨てられていた
  await page.route("**/api/auth/get-session*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("/problems/selfhold-fix-1");
  const attempted = waitForPost(page, ATTEMPTS);
  const submitted = waitForPost(page, SUBMISSIONS);
  // 画面が出た瞬間に押す(セッションの確認はまだ終わっていない)
  await page.getByTestId("check-answer").click();
  await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");

  // 確認が済んだあとで、預かっていた書き込みが流れる
  await Promise.all([attempted, submitted]);

  await page.unroute("**/api/auth/get-session*");
  await page.goto("/problems");
  await expect(page.getByTestId("problem-selfhold-fix-1")).toHaveAttribute("data-cleared", "false");
  // 端末の記録ではなくサーバーに入っているので、localStorage を消しても挑戦回数が残る
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("problem-selfhold-fix-1")).toContainText("1 回挑戦中");
});

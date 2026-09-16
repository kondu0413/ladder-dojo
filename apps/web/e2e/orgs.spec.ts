import { expect, type Page, test } from "@playwright/test";
import { ATTEMPTS, SUBMISSIONS, waitForPost } from "./sync.js";

/**
 * 組織・管理者ビュー・ランキング(SPEC.md §3.7 / §3.8)。
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

function unique(base: string): string {
  return `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function signUp(page: Page, name = "user"): Promise<void> {
  const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: "correct-horse-battery", name },
  });
  expect(res.status()).toBe(200);
}

/** 組織を作り、招待コードを取り出す */
async function createOrgWithInvite(page: Page, name: string): Promise<string> {
  await page.goto("/orgs");
  await page.getByTestId("org-name").fill(name);
  await page.getByTestId("org-create").click();
  await expect(page.getByTestId("org-message")).toContainText("組織を作りました");
  await page.getByTestId("org-list").getByText(name).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByTestId("create-invite").click();
  const code = await page.getByTestId("invite-code").innerText();
  expect(code.length).toBeGreaterThan(6);
  return code;
}

test("組織を作ると管理者になり、招待コードで他の人が参加できる", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("うちの工場");
  const code = await createOrgWithInvite(page, orgName);

  // 別のユーザーが参加する
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "member");
  await member.goto("/orgs");
  await expect(member.getByTestId("org-empty")).toBeVisible();
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");
  await expect(member.getByTestId("org-list").getByText(orgName)).toBeVisible();

  // メンバーにはメンバー一覧が見えない
  await member.getByTestId("org-list").getByText(orgName).click();
  await expect(member.getByText("メンバー一覧は管理者だけが見られます")).toBeVisible();
  await expect(member.getByTestId("create-invite")).toHaveCount(0);
  await ctx.close();

  // 管理者にはメンバーが 2 人見える
  await page.reload();
  await expect(page.getByTestId("member-list").getByRole("listitem")).toHaveCount(2);
});

test("管理者はメンバーの学習状況とつまずきを見られる", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("学習状況テスト");
  const code = await createOrgWithInvite(page, orgName);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "taro");
  await member.goto("/orgs");
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");

  // メンバーが 1 問クリアし、別の 1 問で詰まる。
  // 進捗も提出も投げっぱなしで送るので、ページを移る前・閉じる前に完了を待つ
  await member.goto("/problems/selfhold-read-1");
  await member.getByTestId("choice-1").click();
  await member.getByTestId("next-question").click();
  const cleared = waitForPost(member, ATTEMPTS);
  await member.getByTestId("choice-0").click();
  await expect(member.getByTestId("read-complete")).toHaveAttribute("data-cleared", "true");
  await cleared;

  await member.goto("/problems/selfhold-fix-1");
  const attempted = waitForPost(member, ATTEMPTS);
  const submitted = waitForPost(member, SUBMISSIONS);
  await member.getByTestId("check-answer").click();
  await expect(member.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
  await Promise.all([attempted, submitted]);
  await ctx.close();

  // 管理者が学習状況を見る
  await page.reload();
  const memberRow = page
    .getByTestId("member-list")
    .getByRole("listitem")
    .filter({ hasText: "taro" });
  await memberRow.getByRole("button", { name: "学習状況" }).click();
  await expect(page.getByTestId("member-detail")).toBeVisible();
  await expect(page.getByTestId("member-cleared")).toContainText("クリア 1 問");
  await expect(page.getByTestId("member-detail")).toContainText("ボタンを離すと消えてしまう");

  // つまずきタブ
  await page.getByTestId("org-tab-stuck").click();
  await expect(page.getByTestId("stuck-panel")).toContainText("メンバー 2 人");
  await expect(page.getByTestId("stuck-selfhold-fix-1")).toContainText("1 人");
});

test("管理者は課題を割り当てられ、メンバーに見える", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("課題テスト");
  const code = await createOrgWithInvite(page, orgName);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "hanako");
  await member.goto("/orgs");
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");

  // 管理者が全員に割り当てる
  await page.reload();
  await page.getByTestId("org-tab-assignments").click();
  await expect(page.getByTestId("assignment-empty")).toBeVisible();
  await page.getByTestId("assign-problem").selectOption("timer-write-1");
  await page.getByTestId("assign-note").fill("今週中に");
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("assignment-message")).toContainText("割り当てました");
  await expect(page.getByTestId("assignment-list")).toContainText("3 秒で自動停止する回路を作る");

  // メンバーにも見える
  await member.goto("/orgs");
  await member.getByTestId("org-list").getByText(orgName).click();
  await member.getByTestId("org-tab-assignments").click();
  await expect(member.getByTestId("assignment-list")).toContainText("3 秒で自動停止する回路を作る");
  await expect(member.getByTestId("assignment-list")).toContainText("今週中に");
  // メンバーは取り消せない
  await expect(member.getByRole("button", { name: "取り消す" })).toHaveCount(0);
  await ctx.close();
});

test("権限の変更と、最後の管理者を守る挙動", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("権限テスト");
  const code = await createOrgWithInvite(page, orgName);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "jiro");
  await member.goto("/orgs");
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");
  await ctx.close();

  await page.reload();
  const row = page.getByTestId("member-list").getByRole("listitem").filter({ hasText: "jiro" });
  await row.getByRole("button", { name: "管理者に" }).click();
  await expect(row.getByText("管理者")).toBeVisible();

  // 管理者が 2 人になったので、自分を降格できる
  const mine = page.getByTestId("member-list").getByRole("listitem").filter({ hasText: "admin" });
  await mine.getByRole("button", { name: "メンバーに" }).click();
  await expect(page.getByText("メンバー一覧は管理者だけが見られます")).toBeVisible();
});

test("管理者はメンバーの提出履歴を回路つきで見られる", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("提出履歴テスト");
  const code = await createOrgWithInvite(page, orgName);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "saburo");
  await member.goto("/orgs");
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");

  // 「直す」問題を 1 回失敗して提出履歴を作る。
  // 提出の POST は投げっぱなしなので、ページを閉じる前に完了を待つ
  await member.goto("/problems/selfhold-fix-1");
  const saved = waitForPost(member, SUBMISSIONS);
  await member.getByTestId("check-answer").click();
  await expect(member.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
  await saved;
  await ctx.close();

  await page.reload();
  const row = page.getByTestId("member-list").getByRole("listitem").filter({ hasText: "saburo" });
  await row.getByRole("button", { name: "学習状況" }).click();
  await expect(page.getByTestId("member-submissions")).toBeVisible();
  await expect(page.getByTestId("member-submissions")).toContainText("不正解");
  await expect(page.getByTestId("member-submissions")).toContainText("ボタンを離すと消えてしまう");
});

test("組織のメンバーだけに問題を公開できる", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("限定公開テスト");
  await createOrgWithInvite(page, orgName);

  // サンドボックスで回路とテストを作り、組織限定で投稿する
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("part-out").click();
  await page.getByTestId("connect-row").click();
  await page.getByTestId("mode-test").click();
  await page.getByTestId("add-test-case").click();
  await page.getByTestId("case-0-add-on").click();
  await page.getByTestId("case-0-expect-on").click();

  const title = unique("組織限定の問題");
  await page.getByTestId("sandbox-publish").click();
  await page.getByTestId("publish-title").fill(title);
  await page.getByTestId("publish-spec").fill("組織のメンバーだけが見られる問題です。");
  await page.getByTestId("publish-visibility").selectOption("org");
  await expect(page.getByTestId("publish-org")).toBeVisible();
  await page.getByTestId("publish-submit").click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const url = page.url();

  // 組織外のユーザーには見えない
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const outsider = await ctx.newPage();
  await signUp(outsider, "outsider");
  await outsider.goto("/community");
  await outsider.getByTestId("search-input").fill(title);
  await expect(outsider.getByTestId("empty-list")).toBeVisible();
  await outsider.goto(url);
  await expect(outsider.getByTestId("problem-error")).toBeVisible();
  await ctx.close();
});

test("ランキングが指標と期間で切り替わる", async ({ page }) => {
  await signUp(page, "ranker");
  // 1 問クリアして記録を作る
  await page.goto("/problems/selfhold-read-1");
  await page.getByTestId("choice-1").click();
  await page.getByTestId("next-question").click();
  await page.getByTestId("choice-0").click();
  await expect(page.getByTestId("read-complete")).toHaveAttribute("data-cleared", "true");

  await page.goto("/rankings");
  await expect(page.getByRole("heading", { name: "ランキング" })).toBeVisible();
  await expect(page.getByTestId("metric-solved")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ranking-computed-at")).toBeVisible();

  // 連続学習日数に切り替えると、期間の切り替えが無効になる
  await page.getByTestId("metric-streak").click();
  await expect(page.getByTestId("period-weekly")).toBeDisabled();
  await expect(page.getByText("連続学習日数は「いまの連続」なので")).toBeVisible();

  await page.getByTestId("metric-solved").click();
  await page.getByTestId("period-all").click();
  await expect(page.getByTestId("period-all")).toHaveAttribute("aria-pressed", "true");
});

test("組織内ランキングに切り替えられる", async ({ page }) => {
  await signUp(page, "orgranker");
  const orgName = unique("ランキング組織");
  await createOrgWithInvite(page, orgName);

  await page.goto("/rankings");
  await page.getByTestId("ranking-scope").selectOption({ label: orgName });
  await expect(page.getByTestId("ranking-computed-at")).toContainText("いま計算した結果");
});

test("未ログインでは全体ランキングは見られ、組織にはログインを促す", async ({ page }) => {
  await page.goto("/rankings");
  await expect(page.getByRole("heading", { name: "ランキング" })).toBeVisible();
  await expect(page.getByTestId("ranking-scope")).toHaveCount(0);

  await page.goto("/orgs");
  await expect(page.getByText("組織を使うにはログインしてください")).toBeVisible();
});

test("管理者はクラス全体の進捗を表で一望できる", async ({ page, browser }) => {
  await signUp(page, "admin");
  const orgName = unique("一覧表テスト");
  const code = await createOrgWithInvite(page, orgName);

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "shiro");
  await member.goto("/orgs");
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");

  // 1 問クリアし、別の 1 問で詰まる
  await member.goto("/problems/selfhold-read-1");
  await member.getByTestId("choice-1").click();
  await member.getByTestId("next-question").click();
  const cleared = waitForPost(member, ATTEMPTS);
  await member.getByTestId("choice-0").click();
  await expect(member.getByTestId("read-complete")).toHaveAttribute("data-cleared", "true");
  await cleared;

  await member.goto("/problems/selfhold-fix-1");
  const attempted = waitForPost(member, ATTEMPTS);
  const submitted = waitForPost(member, SUBMISSIONS);
  await member.getByTestId("check-answer").click();
  await expect(member.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
  await Promise.all([attempted, submitted]);
  await ctx.close();

  await page.reload();
  await page.getByTestId("org-tab-matrix").click();
  const matrix = page.getByTestId("progress-matrix");
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText("shiro");

  // クリアした問題は ○、詰まっている問題は △、触っていない問題は空欄
  const row = matrix.locator('[data-testid^="matrix-row-"]').filter({ hasText: "shiro" });
  await expect(row.locator('[data-testid$="-selfhold-read-1"]')).toHaveAttribute(
    "data-state",
    "cleared",
  );
  await expect(row.locator('[data-testid$="-selfhold-fix-1"]')).toHaveAttribute(
    "data-state",
    "stuck",
  );
  await expect(row.locator('[data-testid$="-combo-write-2"]')).toHaveAttribute(
    "data-state",
    "untouched",
  );
  await expect(row).toContainText("1 / 35");
});

test("メンバーには一覧表のタブが出ない", async ({ page, browser }) => {
  await signUp(page, "admin");
  const code = await createOrgWithInvite(page, unique("一覧表の権限テスト"));

  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const member = await ctx.newPage();
  await signUp(member, "goro");
  await member.goto("/orgs");
  await member.getByTestId("org-code").fill(code);
  await member.getByTestId("org-join").click();
  await expect(member.getByTestId("org-message")).toContainText("参加しました");
  await member
    .getByTestId("org-list")
    .getByText(/一覧表の権限テスト/)
    .click();

  await expect(member.getByTestId("org-tab-assignments")).toBeVisible();
  await expect(member.getByTestId("org-tab-matrix")).toHaveCount(0);
  await ctx.close();
});

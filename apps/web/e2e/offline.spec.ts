import { expect, type Page, test } from "@playwright/test";

/**
 * オフライン対応(改善候補 6 / DECISIONS.md S-013)。
 *
 * シミュレータ・判定・公式問題はすべてクライアント側にある(SPEC.md §6)ので、
 * 画面とアセットさえ手元にあれば、未ログインの学習はオフラインで完結する。
 *
 * Service Worker は初回訪問で通った分を貯める方式なので、**2 回目の訪問から**動く。
 * どのテストもまず 1 回オンラインで開いてから、オフラインにしている。
 */

/**
 * Service Worker が画面を受け持つところまで持っていく。
 *
 * 登録して `clients.claim()` が済んでも、**その次のページ読み込みから**しか
 * ナビゲーションを受け持たない(Service Worker の仕様どおりの挙動)。
 * だから待つだけでは足りず、1 回読み直す必要がある。
 * 実際の利用でも「初めて開いた直後にいきなり圏外」は効かない(S-013)。
 */
async function activateServiceWorker(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 15_000,
  });
  await page.goto(path);
}

test("マニフェストとアイコンを配信している", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as { name: string; start_url: string; icons: unknown[] };
  expect(body.name).toContain("ラダー図");
  expect(body.start_url).toBe("/");
  expect(body.icons.length).toBeGreaterThan(0);

  const icon = await page.request.get("/icon.svg");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("svg");
});

test("Service Worker は /sw.js として配信され、SPA フォールバックに食われない", async ({
  page,
}) => {
  const res = await page.request.get("/sw.js");
  expect(res.status()).toBe(200);
  const text = await res.text();
  // index.html が返ってきていないこと
  expect(text).not.toContain("<!doctype html>");
  expect(text).toContain("addEventListener");
});

test("2 回目の訪問からオフラインでも公式問題を解ける", async ({ page, context }) => {
  await activateServiceWorker(page, "/problems/selfhold-fix-1");
  await expect(page.getByTestId("check-answer")).toBeVisible();

  await context.setOffline(true);
  try {
    await page.goto("/problems/selfhold-fix-1");
    // 画面が出て、判定まで動く(判定はクライアント側なのでサーバーは要らない)
    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
    await expect(page.getByTestId("time-chart")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("オフラインだと一覧に案内が出て、つながると消える", async ({ page, context }) => {
  await activateServiceWorker(page, "/");
  await expect(page.getByTestId("offline-notice")).toHaveCount(0);

  await context.setOffline(true);
  try {
    await expect(page.getByTestId("offline-notice")).toBeVisible();
    await expect(page.getByTestId("offline-notice")).toContainText("公式問題とサンドボックス");
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByTestId("offline-notice")).toHaveCount(0);
});

test("一度も開いていない画面も、オフラインで開ける", async ({ page, context }) => {
  await activateServiceWorker(page, "/");

  await context.setOffline(true);
  try {
    await page.goto("/problems/timer-read-0");
    await expect(page.getByRole("heading", { name: "タイマは何を数えている?" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("オフラインでもサンドボックスで回路を組んで動かせる", async ({ page, context }) => {
  await activateServiceWorker(page, "/sandbox");

  await context.setOffline(true);
  try {
    await page.goto("/sandbox");
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
  } finally {
    await context.setOffline(false);
  }
});

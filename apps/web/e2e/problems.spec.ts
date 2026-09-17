import { expect, type Page, test } from "@playwright/test";
import { SUBMISSIONS, waitForPost } from "./sync.js";

/**
 * 学習モード(SPEC.md §3.2)と判定結果の表示(§3.3)。
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

async function signUp(page: Page): Promise<void> {
  const email = `mistake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { email, password: "correct-horse-battery", name: "つまずく人" },
  });
  expect(res.status()).toBe(200);
}

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

    // シミュレータで答え合わせできる。
    // 既定は設問と同じ操作の再生(S-022)。ここでは自分で動かすほうを確かめる
    await page.getByTestId("verify-with-simulator").click();
    await page.getByTestId("verify-mode-free").click();
    const y0 = page.getByTestId("device-Y0");
    await expect(y0).toHaveAttribute("data-on", "false");
    // 1 回押すと押して離したことになる。自己保持なので点いたまま(S-027)
    await page.getByTestId("input-X0").click();
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

    await page.goto("/problems");
    await expect(page.getByTestId("problem-selfhold-read-1")).toHaveAttribute(
      "data-cleared",
      "true",
    );
    await expect(page.getByTestId("cleared-count")).toContainText(/1 \/ \d+ 問クリア/);
  });
});

test.describe("直す", () => {
  test("不正解のときは、どの操作で何が違ったかが出る", async ({ page }) => {
    await page.goto("/problems/selfhold-fix-1");
    // 「か所」とは言わない(S-025)。1 つの不具合を直すのに複数マス触ることがある
    await expect(page.getByTestId("fix-hint")).toContainText("直すべきところが 1 つ");
    await expect(page.getByTestId("fix-hint")).toContainText("直すマスは 1 つとは限りません");

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
    await page.goto("/problems");
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
    // X0 直結の回路なので、押している間しか点かない。「保持」で ON のままにする(S-027)
    await page.getByTestId("hold-X0").click();
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

test.describe("タイムチャート", () => {
  test("不正解のとき、波形と操作の並びが出る", async ({ page }) => {
    await page.goto("/problems/selfhold-fix-1");
    await page.getByTestId("check-answer").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");

    const chart = page.getByTestId("time-chart");
    await expect(chart).toBeVisible();
    // 入力と出力の両方の波形が出る
    await expect(chart.getByTestId("chart-row-X0")).toBeVisible();
    await expect(chart.getByTestId("chart-row-Y0")).toBeVisible();
    // 食い違ったデバイスの行が目立つ
    await expect(chart.getByTestId("chart-row-Y0")).toHaveAttribute("data-mismatched", "true");
    // 何をした結果なのかが読める
    await expect(chart).toContainText("押して離す");
  });

  test("正解したら波形は出ない", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    // 読む問題には答え合わせが無いので、波形も出ない
    await expect(page.getByTestId("time-chart")).toHaveCount(0);
  });
});

test.describe("みんながつまずくところ", () => {
  // 公式問題の集計は全員で 1 つ。ローカル D1 は mobile / desktop で共有し、
  // 実行を重ねると数も増えていく。だから E2E は「出るか / 読めるか」だけを見て、
  // 数え方そのもの(重複を弾く・並び順・しきい値)は API テストで固めている
  test("誰もつまずいていない問題では出ない", async ({ page }) => {
    // この問題は他のテストで答え合わせしないこと(数えられてしまうと前提が崩れる)
    await page.goto("/problems/combo-write-2");
    await expect(page.getByTestId("common-mistakes")).toHaveCount(0);
  });

  test("しきい値の人数がつまずくと、人数つきで出る", async ({ browser }) => {
    // この問題も、集計のためだけに使う
    const problemId = "counter-fix-2";
    const MIN_USERS = 3;

    for (let i = 0; i < MIN_USERS; i++) {
      const ctx = await browser.newContext({ baseURL: BASE_URL });
      const learner = await ctx.newPage();
      await signUp(learner);
      await learner.goto(`/problems/${problemId}`);
      const submitted = waitForPost(learner, SUBMISSIONS);
      await learner.getByTestId("check-answer").click();
      await expect(learner.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
      await submitted;
      await ctx.close();
    }

    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const viewer = await ctx.newPage();
    await viewer.goto(`/problems/${problemId}`);
    const panel = viewer.getByTestId("common-mistakes");
    await expect(panel).toBeVisible();
    // 自己保持の枝が無いままなので、この間違いが数えられている
    const row = panel.getByTestId("common-mistake-no-self-hold");
    // 畳んである。開くかどうかは本人に決めてもらう
    await expect(row).toBeHidden();
    await panel.getByText("みんながつまずくところ").click();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/[0-9]+ 人/);
    await expect(row).toContainText("自己保持");
    await ctx.close();
  });
});

test.describe("復習の提案", () => {
  /** localStorage に「昔クリアした」進捗を直接置く(未ログインの進捗、S-002) */
  async function seedOldClear(page: Page, problemId: string, daysAgo: number) {
    await page.goto("/problems");
    await page.evaluate(
      ([id, days]) => {
        const at = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
        localStorage.setItem(
          "ladder-dojo:progress:v1",
          JSON.stringify({
            [String(id)]: {
              cleared: true,
              clearedAt: at,
              lastAttemptAt: at,
              attempts: 1,
              failures: 0,
            },
          }),
        );
      },
      [problemId, String(daysAgo)] as const,
    );
    await page.reload();
  }

  test("クリアしたばかりの問題は出ない", async ({ page }) => {
    await seedOldClear(page, "selfhold-read-1", 1);
    await expect(page.getByTestId("review-suggestions")).toHaveCount(0);
  });

  test("日が経った問題は「そろそろ復習しませんか」に出る", async ({ page }) => {
    await seedOldClear(page, "selfhold-read-1", 40);
    const panel = page.getByTestId("review-suggestions");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("押しボタンを離したらどうなる?");
    await expect(panel).toContainText("か月ぶり");

    // 押すとその問題へ行ける
    await panel.getByTestId("review-selfhold-read-1").click();
    await expect(
      page.getByRole("heading", { name: "押しボタンを離したらどうなる?" }),
    ).toBeVisible();
  });

  test("解き直すと提案から消える", async ({ page }) => {
    await seedOldClear(page, "selfhold-read-1", 40);
    await expect(page.getByTestId("review-suggestions")).toBeVisible();

    await page.goto("/problems/selfhold-read-1");
    await page.getByTestId("choice-1").click();
    await page.getByTestId("next-question").click();
    await page.getByTestId("choice-0").click();
    await expect(page.getByTestId("read-complete")).toHaveAttribute("data-cleared", "true");

    await page.goto("/problems");
    await expect(page.getByTestId("review-suggestions")).toHaveCount(0);
  });
});

import { expect, test } from "@playwright/test";

/**
 * サンドボックスの編集(SPEC.md §3.1「部品パレットからグリッドに置く。スマホでも操作できる」)。
 * ここで組む回路は自己保持: (X0 または Y0) かつ X1 でない → Y0
 */
test("回路を組み立てて、その場で動かせる", async ({ page }) => {
  await page.goto("/sandbox");
  await expect(page.getByRole("heading", { name: "サンドボックス" })).toBeVisible();

  const selectCell = async (row: number, col: number) => {
    await page.getByTestId(`cell-${row}-${col}`).click();
    await expect(page.getByTestId("editor-hint")).toHaveText(`選択中: ${row + 1} 行 ${col + 1} 列`);
  };

  // 1 行目: X0(a接点)→ X1(b接点)→ Y0(出力コイル)
  await selectCell(0, 0);
  await page.getByTestId("device-type-X").click();
  await expect(page.getByTestId("current-device")).toHaveValue("X0");
  await page.getByTestId("part-no").click();

  await selectCell(0, 1);
  await page.getByTestId("device-number-inc").click();
  await expect(page.getByTestId("current-device")).toHaveValue("X1");
  await page.getByTestId("part-nc").click();

  await selectCell(0, 5);
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("device-number-dec").click();
  await expect(page.getByTestId("current-device")).toHaveValue("Y0");
  await page.getByTestId("part-out").click();

  // 接点とコイルの間を横線でつなぐ
  await page.getByTestId("connect-row").click();

  // 2 行目: Y0 の a 接点(自己保持の枝)
  await selectCell(1, 0);
  await page.getByTestId("part-no").click();

  // 1 行目の 1 列目の右端から下へ縦線を引いて並列にする
  await selectCell(0, 0);
  await page.getByTestId("toggle-vline").click();
  await expect(page.getByTestId("toggle-vline")).toHaveText("縦線を外す");

  // 動かす
  await page.getByTestId("mode-run").click();
  const y0 = page.getByTestId("device-Y0");
  await expect(y0).toHaveAttribute("data-on", "false");

  await page.getByTestId("input-X0").click(); // 押して離す
  await expect(y0).toHaveAttribute("data-on", "true"); // 離しても保持

  await page.getByTestId("input-X1").click();
  await expect(y0).toHaveAttribute("data-on", "false"); // 停止で解除
});

test("置けない場所には置けず、理由が出る", async ({ page }) => {
  await page.goto("/sandbox");

  // 最右列に接点は置けない
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("part-no").click();
  await expect(page.getByRole("alert")).toHaveText("一番右の列にはコイルしか置けません");

  // 最右列以外にコイルは置けない
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-out").click();
  await expect(page.getByRole("alert")).toHaveText("コイルは一番右の列にだけ置けます");
});

test("行と列を増減できる", async ({ page }) => {
  await page.goto("/sandbox");
  await expect(page.getByTestId("cell-2-5")).toBeVisible();
  await expect(page.getByTestId("cell-3-0")).toHaveCount(0);

  await page.getByTestId("add-row").click();
  await expect(page.getByTestId("cell-3-0")).toBeVisible();

  await page.getByTestId("add-col").click();
  await expect(page.getByTestId("cell-0-6")).toBeVisible();

  await page.getByTestId("remove-col").click();
  await expect(page.getByTestId("cell-0-6")).toHaveCount(0);

  await page.getByTestId("cell-3-0").click();
  await page.getByTestId("remove-row").click();
  await expect(page.getByTestId("cell-3-0")).toHaveCount(0);
});

test("置いた部品を消せる", async ({ page }) => {
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");

  await page.getByTestId("part-delete").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
});

test("置いた部品を元に戻せて、やり直せる(S-038)", async ({ page }) => {
  await page.goto("/sandbox");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();

  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
  await expect(page.getByTestId("editor-redo")).toBeEnabled();

  await page.getByTestId("editor-redo").click();
  await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");

  // キーボードでも戻せる
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
});

test("共有リンクを開くと、同じ回路がサンドボックスに出る(S-039)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("part-out").click();
  await page.getByTestId("connect-row").click();
  await page.getByTestId("sandbox-title").fill("共有する回路");

  await page.getByTestId("share-open").click();
  const url = await page.getByTestId("share-url").inputValue();
  expect(url).toContain("/sandbox#c=v1.6.3.");
  expect(url).toContain("&t=");

  await page.getByTestId("share-copy").click();
  await expect(page.getByTestId("share-copy")).toHaveText("コピーしました");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // 受け取った側: まっさらな状態でリンクを開く
  await page.goto("/");
  await page.goto(url);
  await expect(page.getByTestId("sandbox-message")).toContainText("共有された回路を開きました");
  await expect(page.getByTestId("sandbox-title")).toHaveValue("共有する回路");
  await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");
  await expect(page.getByTestId("cell-text-0-5")).toHaveText("Y0");

  // 「新規」でリンクが外れ、白紙に戻る
  await page.getByTestId("sandbox-new").click();
  await expect(page).toHaveURL(/\/sandbox$/);
  await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
});

test("動かしながら操作を記録して、そのままテストにできる(S-042)", async ({ page }) => {
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("part-out").click();
  await page.getByTestId("connect-row").click();

  await page.getByTestId("mode-run").click();
  await page.getByTestId("record-start").click();
  await expect(page.getByTestId("record-status")).toContainText("記録中");

  // X0 を保持 → Y0 が点いたことを確認 → 保持を外す → 終える(消えたことの確認は自動で付く)
  await page.getByTestId("hold-X0").click();
  await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");
  await page.getByTestId("record-expect").click();
  await expect(page.getByTestId("record-status")).toContainText("2 手");
  await page.getByTestId("hold-X0").click();
  await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "false");
  await page.getByTestId("record-stop").click();
  await expect(page.getByTestId("sandbox-message")).toContainText(
    "テスト「記録 1」として追加しました",
  );
  await expect(page.getByTestId("record-start")).toBeVisible();

  await page.getByTestId("mode-test").click();
  await expect(page.getByTestId("mode-test")).toContainText("テスト (1)");
  await expect(page.getByTestId("test-title-0")).toHaveValue("記録 1");
  // 待ち時間の手が間に入ることがあるので、順番だけを見る
  await expect(page.locator('[data-testid^="case-0-step-"]')).toContainText([
    "X0 を ON",
    "Y0=ON",
    "X0 を OFF",
    "Y0=OFF",
  ]);
  await page.getByTestId("run-tests").click();
  await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");
});

test("SET / RST・立ち下がり・オフディレイを置いて動かせる(S-044)", async ({ page }) => {
  await page.goto("/sandbox");
  // 1 行目: X0 の a 接点 → SET Y0
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("part-set").click();
  await expect(page.getByTestId("cell-text-0-5")).toHaveText("Y0");
  await page.getByTestId("connect-row").click();

  // 2 行目: X1 の a 接点 → RST Y0
  await page.getByTestId("cell-1-0").click();
  await page.getByTestId("device-type-X").click();
  await page.getByTestId("device-number-inc").click();
  await page.getByTestId("part-no").click();
  await page.getByTestId("cell-1-5").click();
  await page.getByTestId("device-type-Y").click();
  await page.getByTestId("device-number-dec").click();
  await page.getByTestId("part-reset").click();
  await page.getByTestId("connect-row").click();

  // 3 行目: X1 の立ち下がり → オフディレイ T0(3 秒)
  await page.getByTestId("cell-2-0").click();
  await page.getByTestId("device-type-X").click();
  await page.getByTestId("device-number-inc").click();
  await page.getByTestId("part-fall").click();
  await page.getByTestId("cell-2-5").click();
  await page.getByTestId("device-type-T").click();
  await page.getByTestId("device-number-dec").click();
  await page.getByTestId("part-offdelay").click();
  await expect(page.getByTestId("cell-text-2-5")).toHaveText("T0 K30");
  await page.getByTestId("connect-row").click();

  await page.getByTestId("mode-run").click();
  const y0 = page.getByTestId("device-Y0");
  const t0 = page.getByTestId("device-T0");
  await page.getByTestId("input-X0").click();
  await expect(y0).toHaveAttribute("data-on", "true"); // SET で点いたまま
  await expect(t0).toHaveAttribute("data-on", "false");

  await page.getByTestId("input-X1").click();
  await expect(y0).toHaveAttribute("data-on", "false"); // RST で消える
  // 離した瞬間の立ち下がりでオフディレイが動き、3 秒のあいだ ON を保つ
  await expect(t0).toHaveAttribute("data-on", "true");
  await page.waitForTimeout(1000);
  await expect(t0).toHaveAttribute("data-on", "true");
  await expect(t0).toHaveAttribute("data-on", "false", { timeout: 5000 });
});

test("壊れた共有リンクは無視して、白紙のサンドボックスになる", async ({ page }) => {
  await page.goto("/sandbox#c=v1.6.3.0,0,zzz");
  await expect(page.getByRole("heading", { name: "サンドボックス" })).toBeVisible();
  await expect(page.getByTestId("sandbox-message")).toHaveCount(0);
  await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);
});

test("タイマの設定値を変えて置ける", async ({ page }) => {
  await page.goto("/sandbox");
  await page.getByTestId("cell-0-0").click();
  await page.getByTestId("part-no").click();

  await page.getByTestId("preset-sec-inc").click(); // 3.0 → 3.5
  await expect(page.getByTestId("preset-sec")).toHaveText("3.5");

  await page.getByTestId("cell-0-5").click();
  await page.getByTestId("part-timer").click();
  await expect(page.getByTestId("current-device")).toHaveValue("T0");
  // 既定は三菱系の表記。タイマの設定値は 0.1 秒を 1 として数える(3.5 秒 = K35、S-028)
  await expect(page.getByTestId("cell-text-0-5")).toHaveText("T0 K35");
});

test.describe("保存とテストケース(§3.4)", () => {
  async function signUp(page: import("@playwright/test").Page) {
    const email = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const res = await page.request.post("/api/auth/sign-up/email", {
      data: { email, password: "correct-horse-battery", name: "保存テスト" },
    });
    expect(res.status()).toBe(200);
  }

  /** X0 の a 接点 → Y0 コイルの最小回路を作る */
  async function buildMinimal(page: import("@playwright/test").Page) {
    await page.getByTestId("cell-0-0").click();
    await page.getByTestId("part-no").click();
    await page.getByTestId("cell-0-5").click();
    await page.getByTestId("device-type-Y").click();
    await page.getByTestId("part-out").click();
    await page.getByTestId("connect-row").click();
  }

  test("未ログインでは保存できない旨が出る", async ({ page }) => {
    await page.goto("/sandbox");
    await expect(page.getByText("保存するにはログインしてください")).toBeVisible();
    await expect(page.getByTestId("sandbox-save")).toHaveCount(0);
  });

  test("テストケースを付けて保存し、読み込み直せる", async ({ page }) => {
    await signUp(page);
    await page.goto("/sandbox");
    await expect(page.getByTestId("auth-bar")).toHaveAttribute("data-signed-in", "true");

    await buildMinimal(page);

    // テストケース: X0 を ON にして Y0 が ON になることを確かめる
    await page.getByTestId("mode-test").click();
    await page.getByTestId("add-test-case").click();
    await page.getByTestId("test-title-0").fill("押すと点く");
    await page.getByTestId("case-0-add-on").click();
    await page.getByTestId("case-0-expect-on").click();
    await expect(page.getByTestId("case-0-step-0")).toContainText("X0 を ON");
    await expect(page.getByTestId("case-0-step-1")).toContainText("Y0=ON");

    // その場で実行できる
    await page.getByTestId("run-tests").click();
    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "true");

    // 保存
    await page.getByTestId("sandbox-title").fill("保存テスト回路");
    await page.getByTestId("sandbox-save").click();
    await expect(page.getByTestId("sandbox-message")).toContainText("保存しました");

    // 新規にしてから読み込み直すと、回路もテストも戻る
    await page.getByTestId("sandbox-new").click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveCount(0);

    // 「開く」だけで引くと、ヘッダーの「メニューを開く」と当たる。
    // 保存した回路の「開く」を名指しする(保存したのは 1 件)
    await page.locator('[data-testid^="load-"]').first().click();
    await expect(page.getByTestId("sandbox-title")).toHaveValue("保存テスト回路");
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("X0");
    await expect(page.getByTestId("mode-test")).toContainText("テスト (1)");
  });

  test("保存した回路を削除できる", async ({ page }) => {
    await signUp(page);
    await page.goto("/sandbox");
    await buildMinimal(page);
    await page.getByTestId("sandbox-title").fill("消す回路");
    await page.getByTestId("sandbox-save").click();
    await expect(page.getByTestId("sandbox-message")).toContainText("保存しました");
    await expect(page.getByText("消す回路")).toBeVisible();

    // 取り消せない操作なので、もう一度押して初めて消える
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByTestId("sandbox-message")).toContainText("削除しました");
    await expect(page.getByText("消す回路")).toHaveCount(0);
  });

  test("テストが通らない回路は、その場で差分が出る", async ({ page }) => {
    await signUp(page);
    await page.goto("/sandbox");
    await buildMinimal(page);

    await page.getByTestId("mode-test").click();
    await page.getByTestId("add-test-case").click();
    // わざと「押していないのに ON」という誤ったテストを書く
    await page.getByTestId("case-0-expect-on").click();
    await page.getByTestId("run-tests").click();

    await expect(page.getByTestId("judge-result")).toHaveAttribute("data-passed", "false");
    await expect(page.getByTestId("diff-Y0")).toContainText("OFF");
  });
});

/**
 * デバイスの選び方(S-050)。
 *
 * 番号を +/− で 1 ずつしか動かせず、オムロン系では内部の番号(X100)と画面の名前
 * (6.04)が食い違って壊れて見えた(人間の指摘)。表記のままの名前を打てること、
 * 回路にあるデバイスをタップで選べることを確かめる。
 */
test.describe("デバイスの選び方(S-050)", () => {
  test("オムロン系で 100.00 と打つと出力 Y0 になり、種類も切り替わる", async ({ page }) => {
    await page.goto("/sandbox");
    await page.getByRole("button", { name: "オムロン系" }).click();
    await page.getByTestId("cell-0-0").click();
    const field = page.getByTestId("current-device");
    await expect(field).toHaveValue("0.00");

    await field.fill("100.00");
    await expect(field).toHaveValue("100.00");
    await expect(page.getByTestId("device-type-Y")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("part-no").click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("100.00");

    // 三菱系に戻すと同じデバイスが Y0 と出る
    await page.getByRole("button", { name: "三菱系" }).click();
    await expect(page.getByTestId("cell-text-0-0")).toHaveText("Y0");
    await expect(field).toHaveValue("Y0");
  });

  test("読めない名前は赤くなり、離れると元に戻る", async ({ page }) => {
    await page.goto("/sandbox");
    await page.getByTestId("cell-0-0").click();
    const field = page.getByTestId("current-device");
    await field.fill("abc");
    await expect(page.getByTestId("device-invalid")).toBeVisible();
    await field.blur();
    await expect(field).toHaveValue("X0");
    await expect(page.getByTestId("device-invalid")).toHaveCount(0);
  });

  test("回路にあるデバイスをタップで選び直せる(自己保持の接点)", async ({ page }) => {
    await page.goto("/sandbox");
    // Y0 のコイルを置く
    await page.getByTestId("cell-0-5").click();
    await page.getByTestId("device-type-Y").click();
    await page.getByTestId("part-out").click();
    await expect(page.getByTestId("device-chip-Y0")).toBeVisible();

    // 2 行目に Y0 の a 接点(自己保持)。種類は X に戻っていても、チップで Y0 を選べる
    await page.getByTestId("cell-1-0").click();
    await page.getByTestId("device-type-X").click();
    await page.getByTestId("device-chip-Y0").click();
    await expect(page.getByTestId("current-device")).toHaveValue("Y0");
    await page.getByTestId("part-no").click();
    await expect(page.getByTestId("cell-text-1-0")).toHaveText("Y0");

    // 「次の空き」は、いまの種類でまだ使っていない番号
    await page.getByTestId("device-chip-next").click();
    await expect(page.getByTestId("current-device")).toHaveValue("Y1");
  });
});

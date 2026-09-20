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

    // 最初の駒は「何も操作していない状態」。押して離すは 2 駒(押している間・離したあと)
    await expect(page.getByTestId("replay-position")).toHaveText("1 / 3");
    await expect(page.getByTestId("replay-caption")).toContainText("何も操作していない");
  });

  test("**操作を送ると回路の通電が変わる**(予測どおりになるのを目で見る)", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("verify-with-simulator").click();

    // 問題文の静止図にも同じマスがあるので、再生側に絞る
    const replay = page.getByTestId("scenario-replay");

    // 操作前: 自己保持の枝(1 行目)は通電していない
    await expect(replay.getByTestId("cell-1-0")).toHaveAttribute("data-flowing", "false");

    // 押している間: X0 の接点を通って点く(S-047 で押した瞬間も駒になった)
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText("X0");
    await expect(page.getByTestId("replay-caption")).toContainText("押している");
    await expect(replay.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "true");
    // ON のデバイス名は橙になる
    await expect(replay.getByTestId("cell-text-0-0")).toHaveAttribute("data-on", "true");

    // 離したあと: 保持しているのは自己保持の枝のほう。X0 の接点は通っていない
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText("離した");
    await expect(replay.getByTestId("cell-1-0")).toHaveAttribute("data-flowing", "true");
    await expect(replay.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "false");
    await expect(replay.getByRole("img", { name: /通電中/ })).toBeVisible();
  });

  test("戻る・最初から で行ったり来たりできる", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("verify-with-simulator").click();

    await expect(page.getByTestId("replay-prev")).toBeDisabled();
    await page.getByTestId("replay-next").click();
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-position")).toHaveText("3 / 3");
    await expect(page.getByTestId("replay-next")).toBeDisabled();

    await page.getByTestId("replay-prev").click();
    await expect(page.getByTestId("replay-position")).toHaveText("2 / 3");

    await page.getByTestId("replay-next").click();
    await page.getByTestId("replay-restart").click();
    await expect(page.getByTestId("replay-position")).toHaveText("1 / 3");
  });

  test("自分で動かすほうにも切り替えられる", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("verify-with-simulator").click();

    await page.getByTestId("verify-mode-free").click();
    await expect(page.getByTestId("scenario-replay")).toHaveCount(0);

    // 自由操作では入力を押せる
    await page.getByTestId("input-X0").click();
    await expect(page.getByRole("img", { name: /通電中/ }).first()).toBeVisible();

    await page.getByTestId("verify-mode-replay").click();
    await expect(page.getByTestId("scenario-replay")).toBeVisible();
  });

  test("SET で保持した出力は、通電が無くても名前が橙で点いていると分かる(S-047)", async ({
    page,
  }) => {
    await page.goto("/problems/selfhold-read-4");
    await page.getByTestId("choice-0").click();
    await page.getByTestId("verify-with-simulator").click();
    const replay = page.getByTestId("scenario-replay");
    // 押している間: SET のラングが通電
    await page.getByTestId("replay-next").click();
    await expect(replay.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "true");
    // 離したあと: どのラングも通電していないが、Y0 は ON のまま(名前が橙)
    await page.getByTestId("replay-next").click();
    await expect(replay.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "false");
    await expect(replay.getByTestId("cell-0-3")).toHaveAttribute("data-flowing", "false");
    await expect(replay.getByTestId("cell-text-0-3")).toHaveAttribute("data-on", "true");
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");
  });

  /**
   * 設問のスタート時点(S-048)。
   *
   * 「そのあと X1 を押して離すと」の設問で、図が何も操作していない状態のままだと
   * 「そのあとってなに?」となる(人間の指摘)。前の操作を済ませた状態(点いている
   * ランプ)を図に出し、再生もそこから始める。
   */
  test("「そのあと」の設問は、前の操作を済ませた状態から始まる(S-048)", async ({ page }) => {
    await page.goto("/problems/selfhold-read-4");
    const stage = page.getByTestId("read-stage");
    // 設問 1: 前提なし
    await expect(page.getByTestId("read-start")).toContainText("まだ何も操作していない");
    await expect(stage.getByTestId("cell-text-0-3")).not.toHaveAttribute("data-on", "true");

    await page.getByTestId("choice-0").click();
    await page.getByTestId("next-question").click();
    await expect(page.getByText(/設問 2 \/ 3/)).toBeVisible();

    // 設問 2「そのあと X1 を押して離すと」: X0 を押して離したあとが図に出る。
    // SET で保持した Y0 は、どのラングも通電していなくても点いている
    await expect(page.getByTestId("read-start")).toContainText("X0");
    await expect(page.getByTestId("read-start")).toContainText("押して離す");
    await expect(stage.getByTestId("cell-text-0-3")).toHaveAttribute("data-on", "true");
    await expect(stage.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "false");

    // 再生もその状態から始まる。前提の操作は「戻る」で見返せる
    await page.getByTestId("choice-0").click();
    await page.getByTestId("verify-with-simulator").click();
    await expect(page.getByTestId("replay-position")).toHaveText("3 / 5");
    await expect(page.getByTestId("replay-phase")).toHaveText("スタート時点");
    await expect(stage.getByTestId("cell-text-0-3")).toHaveAttribute("data-on", "true");

    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText("X1");
    await expect(stage.getByTestId("cell-1-0")).toHaveAttribute("data-flowing", "true");
    await page.getByTestId("replay-next").click();
    await expect(stage.getByTestId("cell-text-0-3")).not.toHaveAttribute("data-on", "true");
    await expect(page.getByTestId("replay-next")).toBeDisabled();

    await page.getByTestId("replay-restart").click();
    await expect(page.getByTestId("replay-position")).toHaveText("3 / 5");
    await page.getByTestId("replay-prev").click();
    await expect(page.getByTestId("replay-phase")).toHaveText("前提");
    await expect(page.getByTestId("replay-position")).toHaveText("2 / 5");
  });

  test("自己保持の 2 問目は、点いたままのランプから始まる(S-048)", async ({ page }) => {
    await answerFirst(page);
    await page.getByTestId("next-question").click();
    const stage = page.getByTestId("read-stage");
    // 「Y0 が点灯している状態で」: 自己保持の枝が通電し、Y0 が点いている
    await expect(stage.getByTestId("cell-1-0")).toHaveAttribute("data-flowing", "true");
    await expect(stage.getByTestId("cell-0-0")).toHaveAttribute("data-flowing", "false");
    await expect(stage.getByRole("img", { name: /通電中/ })).toBeVisible();
  });

  /**
   * 「あとに実行される行の結果が残る」を見せる(S-049)。
   *
   * SET と RST の両方に通電した駒は、図では両方のコイルが通電して見えるのに Y0 は OFF。
   * 「下の RST が勝つ」では分からない(人間の指摘)。行番号・「残る / 上書き」の印・
   * 理由の一言・スキャンの中を 1 行ずつ見る、の 4 つで見せる。
   */
  test("SET と RST の両方に通電した駒は、理由と「残る / 上書き」の印が出て、1 行ずつ見られる", async ({
    page,
  }) => {
    await page.goto("/problems/selfhold-read-4");
    const stage = page.getByTestId("read-stage");
    // 図には行番号が付いている
    await expect(stage.getByTestId("row-number-0")).toHaveText("1");
    await expect(stage.getByTestId("row-number-1")).toHaveText("2");

    // 設問 3「両方押したまま」まで進む
    await page.getByTestId("choice-0").click();
    await page.getByTestId("next-question").click();
    await page.getByTestId("choice-0").click();
    await page.getByTestId("next-question").click();
    await expect(page.getByText(/設問 3 \/ 3/)).toBeVisible();
    await page.getByTestId("choice-0").click();
    await page.getByTestId("verify-with-simulator").click();

    // 両方押した駒: 両方のコイルが通電、Y0 は OFF
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText(
      "X0(起動) と X1(停止) を押したまま",
    );
    await expect(stage.getByTestId("cell-0-3")).toHaveAttribute("data-flowing", "true");
    await expect(stage.getByTestId("cell-1-3")).toHaveAttribute("data-flowing", "true");
    await expect(stage.getByTestId("cell-text-0-3")).not.toHaveAttribute("data-on", "true");

    // 印: 1 行目の SET は上書き、2 行目の RST が残る。理由の一言も出る
    await expect(stage.getByTestId("coil-note-0")).toHaveAttribute("data-keeps", "false");
    await expect(stage.getByTestId("coil-note-1")).toHaveAttribute("data-keeps", "true");
    const note = page.getByTestId("coil-conflict");
    await expect(note).toContainText("1 行目の SET と 2 行目の RST が両方通電");
    await expect(note).toContainText("あとの 2 行目(RST)の結果が残り");

    // 1 行ずつ見る: 1 行目まで実行すると Y0 は ON、2 行目まで実行すると OFF
    await page.getByTestId("trace-open").click();
    await expect(page.getByTestId("rung-position")).toHaveText("1 / 2");
    await expect(page.getByTestId("rung-caption")).toContainText("1 行目まで実行");
    await expect(page.getByTestId("rung-caption")).toContainText("Y0(ランプ) は ON");
    await expect(stage.getByTestId("cell-text-0-3")).toHaveAttribute("data-on", "true");
    await expect(stage.getByTestId("row-focus-0")).toBeVisible();
    // まだ実行していない 2 行目は薄く、無電圧
    await expect(stage.getByTestId("cell-1-3")).toHaveAttribute("data-pending", "true");
    await expect(stage.getByTestId("cell-1-3")).toHaveAttribute("data-flowing", "false");
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");

    await page.getByTestId("rung-next").click();
    await expect(page.getByTestId("rung-caption")).toContainText("2 行目まで実行");
    await expect(page.getByTestId("rung-caption")).toContainText("Y0(ランプ) は OFF");
    await expect(stage.getByTestId("cell-text-0-3")).not.toHaveAttribute("data-on", "true");
    await expect(stage.getByTestId("cell-1-3")).toHaveAttribute("data-flowing", "true");
    await expect(page.getByTestId("rung-next")).toBeDisabled();

    // 閉じると駒の表示に戻る
    await page.getByTestId("rung-close").click();
    await expect(page.getByTestId("rung-trace")).toHaveCount(0);
    await expect(page.getByTestId("replay-position")).toHaveText("2 / 2");
  });

  test("図は 1 つだけで、答え合わせは上の図の上で動く(S-046)", async ({ page }) => {
    await answerFirst(page);
    // 答える前も後も、ラダー図は問題文の下の 1 つだけ
    await expect(page.getByRole("img", { name: /行目/ })).toHaveCount(1);
    await page.getByTestId("verify-with-simulator").click();
    await expect(page.getByRole("img", { name: /行目/ })).toHaveCount(1);
    const stage = page.getByTestId("read-stage");
    await expect(stage).toHaveAttribute("data-live", "true");
    // 図と操作ボタンが同じ画面に入る
    await expect(stage.getByTestId("replay-next")).toBeInViewport();
    await expect(stage.getByRole("img", { name: /行目/ })).toBeInViewport();

    // 図の下からも次の設問へ進める。進んだら図は静止に戻り、まず予測させる
    await page.getByTestId("stage-next-question").click();
    await expect(page.getByText(/設問 2 \/ 2/)).toBeVisible();
    await expect(stage).toHaveAttribute("data-live", "false");
    await expect(page.getByTestId("scenario-replay")).toHaveCount(0);
    await expect(page.getByTestId("verify-with-simulator")).toHaveCount(0);
  });

  test("答える前は答え合わせを出さない(先に予測させる)", async ({ page }) => {
    await page.goto("/problems/selfhold-read-1");
    await expect(page.getByTestId("verify-with-simulator")).toHaveCount(0);
  });

  test("待ち時間のある設問でも再生できる", async ({ page }) => {
    await page.goto("/problems/timer-read-1");
    await page.getByTestId("choice-1").click();
    await page.getByTestId("verify-with-simulator").click();

    await expect(page.getByTestId("replay-position")).toHaveText("1 / 4");
    await page.getByTestId("replay-next").click();
    await page.getByTestId("replay-next").click();
    await page.getByTestId("replay-next").click();
    await expect(page.getByTestId("replay-caption")).toContainText("秒待つ");
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

/**
 * 入力は押しボタン(S-027)。
 *
 * 「5 回押す」がそのまま 5 回数えられないと、カウンタの問題は**シミュレータが
 * 壊れている**ようにしか見えない。ここが崩れたら「読む」の答え合わせが嘘になる。
 */
test.describe("自分で動かす(押しボタンとして扱う)", () => {
  async function openFreePlay(page: import("@playwright/test").Page) {
    await page.goto("/problems/counter-read-1");
    await page.getByTestId("choice-0").click();
    await page.getByTestId("verify-with-simulator").click();
    await page.getByTestId("verify-mode-free").click();
  }

  test("X0 を 5 回押すと 5 回数えて完了ランプが点く", async ({ page }) => {
    await openFreePlay(page);
    const c0 = page.getByTestId("device-C0");
    await expect(c0).toContainText("0 / 5");

    for (let i = 0; i < 5; i++) {
      await page.getByTestId("input-X0").click();
      await page.waitForTimeout(60);
    }
    await expect(c0).toContainText("5 / 5");
    await expect(page.getByTestId("device-Y0")).toHaveAttribute("data-on", "true");
  });

  test("「保持」で押しっぱなしにしても 1 回しか数えない", async ({ page }) => {
    await openFreePlay(page);
    await page.getByTestId("hold-X0").click();
    await expect(page.getByTestId("hold-X0")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("device-C0")).toContainText("1 / 5");
    await expect(page.getByTestId("input-X0")).toHaveAttribute("data-on", "true");

    // 保持を外すと OFF に戻る
    await page.getByTestId("hold-X0").click();
    await expect(page.getByTestId("input-X0")).toHaveAttribute("data-on", "false");
  });

  /**
   * 速度を変えてもシミュレータを作り直さない(S-029)。
   * 作り直すと、数えた回数も点いているランプも消える
   */
  test("速度を変えても、それまで数えた回数は消えない", async ({ page }) => {
    await openFreePlay(page);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("input-X0").click();
      await page.waitForTimeout(60);
    }
    await expect(page.getByTestId("device-C0")).toContainText("3 / 5");

    await page.getByTestId("sim-speed-5").click();
    await expect(page.getByTestId("device-C0")).toContainText("3 / 5");

    await page.getByTestId("sim-speed-instant").click();
    await expect(page.getByTestId("device-C0")).toContainText("3 / 5");
  });
});

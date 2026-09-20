import { env } from "cloudflare:test";
import { type Circuit, ladder, nc, no, out, timer } from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * 投稿問題(SPEC.md §3.6 / フェーズ2)。
 * 投稿時のサーバー側再検証、可視性、いいね・難易度投票・通報、クリア率を確かめる。
 */

const selfHold = ladder(5).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
const broken = ladder(5).row(no("X0"), nc("X1"), out("Y0")).build();

/** API 側の 1 ページの件数と揃える */
const PAGE_SIZE = 20;

const goodCases = [
  {
    id: "start",
    title: "押して離しても点いたまま",
    steps: [
      { type: "press", device: "X0" },
      { type: "expect", outputs: { Y0: true } },
    ],
  },
  {
    id: "stop",
    title: "停止で消える",
    steps: [
      { type: "press", device: "X0" },
      { type: "press", device: "X1" },
      { type: "expect", outputs: { Y0: false } },
    ],
  },
];

function publishBody(over: Record<string, unknown> = {}) {
  return {
    title: "自己保持を作る",
    spec: "X0 で点灯・保持、X1 で消灯する回路を作ってください。",
    circuit: selfHold,
    testCases: goodCases,
    difficulty: 2,
    tags: ["自己保持"],
    ...over,
  };
}

async function publish(user: TestUser, over: Record<string, unknown> = {}) {
  return app.request(
    "/api/problems",
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify(publishBody(over)) },
    env,
  );
}

async function publishedId(user: TestUser, over: Record<string, unknown> = {}): Promise<string> {
  const res = await publish(user, over);
  expect(res.status).toBe(201);
  return ((await res.json()) as { problem: { id: string } }).problem.id;
}

describe("投稿(§3.6: 模範解答の自動チェック)", () => {
  it("模範解答がテストを通れば投稿できる", async () => {
    const user = await signUp();
    const res = await publish(user);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { problem: { title: string; clearRate: number | null } };
    expect(body.problem.title).toBe("自己保持を作る");
    expect(body.problem.clearRate).toBeNull();
  });

  it("模範解答が自分のテストを通らなければ投稿できない", async () => {
    const user = await signUp();
    const res = await publish(user, { circuit: broken });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; failures: Array<{ caseId: string }> };
    expect(body.error).toBe("solution_failed");
    expect(body.failures.map((f) => f.caseId)).toContain("start");

    // DB にも入っていない
    const row = await env.DB.prepare(
      "select count(*) as n from posted_problems where author_id = ?",
    )
      .bind(user.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("クライアントが「通った」と言っても、サーバーが自分で確かめる", async () => {
    const user = await signUp();
    // passed のような自己申告フィールドは受け付けない(スキーマに無い)
    const res = await publish(user, { circuit: broken, passed: true, verified: true });
    expect(res.status).toBe(422);
  });

  it("失敗の種類が分かる(期待と違う / 発振 / 重すぎる)", async () => {
    const user = await signUp();
    const res = await publish(user, { circuit: broken });
    const body = (await res.json()) as { failures: Array<{ kind: string }> };
    expect(body.failures[0]?.kind).toBe("mismatch");

    // 発振する回路
    const oscillator = ladder(4).row(nc("M0"), out("M0")).build();
    const osc = await publish(user, {
      circuit: oscillator,
      testCases: [
        {
          id: "osc",
          title: "発振",
          steps: [{ type: "expect", outputs: { M0: false } }],
        },
      ],
    });
    expect(osc.status).toBe(422);
    expect(((await osc.json()) as { failures: Array<{ kind: string }> }).failures[0]?.kind).toBe(
      "unstable",
    );
  });

  it("タイマを含む現実的な問題は、スキャン上限内で検証できる", async () => {
    const user = await signUp();
    const autoOff = ladder(5)
      .row(no("X0"), nc("T0"), out("Y0"))
      .row(no("Y0"))
      .row(no("Y0"), timer("T0", 3000))
      .v(0, 0)
      .build();
    const res = await publish(user, {
      title: "3 秒で自動停止",
      circuit: autoOff,
      testCases: [
        {
          id: "on",
          title: "押すと点く",
          steps: [
            { type: "press", device: "X0" },
            { type: "expect", outputs: { Y0: true } },
          ],
        },
        {
          id: "auto-off",
          title: "3 秒で消える",
          steps: [
            { type: "press", device: "X0" },
            { type: "wait", ms: 3100 },
            { type: "expect", outputs: { Y0: false } },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);
  });

  /**
   * 長いタイマの問題(S-030)。
   *
   * 以前は 30 秒ぶんしか確かめられず、**手元の答え合わせは通るのに投稿だけ 422** になった。
   * 判定を軽くしたぶん上限を広げ、実用的な長さは通るようにした
   */
  it("90 秒待つ問題は投稿できる", async () => {
    const user = await signUp();
    const slow = ladder(4).row(no("X0"), timer("T0", 90_000)).build();
    const res = await publish(user, {
      circuit: slow,
      testCases: [
        {
          id: "slow",
          title: "90 秒待つ",
          steps: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 90_000 },
            { type: "expect", outputs: { T0: true } },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);
  });

  /**
   * **スキーマが許す長さは、必ず検証しきれること**(S-030)。
   *
   * テストケースの待ち時間の合計はスキーマが 120 秒までに制限している。
   * 再検証の上限がそれより短いと、**スキーマ上は正しいのに投稿だけできない**
   * 問題ができてしまう(以前は 30 秒ぶんしか見ていなかった)
   */
  it("スキーマ上限いっぱい(120 秒)のテストでも投稿できる", async () => {
    const user = await signUp();
    const slow = ladder(4).row(no("X0"), timer("T0", 119_000)).build();
    const res = await publish(user, {
      circuit: slow,
      testCases: [
        {
          id: "slow",
          title: "120 秒待つ",
          steps: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 120_000 },
            { type: "expect", outputs: { T0: true } },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);
  });

  it("1 ケースずつは短くても、積み上げが重すぎれば打ち切られる(CPU 保護)", async () => {
    const user = await signUp();
    const slow = ladder(4).row(no("X0"), timer("T0", 200_000)).build();
    const res = await publish(user, {
      circuit: slow,
      testCases: Array.from({ length: 10 }, (_, i) => ({
        id: `slow${i}`,
        title: `30 秒待つ ${i}`,
        steps: [
          { type: "set" as const, inputs: { X0: true } },
          { type: "wait" as const, ms: 30_000 },
          { type: "expect" as const, outputs: { T0: false } },
        ],
      })),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { failures: Array<{ kind: string }> }).failures[0]?.kind).toBe(
      "limit",
    );
  });

  it("テストケースが無い投稿は 400", async () => {
    const user = await signUp();
    expect((await publish(user, { testCases: [] })).status).toBe(400);
  });

  it("テストケースが多すぎる投稿は 400(CPU 保護)", async () => {
    const user = await signUp();
    const many = Array.from({ length: 21 }, (_, i) => ({ ...goodCases[0], id: `tc${i}` }));
    expect((await publish(user, { testCases: many })).status).toBe(400);
  });

  it("未ログインでは投稿できない", async () => {
    const res = await app.request(
      "/api/problems",
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify(publishBody()) },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("一覧と取得", () => {
  it("未ログインでも公開問題の一覧が見える", async () => {
    const author = await signUp();
    const id = await publishedId(author, { title: "公開テスト用" });
    const res = await app.request("/api/problems", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { problems: Array<{ id: string }> };
    expect(body.problems.map((p) => p.id)).toContain(id);
  });

  it("模範解答は、クリアするまで他人には返らない", async () => {
    const author = await signUp("author");
    const solver = await signUp("solver");
    const id = await publishedId(author);

    const asOther = await app.request(`/api/problems/${id}`, { headers: authHeaders(solver) }, env);
    const otherBody = (await asOther.json()) as {
      problem: { solution: unknown; cleared: boolean };
    };
    expect(otherBody.problem.solution, "解く前に答えを見せない").toBeNull();
    expect(otherBody.problem.cleared).toBe(false);

    // 投稿者本人には見える
    const asAuthor = await app.request(
      `/api/problems/${id}`,
      { headers: authHeaders(author) },
      env,
    );
    const authorBody = (await asAuthor.json()) as {
      problem: { solution: unknown; isAuthor: boolean };
    };
    expect(authorBody.problem.solution).not.toBeNull();
    expect(authorBody.problem.isAuthor).toBe(true);

    // クリアすると見えるようになる
    await app.request(
      `/api/problems/${id}/attempts`,
      { method: "POST", headers: jsonHeaders(solver), body: JSON.stringify({ passed: true }) },
      env,
    );
    const afterClear = await app.request(
      `/api/problems/${id}`,
      { headers: authHeaders(solver) },
      env,
    );
    const cleared = (await afterClear.json()) as { problem: { solution: Circuit | null } };
    expect(cleared.problem.solution).toEqual(selfHold);
  });

  it("private な問題は他人からは見えない", async () => {
    const author = await signUp("author");
    const other = await signUp("other");
    const id = await publishedId(author, { visibility: "private", title: "非公開" });

    const res = await app.request(`/api/problems/${id}`, { headers: authHeaders(other) }, env);
    expect(res.status).toBe(404);

    const list = await app.request("/api/problems", { headers: authHeaders(other) }, env);
    const body = (await list.json()) as { problems: Array<{ id: string }> };
    expect(body.problems.map((p) => p.id)).not.toContain(id);

    // 本人には見える
    const mine = await app.request(
      "/api/problems?mine=true",
      { headers: authHeaders(author) },
      env,
    );
    const mineBody = (await mine.json()) as { problems: Array<{ id: string }> };
    expect(mineBody.problems.map((p) => p.id)).toContain(id);
  });

  it("タイトルと仕様文で検索できる", async () => {
    const author = await signUp();
    const id = await publishedId(author, { title: "タイマの練習問題" });
    const hit = await app.request("/api/problems?q=タイマの練習", {}, env);
    expect(
      ((await hit.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).toContain(id);

    const miss = await app.request("/api/problems?q=存在しない語句zzz", {}, env);
    expect(((await miss.json()) as { problems: unknown[] }).problems).toEqual([]);
  });

  it("タグと難易度で絞り込める", async () => {
    const author = await signUp();
    const id = await publishedId(author, { tags: ["カウンタ"], difficulty: 4 });

    const byTag = await app.request("/api/problems?tag=カウンタ", {}, env);
    expect(
      ((await byTag.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).toContain(id);

    const byDifficulty = await app.request("/api/problems?difficulty=4", {}, env);
    expect(
      ((await byDifficulty.json()) as { problems: Array<{ id: string }> }).problems.map(
        (p) => p.id,
      ),
    ).toContain(id);

    const other = await app.request("/api/problems?difficulty=1&tag=カウンタ", {}, env);
    expect(
      ((await other.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).not.toContain(id);
  });

  it("長い日本語の検索語でも落ちない(SQLite の LIKE 長さ上限)", async () => {
    const author = await signUp();
    // 50 バイトを超える(日本語 1 文字 = 3 バイト)
    const longTitle = "非常に長い日本語のタイトルで検索できることを確かめるための問題です";
    expect(new TextEncoder().encode(longTitle).length).toBeGreaterThan(50);
    const id = await publishedId(author, { title: longTitle });

    const res = await app.request(`/api/problems?q=${encodeURIComponent(longTitle)}`, {}, env);
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { problems: Array<{ id: string }> };
    expect(body.problems.map((p) => p.id)).toContain(id);
  });

  it("長い日本語のタグでも落ちない", async () => {
    const author = await signUp();
    const longTag = "とても長いタグ名前でも絞り込めることを確認する";
    expect(new TextEncoder().encode(longTag).length).toBeGreaterThan(50);
    const id = await publishedId(author, { tags: [longTag] });

    const res = await app.request(`/api/problems?tag=${encodeURIComponent(longTag)}`, {}, env);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(
      ((await res.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).toContain(id);
  });

  it("% や _ はワイルドカードではなく文字として扱う", async () => {
    const author = await signUp();
    const id = await publishedId(author, { title: "歩留まり 100% を目指す" });
    await publishedId(author, { title: "まったく別の問題" });

    // % をワイルドカードとして解釈していたら、別の問題まで引っかかる
    const res = await app.request(`/api/problems?q=${encodeURIComponent("100%")}`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { problems: Array<{ id: string; title: string }> };
    expect(body.problems.map((p) => p.id)).toContain(id);
    expect(body.problems.map((p) => p.title)).not.toContain("まったく別の問題");

    // _ も同様(1 文字ワイルドカードにしない)
    const underscore = await app.request(`/api/problems?q=${encodeURIComponent("1_0")}`, {}, env);
    expect(((await underscore.json()) as { problems: unknown[] }).problems).toEqual([]);
  });

  it("英字の検索は大文字小文字を区別しない", async () => {
    const author = await signUp();
    const id = await publishedId(author, { title: "Timer の練習" });
    const res = await app.request(`/api/problems?q=${encodeURIComponent("timer")}`, {}, env);
    expect(
      ((await res.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).toContain(id);
  });

  describe("全文検索(改善候補 12 / S-016)", () => {
    /** 検索して ID の一覧を返す */
    async function search(q: string, user?: TestUser): Promise<string[]> {
      const res = await app.request(
        `/api/problems?q=${encodeURIComponent(q)}`,
        user ? { headers: authHeaders(user) } : {},
        env,
      );
      expect(res.status, await res.clone().text()).toBe(200);
      return ((await res.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id);
    }

    it("3 文字以上の日本語で、題名からも説明からも見つかる", async () => {
      const author = await signUp();
      const byTitle = await publishedId(author, { title: "インタロックの練習" });
      const bySpec = await publishedId(author, {
        title: "まったく関係のない題名",
        spec: "ここにインタロックの話を書く",
      });

      const hits = await search("インタロック");
      expect(hits).toContain(byTitle);
      expect(hits).toContain(bySpec);
    });

    it("**2 文字の語でも見つかる**(索引に当たらないぶんは全表走査で拾う)", async () => {
      // trigram は 3 文字ずつの並びを索引にするので、2 文字には当たらない。
      // 日本語では「保持」「接点」「出力」のような 2 文字の語がごく普通に出てくる。
      // ここが 0 件になるなら、短い語を instr() に落とす分岐が壊れている
      const author = await signUp();
      const id = await publishedId(author, { title: "ランプの点灯を保持する" });
      expect(await search("保持")).toContain(id);
    });

    it("1 文字の語でも見つかる", async () => {
      const author = await signUp();
      const id = await publishedId(author, { title: "現在値をリセットする" });
      expect(await search("値")).toContain(id);
    });

    it("当たらない語は 0 件のまま", async () => {
      const author = await signUp();
      await publishedId(author, { title: "ふつうの問題" });
      expect(await search("存在しない語句zzz")).toEqual([]);
    });

    describe("検索語を検索の文法として解釈しない", () => {
      // 引用符で囲まずに FTS5 へ渡すと、これらは演算子や記号として読まれる。
      // 意図しない結果になるか、文法エラーで 500 になる
      it.each(["AND", "OR", "NOT", "NEAR", "検索 AND 語", "*", "^abc", "col:value", "a*b"])(
        "%s で 500 にならない",
        async (q) => {
          const res = await app.request(`/api/problems?q=${encodeURIComponent(q)}`, {}, env);
          expect(res.status, await res.clone().text()).toBe(200);
        },
      );

      it("引用符を含む検索語でも落ちない", async () => {
        const author = await signUp();
        const id = await publishedId(author, { title: 'ここで "停止" と言う' });
        const res = await app.request(`/api/problems?q=${encodeURIComponent('"停止"')}`, {}, env);
        expect(res.status, await res.clone().text()).toBe(200);
        expect(
          ((await res.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
        ).toContain(id);
      });

      it("AND を語として探す(演算子として解釈しない)", async () => {
        const author = await signUp();
        const id = await publishedId(author, { title: "AND 回路の練習" });
        await publishedId(author, { title: "まったく別の問題" });
        const hits = await search("AND 回路");
        expect(hits).toContain(id);
        // 演算子として読まれていたら「回路」を含む別の問題まで出る余地がある
        expect(hits).toHaveLength(1);
      });
    });

    it("3 文字以上の検索は、本当に索引を引いている", async () => {
      // 索引を引かずに全表走査に戻っていないかを確かめる。
      // 索引の行だけを直接消して、それでも見つかるなら索引を使っていない
      const author = await signUp();
      const id = await publishedId(author, { title: "索引を確かめるためのコンベア問題" });
      expect(await search("コンベア")).toContain(id);

      await env.DB.prepare("DELETE FROM posted_problems_fts WHERE problem_id = ?").bind(id).run();

      expect(await search("コンベア")).not.toContain(id);
      // 一方、索引を使わない 1〜2 文字の経路では今も見つかる
      expect(await search("索引")).toContain(id);
    });

    it("索引を作る前からあった問題も、あとから拾える(移行の埋め戻し)", async () => {
      // 本番には既に投稿がある。移行で埋め戻しを忘れると、
      // **今ある問題だけ検索に出なくなる**。テストは空の DB から始まるので、
      // 何もしないとこの経路は一度も通らない。索引の行を消して、
      // 移行と同じ埋め戻しでちゃんと戻ることを確かめる
      const author = await signUp();
      const id = await publishedId(author, { title: "移行前からあるエンコーダの問題" });
      await env.DB.prepare("DELETE FROM posted_problems_fts WHERE problem_id = ?").bind(id).run();
      expect(await search("エンコーダ")).not.toContain(id);

      // 0004_posted_problems_fts.sql の埋め戻しと同じ文
      await env.DB.prepare(
        "INSERT INTO posted_problems_fts (problem_id, title, spec) SELECT id, title, spec FROM posted_problems",
      ).run();

      expect(await search("エンコーダ")).toContain(id);
    });

    it("題名を直すと索引も直る。いいねの数え上げでは索引を書き直さない", async () => {
      const author = await signUp();
      const id = await publishedId(author, { title: "書き換え前のロボットの問題" });

      // 索引の行を消しておく。トリガが動けば入れ直されるので、動いたか分かる
      await env.DB.prepare("DELETE FROM posted_problems_fts WHERE problem_id = ?").bind(id).run();

      // いいねの数え上げ。検索の中身と関係が無く、投稿の更新よりずっと回数が多い。
      // ここで索引を書き直すと、D1 の書き込み(10万 行/日)を無駄に使う
      await env.DB.prepare("UPDATE posted_problems SET likes_count = likes_count + 1 WHERE id = ?")
        .bind(id)
        .run();
      expect(await search("ロボット")).not.toContain(id);

      // 題名を直したときは書き直す
      await env.DB.prepare("UPDATE posted_problems SET title = ? WHERE id = ?")
        .bind("書き換え後のマニピュレータの問題", id)
        .run();
      expect(await search("マニピュレータ")).toContain(id);
      expect(await search("ロボット")).not.toContain(id);
    });

    it("消した問題は検索に出なくなる(索引が本体に追従する)", async () => {
      const author = await signUp();
      const id = await publishedId(author, { title: "あとで消すインバータの問題" });
      expect(await search("インバータ")).toContain(id);

      const del = await app.request(
        `/api/problems/${id}`,
        { method: "DELETE", headers: authHeaders(author) },
        env,
      );
      expect(del.status).toBe(200);
      expect(await search("インバータ")).not.toContain(id);
    });

    it("非公開の問題は、検索でも他人に漏れない", async () => {
      const author = await signUp();
      const other = await signUp();
      const id = await publishedId(author, {
        title: "誰にも見せないシーケンサの問題",
        visibility: "private",
      });

      // 索引は本体と別の表なので、絞り込みが索引側に流れると漏れる
      expect(await search("シーケンサ", other)).not.toContain(id);
      expect(await search("シーケンサ")).not.toContain(id);
      // 非公開は一覧そのものに出ない(本人でも)。本人が見るのは mine=true のとき
      expect(await search("シーケンサ", author)).not.toContain(id);

      const mine = await app.request(
        `/api/problems?mine=true&q=${encodeURIComponent("シーケンサ")}`,
        { headers: authHeaders(author) },
        env,
      );
      expect(mine.status).toBe(200);
      expect(
        ((await mine.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
      ).toContain(id);
    });
  });

  it("mine=false は自分の投稿に絞らない(未ログインでも 200、S-054)", async () => {
    const res = await app.request("/api/problems?mine=false", {}, env);
    expect(res.status).toBe(200);
    expect((await app.request("/api/problems?mine=0", {}, env)).status).toBe(200);
    // 絞るときは相変わらずログインが要る
    expect((await app.request("/api/problems?mine=true", {}, env)).status).toBe(401);
    expect((await app.request("/api/problems?mine=yes", {}, env)).status).toBe(400);
  });

  it("検索語に制御文字が混ざっていても 500 にしない(S-054)", async () => {
    const res = await app.request(
      `/api/problems?q=${encodeURIComponent("\u0000自己\u001f")}`,
      {},
      env,
    );
    expect(res.status).toBe(200);
  });

  it("不正な並び順は 400", async () => {
    expect((await app.request("/api/problems?sort=random", {}, env)).status).toBe(400);
  });

  it("存在しない問題は 404", async () => {
    expect((await app.request("/api/problems/no-such-id", {}, env)).status).toBe(404);
  });
});

describe("組織限定の公開(§3.8)", () => {
  async function orgWithMember() {
    const admin = await signUp("orgadmin");
    const member = await signUp("orgmember");
    const created = await app.request(
      "/api/orgs",
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({ name: "公開範囲テスト" }),
      },
      env,
    );
    const orgId = ((await created.json()) as { org: { id: string } }).org.id;
    const invited = await app.request(
      `/api/orgs/${orgId}/invites`,
      { method: "POST", headers: authHeaders(admin) },
      env,
    );
    const code = ((await invited.json()) as { invite: { code: string } }).invite.code;
    await app.request(
      "/api/orgs/join",
      { method: "POST", headers: jsonHeaders(member), body: JSON.stringify({ code }) },
      env,
    );
    return { admin, member, orgId };
  }

  it("組織のメンバーだけが、組織限定の問題を見られる", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const outsider = await signUp("outsider");
    const id = await publishedId(admin, {
      title: "組織限定の問題",
      visibility: "org",
      orgId,
    });

    // メンバーは取得できる
    expect(
      (await app.request(`/api/problems/${id}`, { headers: authHeaders(member) }, env)).status,
    ).toBe(200);
    // 組織外は 404
    expect(
      (await app.request(`/api/problems/${id}`, { headers: authHeaders(outsider) }, env)).status,
    ).toBe(404);
    // 未ログインも 404
    expect((await app.request(`/api/problems/${id}`, {}, env)).status).toBe(404);
  });

  it("組織限定の問題は、一般の一覧には出ずメンバーの一覧には出る", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const outsider = await signUp("outsider");
    const id = await publishedId(admin, { title: "一覧テスト組織限定", visibility: "org", orgId });

    const asOutsider = await app.request("/api/problems", { headers: authHeaders(outsider) }, env);
    expect(
      ((await asOutsider.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).not.toContain(id);

    const asMember = await app.request("/api/problems", { headers: authHeaders(member) }, env);
    expect(
      ((await asMember.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).toContain(id);

    // 組織の問題一覧にも出る
    const orgList = await app.request(
      `/api/orgs/${orgId}/problems`,
      { headers: authHeaders(member) },
      env,
    );
    expect(
      ((await orgList.json()) as { problems: Array<{ id: string }> }).problems.map((p) => p.id),
    ).toContain(id);
  });

  it("所属していない組織を指定して投稿することはできない", async () => {
    const { orgId } = await orgWithMember();
    const outsider = await signUp("outsider");
    const res = await publish(outsider, { visibility: "org", orgId });
    expect(res.status).toBe(404);
  });

  it("visibility=org なのに組織 ID が無いと 400", async () => {
    const author = await signUp();
    const res = await publish(author, { visibility: "org" });
    expect(res.status).toBe(400);
  });
});

describe("クリア率(§3.6)", () => {
  it("挑戦者数とクリア者数をユーザー単位で数える", async () => {
    const author = await signUp("author");
    const id = await publishedId(author);
    const a = await signUp("a");
    const b = await signUp("b");

    const attempt = (user: TestUser, passed: boolean) =>
      app.request(
        `/api/problems/${id}/attempts`,
        { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ passed }) },
        env,
      );

    await attempt(a, false);
    await attempt(a, false); // 同じ人が何回やっても挑戦者数は 1
    let res = await attempt(a, true);
    let body = (await res.json()) as {
      problem: { attempts: number; clears: number; clearRate: number | null };
    };
    expect(body.problem).toMatchObject({ attempts: 1, clears: 1, clearRate: 100 });

    await attempt(b, false);
    res = await attempt(b, false);
    body = (await res.json()) as {
      problem: { attempts: number; clears: number; clearRate: number | null };
    };
    expect(body.problem).toMatchObject({ attempts: 2, clears: 1, clearRate: 50 });
  });

  it("同じ人の挑戦が同時に届いても挑戦者数は 1 人(S-054)", async () => {
    const author = await signUp("author");
    const id = await publishedId(author);
    const a = await signUp("a");
    const attempt = (passed: boolean) =>
      app.request(
        `/api/problems/${id}/attempts`,
        { method: "POST", headers: jsonHeaders(a), body: JSON.stringify({ passed }) },
        env,
      );
    const results = await Promise.all([attempt(false), attempt(true), attempt(false)]);
    for (const r of results) expect(r.status).toBe(200);

    const res = await app.request(`/api/problems/${id}`, { headers: authHeaders(a) }, env);
    const body = (await res.json()) as { problem: { attempts: number; clears: number } };
    expect(body.problem).toMatchObject({ attempts: 1, clears: 1 });
  });

  it("未ログインでは挑戦を記録できない", async () => {
    const author = await signUp();
    const id = await publishedId(author);
    const res = await app.request(
      `/api/problems/${id}/attempts`,
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ passed: true }) },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("いいね・難易度投票・通報(§3.6)", () => {
  it("いいねは 1 人 1 回で、取り消せる", async () => {
    const author = await signUp("author");
    const fan = await signUp("fan");
    const id = await publishedId(author);

    const like = () =>
      app.request(`/api/problems/${id}/like`, { method: "POST", headers: authHeaders(fan) }, env);
    await like();
    await like(); // 2 回押しても 1 のまま

    let res = await app.request(`/api/problems/${id}`, { headers: authHeaders(fan) }, env);
    let body = (await res.json()) as { problem: { likes: number; liked: boolean } };
    expect(body.problem).toMatchObject({ likes: 1, liked: true });

    await app.request(
      `/api/problems/${id}/like`,
      { method: "DELETE", headers: authHeaders(fan) },
      env,
    );
    res = await app.request(`/api/problems/${id}`, { headers: authHeaders(fan) }, env);
    body = (await res.json()) as { problem: { likes: number; liked: boolean } };
    expect(body.problem).toMatchObject({ likes: 0, liked: false });
  });

  it("難易度投票の平均が出て、投票し直せる", async () => {
    const author = await signUp("author");
    const voter1 = await signUp("v1");
    const voter2 = await signUp("v2");
    const id = await publishedId(author, { difficulty: 3 });

    const vote = (user: TestUser, difficulty: number) =>
      app.request(
        `/api/problems/${id}/difficulty`,
        { method: "PUT", headers: jsonHeaders(user), body: JSON.stringify({ difficulty }) },
        env,
      );

    await vote(voter1, 5);
    let res = await vote(voter2, 3);
    let body = (await res.json()) as {
      problem: { votedDifficulty: number; difficultyVotes: number };
    };
    expect(body.problem).toMatchObject({ votedDifficulty: 4, difficultyVotes: 2 });

    // 投票し直しても票数は増えない
    res = await vote(voter1, 1);
    body = (await res.json()) as { problem: { votedDifficulty: number; difficultyVotes: number } };
    expect(body.problem).toMatchObject({ votedDifficulty: 2, difficultyVotes: 2 });
  });

  it("同じ人の投票が同時に届いても票は 1 つ(S-054)", async () => {
    const author = await signUp("author");
    const voter = await signUp("v");
    const id = await publishedId(author, { difficulty: 3 });
    const vote = (difficulty: number) =>
      app.request(
        `/api/problems/${id}/difficulty`,
        { method: "PUT", headers: jsonHeaders(voter), body: JSON.stringify({ difficulty }) },
        env,
      );
    await Promise.all([vote(4), vote(4)]);
    const res = await app.request(`/api/problems/${id}`, { headers: authHeaders(voter) }, env);
    const body = (await res.json()) as {
      problem: { votedDifficulty: number; difficultyVotes: number };
    };
    expect(body.problem).toMatchObject({ votedDifficulty: 4, difficultyVotes: 1 });
  });

  it("範囲外の難易度は 400", async () => {
    const author = await signUp("author");
    const voter = await signUp("v");
    const id = await publishedId(author);
    const res = await app.request(
      `/api/problems/${id}/difficulty`,
      { method: "PUT", headers: jsonHeaders(voter), body: JSON.stringify({ difficulty: 9 }) },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("3 人に通報されると自動で非表示になり、一覧にも取得にも出ない", async () => {
    const author = await signUp("author");
    const id = await publishedId(author, { title: "通報される問題" });
    const reporters = [await signUp("r1"), await signUp("r2"), await signUp("r3")];

    for (const [i, r] of reporters.entries()) {
      const res = await app.request(
        `/api/problems/${id}/report`,
        { method: "POST", headers: jsonHeaders(r), body: JSON.stringify({ reason: "不適切" }) },
        env,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { hidden: boolean };
      expect(body.hidden).toBe(i === 2);
    }

    expect((await app.request(`/api/problems/${id}`, {}, env)).status).toBe(404);
    const list = await app.request("/api/problems", {}, env);
    const body = (await list.json()) as { problems: Array<{ id: string }> };
    expect(body.problems.map((p) => p.id)).not.toContain(id);

    // 投稿者本人からも見えない(非表示は全員に効く)
    expect(
      (await app.request(`/api/problems/${id}`, { headers: authHeaders(author) }, env)).status,
    ).toBe(404);
  });

  it("3 人の通報が同時に届いても非表示になる(件数を SQL で足す、S-054)", async () => {
    const author = await signUp("author");
    const id = await publishedId(author, { title: "同時に通報される問題" });
    const reporters = [await signUp("r1"), await signUp("r2"), await signUp("r3")];
    const results = await Promise.all(
      reporters.map((r) =>
        app.request(
          `/api/problems/${id}/report`,
          { method: "POST", headers: jsonHeaders(r), body: JSON.stringify({ reason: "不適切" }) },
          env,
        ),
      ),
    );
    for (const r of results) expect(r.status).toBe(200);
    expect((await app.request(`/api/problems/${id}`, {}, env)).status).toBe(404);
  });

  it("同じ人が何度通報しても 1 件として数える", async () => {
    const author = await signUp("author");
    const reporter = await signUp("r");
    const id = await publishedId(author);
    for (let i = 0; i < 5; i++) {
      await app.request(
        `/api/problems/${id}/report`,
        { method: "POST", headers: jsonHeaders(reporter), body: JSON.stringify({ reason: "x" }) },
        env,
      );
    }
    expect((await app.request(`/api/problems/${id}`, {}, env)).status).toBe(200);
  });
});

describe("削除", () => {
  it("投稿者は自分の問題を削除できる", async () => {
    const author = await signUp();
    const id = await publishedId(author);
    const res = await app.request(
      `/api/problems/${id}`,
      { method: "DELETE", headers: authHeaders(author) },
      env,
    );
    expect(res.status).toBe(200);
    expect((await app.request(`/api/problems/${id}`, {}, env)).status).toBe(404);
  });

  it("他人の問題は削除できず、行も残る", async () => {
    const author = await signUp("author");
    const other = await signUp("other");
    const id = await publishedId(author);
    const res = await app.request(
      `/api/problems/${id}`,
      { method: "DELETE", headers: authHeaders(other) },
      env,
    );
    expect(res.status).toBe(404);

    const row = await env.DB.prepare("select count(*) as n from posted_problems where id = ?")
      .bind(id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});

/**
 * 続きを読む(S-033)。
 *
 * 以前はカーソルが新着順にしか付かず、**いいね順・難易度順では 21 件目から先を
 * 見る手段が無かった**。しかも画面には「もっと読む」が出ないので、
 * まだあることすら分からなかった
 */
describe("一覧のページング", () => {
  /** 21 件投稿して、いいね数と難易度をばらけさせる */
  async function seed(): Promise<number> {
    const author = await signUp("pager");
    const total = PAGE_SIZE + 1;
    for (let i = 0; i < total; i++) {
      const id = await publishedId(author, {
        title: `ページング ${i}`,
        difficulty: (i % 5) + 1,
      });
      // いいね数をばらけさせる(自分以外の人が押す)
      if (i % 3 === 0) {
        const fan = await signUp(`fan-${i}`);
        await app.request(
          `/api/problems/${id}/like`,
          { method: "POST", headers: authHeaders(fan) },
          env,
        );
      }
    }
    return total;
  }

  async function page(sort: string, cursor?: string) {
    const qs = new URLSearchParams({ sort });
    if (cursor) qs.set("cursor", cursor);
    const res = await app.request(`/api/problems?${qs.toString()}`, {}, env);
    expect(res.status).toBe(200);
    return (await res.json()) as {
      problems: Array<{ id: string }>;
      nextCursor: string | null;
    };
  }

  for (const sort of ["new", "likes", "difficulty"] as const) {
    it(`${sort} 順でも 2 ページ目が読める`, async () => {
      const total = await seed();

      const first = await page(sort);
      expect(first.problems).toHaveLength(PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();

      const second = await page(sort, first.nextCursor ?? undefined);
      expect(second.problems.length).toBeGreaterThan(0);

      // 1 ページ目と 2 ページ目で同じ問題が二度出ない / 取りこぼさない
      const ids = [...first.problems, ...second.problems].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(total);
    });
  }
});

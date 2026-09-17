import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { computeGlobalRankings } from "../src/ranking.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * ランキング(SPEC.md §3.7)。
 * 速さは競わせず、解いた数・作った問題の貢献・連続学習日数だけを指標にする。
 */

async function clearOfficial(user: TestUser, problemId: string) {
  const res = await app.request(
    `/api/progress/${problemId}/attempts`,
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ passed: true }) },
    env,
  );
  expect(res.status).toBe(200);
}

async function ranking(metric: string, period = "weekly", user?: TestUser, orgId?: string) {
  const qs = new URLSearchParams({ metric, period });
  if (orgId) qs.set("orgId", orgId);
  return app.request(
    `/api/rankings?${qs.toString()}`,
    user ? { headers: authHeaders(user) } : {},
    env,
  );
}

type Entry = { rank: number; userId: string; userName: string; value: number };

describe("全体ランキング", () => {
  it("解いた問題数が多い順に並ぶ", async () => {
    const heavy = await signUp("heavy");
    const light = await signUp("light");
    await clearOfficial(heavy, "selfhold-write-1");
    await clearOfficial(heavy, "timer-write-1");
    await clearOfficial(heavy, "counter-write-1");
    await clearOfficial(light, "selfhold-write-1");

    await computeGlobalRankings(env);
    const res = await ranking("solved");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Entry[] };
    const heavyEntry = body.entries.find((e) => e.userId === heavy.id);
    const lightEntry = body.entries.find((e) => e.userId === light.id);
    expect(heavyEntry?.value).toBe(3);
    expect(lightEntry?.value).toBe(1);
    expect(heavyEntry?.rank).toBeLessThan(lightEntry?.rank ?? 99);
  });

  it("未ログインでも見られる", async () => {
    const res = await ranking("solved");
    expect(res.status).toBe(200);
  });

  it("同じ問題を何度クリアしても 1 回として数える", async () => {
    const user = await signUp("once");
    await clearOfficial(user, "selfhold-write-1");
    await clearOfficial(user, "selfhold-write-1");
    await clearOfficial(user, "selfhold-write-1");

    // スナップショットを作り直してから読む
    await computeGlobalRankings(env);
    const res = await ranking("solved", "all");
    const body = (await res.json()) as { entries: Entry[] };
    expect(body.entries.find((e) => e.userId === user.id)?.value).toBe(1);
  });

  it("連続学習日数は期間で切らない(いまの連続を出す)", async () => {
    const user = await signUp("streak");
    await clearOfficial(user, "selfhold-write-1");
    // 全体ランキングは Cron が作ったスナップショットを返すので、集計し直してから読む
    await computeGlobalRankings(env);
    const res = await ranking("streak", "weekly");
    const body = (await res.json()) as { period: string; entries: Entry[] };
    expect(body.period).toBe("all");
    expect(body.entries.find((e) => e.userId === user.id)?.value).toBe(1);
  });

  it("スナップショットの計算時刻が返る", async () => {
    await computeGlobalRankings(env);
    const res = await ranking("solved", "all");
    const body = (await res.json()) as { computedAt: string; live: boolean };
    expect(new Date(body.computedAt).getTime()).toBeGreaterThan(0);
    expect(body.live).toBe(false);
  });

  it("連続学習日数が途切れていれば載らない", async () => {
    const user = await signUp("gap");
    // 10 日前にだけ活動した記録を直接入れる
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const dateJst = new Date(old.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await env.DB.prepare("insert into activity_days (user_id, date_jst) values (?, ?)")
      .bind(user.id, dateJst)
      .run();

    await computeGlobalRankings(env);
    const res = await ranking("streak");
    const body = (await res.json()) as { entries: Entry[] };
    expect(body.entries.map((e) => e.userId)).not.toContain(user.id);
  });

  /**
   * スナップショットは 1 日 1 回しか作られない(D-010)。クリア直後は一覧に載らないので、
   * 「記録されていない」と思われないように本人の値だけ別に返す(S-026)
   */
  it("クリア直後、一覧はまだ古くても自分の値はいまの値が返る", async () => {
    const user = await signUp("live-me");
    await computeGlobalRankings(env);

    // スナップショットを作ったあとにクリアする
    await clearOfficial(user, "selfhold-write-1");

    const res = await ranking("solved", "all", user);
    const body = (await res.json()) as {
      entries: Entry[];
      me: { userId: string; value: number } | null;
    };
    // 一覧(スナップショット)にはまだ載っていない
    expect(body.entries.map((e) => e.userId)).not.toContain(user.id);
    // 本人の値はいま数え直したもの
    expect(body.me?.userId).toBe(user.id);
    expect(body.me?.value).toBe(1);
  });

  it("未ログインなら自分の値は返さない", async () => {
    const res = await ranking("solved", "all");
    const body = (await res.json()) as { me: unknown };
    expect(body.me).toBeNull();
  });

  it("何もしていない人の値は 0", async () => {
    const user = await signUp("zero-me");
    await computeGlobalRankings(env);
    const res = await ranking("solved", "all", user);
    const body = (await res.json()) as { me: { value: number } | null };
    expect(body.me?.value).toBe(0);
  });

  /**
   * 通報で非表示になった問題のクリア(S-031)。
   *
   * 作った側の指標は hidden を外しているのに、解いた側だけ数え続けていた。
   * 消された問題でいつまでも順位が付くのはおかしい
   */
  it("非表示になった投稿のクリアは数えない", async () => {
    const author = await signUp("hidden-author");
    const solver = await signUp("hidden-solver");
    const circuit = {
      schemaVersion: 1,
      cols: 3,
      rows: 1,
      cells: [
        { row: 0, col: 0, element: { type: "contact", kind: "no", device: "X0" } },
        { row: 0, col: 1, element: { type: "wire" } },
        { row: 0, col: 2, element: { type: "coil", kind: "out", device: "Y0" } },
      ],
    };
    const published = await app.request(
      "/api/problems",
      {
        method: "POST",
        headers: jsonHeaders(author),
        body: JSON.stringify({
          title: "通報される問題",
          spec: "説明",
          circuit,
          testCases: [
            {
              id: "t1",
              title: "押すと点く",
              steps: [
                { type: "set", inputs: { X0: true } },
                { type: "expect", outputs: { Y0: true } },
              ],
            },
          ],
          difficulty: 1,
        }),
      },
      env,
    );
    const id = ((await published.json()) as { problem: { id: string } }).problem.id;
    await app.request(
      `/api/problems/${id}/attempts`,
      { method: "POST", headers: jsonHeaders(solver), body: JSON.stringify({ passed: true }) },
      env,
    );

    // 非表示になる前は数える
    await computeGlobalRankings(env);
    const before = await ranking("solved", "all");
    const beforeBody = (await before.json()) as { entries: Entry[] };
    expect(beforeBody.entries.find((e) => e.userId === solver.id)?.value).toBe(1);

    // 通報 3 件で非表示になったのと同じ状態にする
    await env.DB.prepare("update posted_problems set hidden = 1 where id = ?").bind(id).run();

    await computeGlobalRankings(env);
    const after = await ranking("solved", "all");
    const afterBody = (await after.json()) as { entries: Entry[] };
    expect(afterBody.entries.map((e) => e.userId)).not.toContain(solver.id);

    // 「あなたのいま」(S-026)も同じ勘定にする
    const mine = await ranking("solved", "all", solver);
    const mineBody = (await mine.json()) as { me: { value: number } | null };
    expect(mineBody.me?.value).toBe(0);
  });

  it("不正な指標は 400", async () => {
    const res = await app.request("/api/rankings?metric=speed", {}, env);
    expect(res.status).toBe(400);
  });

  it("Cron の集計がスナップショットを書き出す", async () => {
    const user = await signUp("cron");
    await clearOfficial(user, "selfhold-write-1");
    const written = await computeGlobalRankings(env);
    expect(written).toBeGreaterThan(0);

    const row = await env.DB.prepare(
      "select count(*) as n from ranking_snapshots where org_id is null and metric = 'solved'",
    ).first<{ n: number }>();
    expect(row?.n).toBeGreaterThan(0);
  });
});

describe("投稿による貢献の指標", () => {
  it("作った問題が解かれた回数といいね数が反映される", async () => {
    const author = await signUp("author");
    const solver = await signUp("solver");

    const circuit = {
      schemaVersion: 1,
      cols: 3,
      rows: 1,
      cells: [
        { row: 0, col: 0, element: { type: "contact", kind: "no", device: "X0" } },
        { row: 0, col: 1, element: { type: "wire" } },
        { row: 0, col: 2, element: { type: "coil", kind: "out", device: "Y0" } },
      ],
    };
    const published = await app.request(
      "/api/problems",
      {
        method: "POST",
        headers: jsonHeaders(author),
        body: JSON.stringify({
          title: "ランキング用",
          spec: "説明",
          circuit,
          testCases: [
            {
              id: "t1",
              title: "押すと点く",
              steps: [
                { type: "set", inputs: { X0: true } },
                { type: "expect", outputs: { Y0: true } },
              ],
            },
          ],
          difficulty: 1,
        }),
      },
      env,
    );
    expect(published.status).toBe(201);
    const id = ((await published.json()) as { problem: { id: string } }).problem.id;

    await app.request(
      `/api/problems/${id}/attempts`,
      { method: "POST", headers: jsonHeaders(solver), body: JSON.stringify({ passed: true }) },
      env,
    );
    await app.request(
      `/api/problems/${id}/like`,
      { method: "POST", headers: authHeaders(solver) },
      env,
    );

    await computeGlobalRankings(env);

    const solved = await ranking("authored_solved", "all");
    const solvedBody = (await solved.json()) as { entries: Entry[] };
    expect(solvedBody.entries.find((e) => e.userId === author.id)?.value).toBe(1);

    const likes = await ranking("authored_likes", "all");
    const likesBody = (await likes.json()) as { entries: Entry[] };
    expect(likesBody.entries.find((e) => e.userId === author.id)?.value).toBe(1);
  });
});

describe("組織内ランキング(§3.7)", () => {
  async function orgWithTwoMembers() {
    const admin = await signUp("orgadmin");
    const member = await signUp("orgmember");
    const created = await app.request(
      "/api/orgs",
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({ name: "ランキング組織" }),
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

  it("組織のメンバーだけが並ぶ", async () => {
    const { admin, member, orgId } = await orgWithTwoMembers();
    const outsider = await signUp("outsider");
    await clearOfficial(member, "selfhold-write-1");
    await clearOfficial(member, "timer-write-1");
    await clearOfficial(outsider, "selfhold-write-1");
    await clearOfficial(outsider, "timer-write-1");
    await clearOfficial(outsider, "counter-write-1");

    const res = await ranking("solved", "all", admin, orgId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Entry[] };
    const ids = body.entries.map((e) => e.userId);
    expect(ids).toContain(member.id);
    expect(ids, "組織外の人は出ない").not.toContain(outsider.id);
  });

  it("組織外のユーザーからは 404(存在を漏らさない)", async () => {
    const { orgId } = await orgWithTwoMembers();
    const outsider = await signUp("outsider");
    const res = await ranking("solved", "all", outsider, orgId);
    expect(res.status).toBe(404);
  });

  it("未ログインでは組織内ランキングを見られない", async () => {
    const { orgId } = await orgWithTwoMembers();
    const res = await ranking("solved", "all", undefined, orgId);
    expect(res.status).toBe(401);
  });
});

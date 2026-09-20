import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { computeGlobalRankings } from "../src/ranking.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * D1 の 1 クエリあたり 100 パラメータの上限(COST.md §1.2、S-054)。
 *
 * メンバーやユーザーの id を SQL に並べると、人数が増えたところで急に 500 になる。
 * ローカルの D1 も同じ上限を持つので、人数を増やして通ることを確かめる。
 * 人数ぶんのログインを繰り返すと遅いので、ユーザーと進捗は直接 D1 に入れる。
 */

const BATCH = 50;

async function run(statements: D1PreparedStatement[]) {
  for (let i = 0; i < statements.length; i += BATCH) {
    await env.DB.batch(statements.slice(i, i + BATCH));
  }
}

let seq = 0;

/** ログインしない合成ユーザー。名前は順位のタイブレークで安定するように 0 詰め */
async function insertUsers(n: number): Promise<string[]> {
  seq += 1;
  const now = Date.now();
  const ids = Array.from({ length: n }, (_, i) => `lim-${seq}-${String(i).padStart(3, "0")}`);
  await run(
    ids.map((id) =>
      env.DB.prepare(
        "insert into user (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, 0, ?, ?)",
      ).bind(id, id, `${id}@example.test`, now, now),
    ),
  );
  return ids;
}

async function insertMembers(orgId: string, ids: string[]) {
  const now = Date.now();
  await run(
    ids.map((id) =>
      env.DB.prepare(
        "insert into org_members (org_id, user_id, role, joined_at) values (?, ?, 'member', ?)",
      ).bind(orgId, id, now),
    ),
  );
}

async function insertProgress(ids: string[], problemId: string, cleared: boolean) {
  const now = Date.now();
  await run(
    ids.map((id) =>
      env.DB.prepare(
        "insert into progress (user_id, problem_id, cleared_at, attempts, failures, last_attempt_at) values (?, ?, ?, 1, ?, ?)",
      ).bind(id, problemId, cleared ? now : null, cleared ? 0 : 1, now),
    ),
  );
}

async function createOrg(admin: TestUser): Promise<string> {
  const res = await app.request(
    "/api/orgs",
    { method: "POST", headers: jsonHeaders(admin), body: JSON.stringify({ name: "大所帯" }) },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { org: { id: string } }).org.id;
}

type Entry = { rank: number; userId: string; value: number };

describe("人数が多くても壊れない(D1 の 100 パラメータ制限、S-054)", () => {
  it("13 人以上がクリアしていても全体ランキングのスナップショットが書ける", async () => {
    const ids = await insertUsers(60);
    await insertProgress(ids, "selfhold-write-1", true);

    await expect(computeGlobalRankings(env)).resolves.toBeGreaterThanOrEqual(50);
    const res = await app.request("/api/rankings?metric=solved&period=all", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Entry[] };
    expect(body.entries).toHaveLength(50);
    expect(body.entries.filter((e) => ids.includes(e.userId)).length).toBeGreaterThanOrEqual(50);
    // 同じ順位が 2 行入っていない(スナップショットの一意索引)
    expect(new Set(body.entries.map((e) => e.rank)).size).toBe(50);
  });

  it("49 人以上の組織でも組織内ランキングが出る(どの指標でも)", async () => {
    const admin = await signUp("big-admin");
    const orgId = await createOrg(admin);
    const ids = await insertUsers(60);
    await insertMembers(orgId, ids);
    await insertProgress(ids, "timer-write-1", true);

    for (const metric of ["solved", "authored_solved", "authored_likes", "streak"]) {
      const res = await app.request(
        `/api/rankings?metric=${metric}&period=all&orgId=${orgId}`,
        { headers: authHeaders(admin) },
        env,
      );
      expect(res.status, metric).toBe(200);
    }
    const res = await app.request(
      `/api/rankings?metric=solved&period=all&orgId=${orgId}`,
      { headers: authHeaders(admin) },
      env,
    );
    const body = (await res.json()) as { entries: Entry[] };
    expect(body.entries).toHaveLength(50);
    expect(body.entries.every((e) => ids.includes(e.userId))).toBe(true);
  });

  it("100 人を超える組織でも、つまずき箇所と課題の達成率が数えられる", async () => {
    const admin = await signUp("huge-admin");
    const orgId = await createOrg(admin);
    const ids = await insertUsers(101);
    await insertMembers(orgId, ids);
    await insertProgress(ids.slice(0, 30), "timer-write-1", true);
    await insertProgress(ids.slice(30, 50), "timer-write-1", false);

    const stuck = await app.request(
      `/api/orgs/${orgId}/stuck`,
      { headers: authHeaders(admin) },
      env,
    );
    expect(stuck.status).toBe(200);
    const stuckBody = (await stuck.json()) as {
      stuck: Array<{ problemId: string; stuckUsers: number }>;
      memberCount: number;
    };
    expect(stuckBody.memberCount).toBe(102);
    expect(stuckBody.stuck.find((s) => s.problemId === "timer-write-1")?.stuckUsers).toBe(20);

    const assigned = await app.request(
      `/api/orgs/${orgId}/assignments`,
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({ kind: "official", problemRef: "timer-write-1" }),
      },
      env,
    );
    expect(assigned.status).toBe(201);
    const list = await app.request(
      `/api/orgs/${orgId}/assignments`,
      { headers: authHeaders(admin) },
      env,
    );
    expect(list.status).toBe(200);
    const [row] = (
      (await list.json()) as {
        assignments: Array<{ stats?: Record<string, number> }>;
      }
    ).assignments;
    expect(row?.stats).toEqual({ total: 102, cleared: 30, attempting: 20, untouched: 52 });
  });
});

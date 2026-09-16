import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * クラス全体の進捗(SPEC.md §3.8 / 改善候補 8)。
 *
 * 1 人ずつ開かなくてもメンバー × 問題を一望できる表の素を返す。
 * 他組織のデータが混ざらないこと(D-017 方針 4〜6)をここで固定する。
 */

async function createOrg(user: TestUser, name = "表テスト組織"): Promise<string> {
  const res = await app.request(
    "/api/orgs",
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ name }) },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { org: { id: string } }).org.id;
}

async function invite(admin: TestUser, orgId: string): Promise<string> {
  const res = await app.request(
    `/api/orgs/${orgId}/invites`,
    { method: "POST", headers: authHeaders(admin) },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { invite: { code: string } }).invite.code;
}

async function join(user: TestUser, code: string) {
  const res = await app.request(
    "/api/orgs/join",
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ code }) },
    env,
  );
  expect(res.status).toBe(200);
}

async function attempt(user: TestUser, problemId: string, passed: boolean) {
  const res = await app.request(
    `/api/progress/${problemId}/attempts`,
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ passed }) },
    env,
  );
  expect(res.status).toBe(200);
}

type Matrix = {
  members: Array<{ userId: string; name: string; role: string }>;
  cells: Array<{ userId: string; problemId: string; cleared: boolean; failures: number }>;
  truncated: boolean;
};

async function readMatrix(user: TestUser, orgId: string) {
  return app.request(`/api/orgs/${orgId}/matrix`, { headers: authHeaders(user) }, env);
}

async function readMatrixOk(user: TestUser, orgId: string): Promise<Matrix> {
  const res = await readMatrix(user, orgId);
  expect(res.status).toBe(200);
  return (await res.json()) as Matrix;
}

describe("クラス全体の進捗", () => {
  it("管理者はメンバー全員のクリア状況を一度に取れる", async () => {
    const admin = await signUp("m-admin");
    const taro = await signUp("m-taro");
    const hanako = await signUp("m-hanako");
    const orgId = await createOrg(admin);
    const code = await invite(admin, orgId);
    await join(taro, code);
    await join(hanako, code);

    await attempt(taro, "selfhold-read-1", true);
    await attempt(taro, "selfhold-fix-1", false);
    await attempt(taro, "selfhold-fix-1", false);
    await attempt(hanako, "selfhold-read-1", false);

    const matrix = await readMatrixOk(admin, orgId);
    expect(matrix.members.map((m) => m.name).sort()).toEqual(["m-admin", "m-hanako", "m-taro"]);

    const taroCleared = matrix.cells.find(
      (c) => c.userId === taro.id && c.problemId === "selfhold-read-1",
    );
    expect(taroCleared?.cleared).toBe(true);

    const taroStuck = matrix.cells.find(
      (c) => c.userId === taro.id && c.problemId === "selfhold-fix-1",
    );
    expect(taroStuck?.cleared).toBe(false);
    expect(taroStuck?.failures).toBe(2);

    const hanakoStuck = matrix.cells.find(
      (c) => c.userId === hanako.id && c.problemId === "selfhold-read-1",
    );
    expect(hanakoStuck?.cleared).toBe(false);
  });

  it("触っていない問題のマスは返さない(無い = 未着手)", async () => {
    const admin = await signUp("m2-admin");
    const orgId = await createOrg(admin);
    await attempt(admin, "timer-read-0", true);

    const matrix = await readMatrixOk(admin, orgId);
    const mine = matrix.cells.filter((c) => c.userId === admin.id);
    expect(mine.map((c) => c.problemId)).toEqual(["timer-read-0"]);
  });

  it("回路や日時は返さない(一望するのに要らない)", async () => {
    const admin = await signUp("m3-admin");
    const orgId = await createOrg(admin);
    await attempt(admin, "selfhold-read-0", true);

    const matrix = await readMatrixOk(admin, orgId);
    const cell = matrix.cells[0];
    expect(cell).toBeDefined();
    expect(Object.keys(cell ?? {}).sort()).toEqual(["cleared", "failures", "problemId", "userId"]);
  });

  it("メンバー(管理者でない)は見られない", async () => {
    const admin = await signUp("m4-admin");
    const member = await signUp("m4-member");
    const orgId = await createOrg(admin);
    await join(member, await invite(admin, orgId));

    expect((await readMatrix(member, orgId)).status).toBe(403);
  });

  it("組織の外からは存在も分からない(404)", async () => {
    const admin = await signUp("m5-admin");
    const outsider = await signUp("m5-outsider");
    const orgId = await createOrg(admin);

    expect((await readMatrix(outsider, orgId)).status).toBe(404);
  });

  it("別の組織の管理者からは見られない", async () => {
    const adminA = await signUp("m6-admin-a");
    const adminB = await signUp("m6-admin-b");
    const orgA = await createOrg(adminA, "A 社");
    await createOrg(adminB, "B 社");

    expect((await readMatrix(adminB, orgA)).status).toBe(404);
  });

  it("他の組織のメンバーの進捗は混ざらない", async () => {
    const adminA = await signUp("m7-admin-a");
    const memberA = await signUp("m7-member-a");
    const adminB = await signUp("m7-admin-b");
    const memberB = await signUp("m7-member-b");

    const orgA = await createOrg(adminA, "A 社");
    await join(memberA, await invite(adminA, orgA));
    const orgB = await createOrg(adminB, "B 社");
    await join(memberB, await invite(adminB, orgB));

    await attempt(memberA, "combo-read-0", true);
    await attempt(memberB, "combo-read-0", true);

    const matrix = await readMatrixOk(adminA, orgA);
    const userIds = new Set(matrix.cells.map((c) => c.userId));
    expect(userIds.has(memberA.id)).toBe(true);
    expect(userIds.has(memberB.id)).toBe(false);
    expect(matrix.members.some((m) => m.userId === memberB.id)).toBe(false);
  });

  it("未ログインでは 401", async () => {
    const admin = await signUp("m8-admin");
    const orgId = await createOrg(admin);
    const res = await app.request(`/api/orgs/${orgId}/matrix`, {}, env);
    expect(res.status).toBe(401);
  });

  it("誰も何もしていなくても、メンバーの一覧は返る", async () => {
    const admin = await signUp("m9-admin");
    const orgId = await createOrg(admin);
    const matrix = await readMatrixOk(admin, orgId);
    expect(matrix.members).toHaveLength(1);
    expect(matrix.cells).toEqual([]);
    expect(matrix.truncated).toBe(false);
  });
});

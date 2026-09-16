import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * 課題の期限と達成率(SPEC.md §3.8 / 改善候補 9)。
 *
 * 達成率は管理者にだけ返す。メンバーに「何人できたか」を見せると、
 * 少人数の組織では誰ができていないかが透けてしまう。
 */

async function createOrg(user: TestUser, name = "課題テスト組織"): Promise<string> {
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

async function assign(
  admin: TestUser,
  orgId: string,
  body: { problemRef: string; kind?: string; userId?: string; dueAt?: string; note?: string },
) {
  return app.request(
    `/api/orgs/${orgId}/assignments`,
    {
      method: "POST",
      headers: jsonHeaders(admin),
      body: JSON.stringify({ kind: "official", ...body }),
    },
    env,
  );
}

type Assignment = {
  id: string;
  problemRef: string;
  userId: string | null;
  dueAt: string | null;
  stats?: { total: number; cleared: number; attempting: number; untouched: number };
};

async function listAssignments(user: TestUser, orgId: string): Promise<Assignment[]> {
  const res = await app.request(
    `/api/orgs/${orgId}/assignments`,
    { headers: authHeaders(user) },
    env,
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { assignments: Assignment[] }).assignments;
}

describe("課題の期限", () => {
  it("期限を付けて割り当てられ、そのまま返る", async () => {
    const admin = await signUp("a-admin");
    const orgId = await createOrg(admin);
    const dueAt = "2026-12-31T15:00:00.000Z";

    expect((await assign(admin, orgId, { problemRef: "selfhold-read-1", dueAt })).status).toBe(201);
    const [row] = await listAssignments(admin, orgId);
    expect(row?.dueAt).toBe(dueAt);
  });

  it("期限なしでも割り当てられる", async () => {
    const admin = await signUp("a2-admin");
    const orgId = await createOrg(admin);
    expect((await assign(admin, orgId, { problemRef: "timer-read-0" })).status).toBe(201);
    const [row] = await listAssignments(admin, orgId);
    expect(row?.dueAt).toBeNull();
  });

  it("日時として読めない期限は受け付けない", async () => {
    const admin = await signUp("a3-admin");
    const orgId = await createOrg(admin);
    const res = await assign(admin, orgId, { problemRef: "timer-read-0", dueAt: "来週まで" });
    expect(res.status).toBe(400);
  });
});

describe("課題の達成率", () => {
  it("全員宛の課題は、組織のメンバー全員を対象に数える", async () => {
    const admin = await signUp("b-admin");
    const done = await signUp("b-done");
    const trying = await signUp("b-trying");
    const idle = await signUp("b-idle");
    const orgId = await createOrg(admin);
    const code = await invite(admin, orgId);
    await join(done, code);
    await join(trying, code);
    await join(idle, code);

    await attempt(done, "interlock-read-0", true);
    await attempt(trying, "interlock-read-0", false);
    // idle と admin は何もしない

    await assign(admin, orgId, { problemRef: "interlock-read-0" });
    const [row] = await listAssignments(admin, orgId);
    expect(row?.stats).toEqual({ total: 4, cleared: 1, attempting: 1, untouched: 2 });
  });

  it("個人宛の課題は、その 1 人だけを対象に数える", async () => {
    const admin = await signUp("c-admin");
    const target = await signUp("c-target");
    const other = await signUp("c-other");
    const orgId = await createOrg(admin);
    const code = await invite(admin, orgId);
    await join(target, code);
    await join(other, code);

    // 対象でない人がクリアしていても数に入らない
    await attempt(other, "counter-read-0", true);

    await assign(admin, orgId, { problemRef: "counter-read-0", userId: target.id });
    const [row] = await listAssignments(admin, orgId);
    expect(row?.stats).toEqual({ total: 1, cleared: 0, attempting: 0, untouched: 1 });

    await attempt(target, "counter-read-0", true);
    const [after] = await listAssignments(admin, orgId);
    expect(after?.stats).toEqual({ total: 1, cleared: 1, attempting: 0, untouched: 0 });
  });

  it("メンバーには達成率を返さない", async () => {
    const admin = await signUp("d-admin");
    const member = await signUp("d-member");
    const orgId = await createOrg(admin);
    await join(member, await invite(admin, orgId));
    await assign(admin, orgId, { problemRef: "combo-read-0" });

    const asAdmin = await listAssignments(admin, orgId);
    expect(asAdmin[0]?.stats).toBeDefined();

    const asMember = await listAssignments(member, orgId);
    expect(asMember).toHaveLength(1);
    expect(asMember[0]?.stats).toBeUndefined();
  });

  it("課題が複数あっても、それぞれ別に数える", async () => {
    const admin = await signUp("e-admin");
    const member = await signUp("e-member");
    const orgId = await createOrg(admin);
    await join(member, await invite(admin, orgId));

    await attempt(member, "selfhold-read-0", true);
    await assign(admin, orgId, { problemRef: "selfhold-read-0" });
    await assign(admin, orgId, { problemRef: "combo-write-1" });

    const rows = await listAssignments(admin, orgId);
    const byRef = new Map(rows.map((r) => [r.problemRef, r.stats]));
    expect(byRef.get("selfhold-read-0")).toMatchObject({ cleared: 1 });
    expect(byRef.get("combo-write-1")).toMatchObject({ cleared: 0, untouched: 2 });
  });

  it("他の組織のメンバーの進捗は数に入らない", async () => {
    const adminA = await signUp("f-admin-a");
    const memberA = await signUp("f-member-a");
    const adminB = await signUp("f-admin-b");
    const memberB = await signUp("f-member-b");

    const orgA = await createOrg(adminA, "A 社");
    await join(memberA, await invite(adminA, orgA));
    const orgB = await createOrg(adminB, "B 社");
    await join(memberB, await invite(adminB, orgB));

    await attempt(memberB, "timer-fix-2", true);
    await assign(adminA, orgA, { problemRef: "timer-fix-2" });

    const [row] = await listAssignments(adminA, orgA);
    // A 社は 2 人。B 社の memberB がクリアしていても数に入らない
    expect(row?.stats).toEqual({ total: 2, cleared: 0, attempting: 0, untouched: 2 });
  });

  it("課題が 1 件も無ければ何も起きない", async () => {
    const admin = await signUp("g-admin");
    const orgId = await createOrg(admin);
    expect(await listAssignments(admin, orgId)).toEqual([]);
  });
});

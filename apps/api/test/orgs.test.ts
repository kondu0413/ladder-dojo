import { env } from "cloudflare:test";
import { ladder, nc, no, out } from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * 組織と管理者ビュー(SPEC.md §3.8 / DECISIONS.md D-017 方針 4〜6)。
 * ここが崩れると、他社・他組織のメンバーの学習履歴が見えてしまう。
 */

async function createOrg(user: TestUser, name = "テスト組織"): Promise<string> {
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
  return app.request(
    "/api/orgs/join",
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ code }) },
    env,
  );
}

/** 管理者と、参加済みメンバー 1 人を用意する */
async function orgWithMember() {
  const admin = await signUp("admin");
  const member = await signUp("member");
  const orgId = await createOrg(admin);
  const code = await invite(admin, orgId);
  expect((await join(member, code)).status).toBe(200);
  return { admin, member, orgId };
}

describe("組織の作成と参加", () => {
  it("作った人が管理者になり、一覧に出る", async () => {
    const admin = await signUp();
    const orgId = await createOrg(admin, "うちの工場");

    const res = await app.request("/api/orgs", { headers: authHeaders(admin) }, env);
    const body = (await res.json()) as { orgs: Array<{ id: string; name: string; role: string }> };
    expect(body.orgs).toEqual([
      expect.objectContaining({ id: orgId, name: "うちの工場", role: "admin" }),
    ]);
  });

  it("招待コードで参加でき、メンバー権限になる", async () => {
    const { member, orgId } = await orgWithMember();
    const res = await app.request("/api/orgs", { headers: authHeaders(member) }, env);
    const body = (await res.json()) as { orgs: Array<{ id: string; role: string }> };
    expect(body.orgs).toEqual([expect.objectContaining({ id: orgId, role: "member" })]);
  });

  it("同じコードで二重に参加しても増えない", async () => {
    const { member, orgId } = await orgWithMember();
    const admin2 = await signUp("admin2");
    void admin2;
    const res = await app.request("/api/orgs", { headers: authHeaders(member) }, env);
    expect(((await res.json()) as { orgs: unknown[] }).orgs).toHaveLength(1);

    const row = await env.DB.prepare(
      "select count(*) as n from org_members where org_id = ? and user_id = ?",
    )
      .bind(orgId, member.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("参加できる組織の数にも上限がある(作るときだけでなく、S-054)", async () => {
    const busy = await signUp("busy");
    for (let i = 0; i < 20; i++) await createOrg(busy, `組織 ${i}`);
    const admin = await signUp("admin");
    const orgId = await createOrg(admin);
    const code = await invite(admin, orgId);
    const res = await join(busy, code);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "quota_exceeded" });
  });

  it("存在しないコードでは参加できない", async () => {
    const user = await signUp();
    expect((await join(user, "deadbeefcafe")).status).toBe(404);
  });

  it("未ログインでは組織を作れない", async () => {
    const res = await app.request(
      "/api/orgs",
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ name: "x" }) },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("権限(D-017 方針 4)", () => {
  it("メンバー外からは組織が 404(存在を漏らさない)", async () => {
    const { orgId } = await orgWithMember();
    const outsider = await signUp("outsider");
    const res = await app.request(`/api/orgs/${orgId}`, { headers: authHeaders(outsider) }, env);
    expect(res.status).toBe(404);
  });

  it("メンバーは概要を見られるが、メンバー一覧は空(管理者向け)", async () => {
    const { member, orgId } = await orgWithMember();
    const res = await app.request(`/api/orgs/${orgId}`, { headers: authHeaders(member) }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { org: { role: string }; members: unknown[] };
    expect(body.org.role).toBe("member");
    expect(body.members).toEqual([]);
  });

  it("管理者はメンバー一覧を見られる", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const res = await app.request(`/api/orgs/${orgId}`, { headers: authHeaders(admin) }, env);
    const body = (await res.json()) as { members: Array<{ userId: string; role: string }> };
    expect(body.members.map((m) => m.userId).sort()).toEqual([admin.id, member.id].sort());
  });

  it("メンバー(非管理者)が管理者向け API を叩くと 403", async () => {
    const { member, orgId } = await orgWithMember();
    const routes = [
      { method: "POST", path: `/api/orgs/${orgId}/invites` },
      { method: "GET", path: `/api/orgs/${orgId}/stuck` },
      { method: "GET", path: `/api/orgs/${orgId}/members/${member.id}/progress` },
      { method: "GET", path: `/api/orgs/${orgId}/members/${member.id}/submissions` },
    ];
    for (const r of routes) {
      const res = await app.request(
        r.path,
        { method: r.method, headers: authHeaders(member) },
        env,
      );
      expect(res.status, `${r.method} ${r.path}`).toBe(403);
    }
  });

  it("メンバー外が管理者向け API を叩くと 403 ではなく 404", async () => {
    const { orgId, member } = await orgWithMember();
    const outsider = await signUp("outsider");
    const res = await app.request(
      `/api/orgs/${orgId}/members/${member.id}/progress`,
      { headers: authHeaders(outsider) },
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("管理者ビュー(§3.8)", () => {
  it("メンバーの進捗と提出履歴を見られる", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const circuit = ladder(5).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

    await app.request(
      "/api/progress/selfhold-write-1/attempts",
      { method: "POST", headers: jsonHeaders(member), body: JSON.stringify({ passed: false }) },
      env,
    );
    await app.request(
      "/api/submissions",
      {
        method: "POST",
        headers: jsonHeaders(member),
        body: JSON.stringify({ problemId: "selfhold-write-1", circuit, passed: false }),
      },
      env,
    );

    const prog = await app.request(
      `/api/orgs/${orgId}/members/${member.id}/progress`,
      { headers: authHeaders(admin) },
      env,
    );
    expect(prog.status).toBe(200);
    const progBody = (await prog.json()) as { progress: Array<{ problemId: string }> };
    expect(progBody.progress.map((p) => p.problemId)).toContain("selfhold-write-1");

    const subs = await app.request(
      `/api/orgs/${orgId}/members/${member.id}/submissions`,
      { headers: authHeaders(admin) },
      env,
    );
    const subsBody = (await subs.json()) as { submissions: Array<{ problemId: string }> };
    expect(subsBody.submissions.map((s) => s.problemId)).toContain("selfhold-write-1");
  });

  it("組織 A の管理者は、組織 B のメンバーの進捗を取得できない(D-017 方針 6)", async () => {
    const a = await orgWithMember();
    const b = await orgWithMember();

    // 組織 A の管理者が、A の orgId で B のメンバーを指定しても 404
    const res = await app.request(
      `/api/orgs/${a.orgId}/members/${b.member.id}/progress`,
      { headers: authHeaders(a.admin) },
      env,
    );
    expect(res.status).toBe(404);

    // B の orgId を使っても、A の管理者は B のメンバーではないので 404
    const cross = await app.request(
      `/api/orgs/${b.orgId}/members/${b.member.id}/progress`,
      { headers: authHeaders(a.admin) },
      env,
    );
    expect(cross.status).toBe(404);
  });

  it("つまずき箇所がまとまる", async () => {
    const { admin, member, orgId } = await orgWithMember();
    for (let i = 0; i < 3; i++) {
      await app.request(
        "/api/progress/timer-write-1/attempts",
        { method: "POST", headers: jsonHeaders(member), body: JSON.stringify({ passed: false }) },
        env,
      );
    }
    await app.request(
      "/api/progress/selfhold-write-1/attempts",
      { method: "POST", headers: jsonHeaders(member), body: JSON.stringify({ passed: true }) },
      env,
    );

    const res = await app.request(`/api/orgs/${orgId}/stuck`, { headers: authHeaders(admin) }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stuck: Array<{ problemId: string; stuckUsers: number; failures: number }>;
      memberCount: number;
    };
    expect(body.memberCount).toBe(2);
    const timer = body.stuck.find((s) => s.problemId === "timer-write-1");
    expect(timer).toMatchObject({ stuckUsers: 1, failures: 3 });
    // クリア済みはつまずきに出ない
    expect(body.stuck.map((s) => s.problemId)).not.toContain("selfhold-write-1");
  });
});

describe("権限の変更と脱退", () => {
  it("管理者はメンバーを管理者に昇格できる", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const res = await app.request(
      `/api/orgs/${orgId}/members/${member.id}/role`,
      { method: "PUT", headers: jsonHeaders(admin), body: JSON.stringify({ role: "admin" }) },
      env,
    );
    expect(res.status).toBe(200);

    const check = await app.request(`/api/orgs/${orgId}`, { headers: authHeaders(member) }, env);
    expect(((await check.json()) as { org: { role: string } }).org.role).toBe("admin");
  });

  it("最後の管理者は降格も脱退もできない", async () => {
    const { admin, orgId } = await orgWithMember();
    const demote = await app.request(
      `/api/orgs/${orgId}/members/${admin.id}/role`,
      { method: "PUT", headers: jsonHeaders(admin), body: JSON.stringify({ role: "member" }) },
      env,
    );
    expect(demote.status).toBe(409);

    const leave = await app.request(
      `/api/orgs/${orgId}/members/${admin.id}`,
      { method: "DELETE", headers: authHeaders(admin) },
      env,
    );
    expect(leave.status).toBe(409);
  });

  it("メンバーは自分で脱退できるが、他人は外せない", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const other = await signUp("other");
    const code = await invite(admin, orgId);
    await join(other, code);

    const forbidden = await app.request(
      `/api/orgs/${orgId}/members/${other.id}`,
      { method: "DELETE", headers: authHeaders(member) },
      env,
    );
    expect(forbidden.status).toBe(403);

    const selfLeave = await app.request(
      `/api/orgs/${orgId}/members/${member.id}`,
      { method: "DELETE", headers: authHeaders(member) },
      env,
    );
    expect(selfLeave.status).toBe(200);

    // 脱退したので組織が見えなくなる
    const after = await app.request(`/api/orgs/${orgId}`, { headers: authHeaders(member) }, env);
    expect(after.status).toBe(404);
  });

  it("管理者はメンバーを外せる", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const res = await app.request(
      `/api/orgs/${orgId}/members/${member.id}`,
      { method: "DELETE", headers: authHeaders(admin) },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("外したメンバーあての課題は消え、全員あての課題は残る(S-054)", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const assign = (body: Record<string, unknown>) =>
      app.request(
        `/api/orgs/${orgId}/assignments`,
        {
          method: "POST",
          headers: jsonHeaders(admin),
          body: JSON.stringify({ kind: "official", problemRef: "timer-write-1", ...body }),
        },
        env,
      );
    expect((await assign({ userId: member.id })).status).toBe(201);
    expect((await assign({})).status).toBe(201);

    const res = await app.request(
      `/api/orgs/${orgId}/members/${member.id}`,
      { method: "DELETE", headers: authHeaders(admin) },
      env,
    );
    expect(res.status).toBe(200);

    const count = (where: string, ...bind: string[]) =>
      env.DB.prepare(`select count(*) as n from assignments where org_id = ? and ${where}`)
        .bind(orgId, ...bind)
        .first<{ n: number }>();
    expect((await count("user_id = ?", member.id))?.n).toBe(0);
    expect((await count("user_id is null"))?.n).toBe(1);
  });
});

describe("課題の割り当て(§3.8)", () => {
  it("管理者が個人に割り当てると、その人にだけ見える", async () => {
    const { admin, member, orgId } = await orgWithMember();
    const other = await signUp("other");
    const code = await invite(admin, orgId);
    await join(other, code);

    const res = await app.request(
      `/api/orgs/${orgId}/assignments`,
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({
          kind: "official",
          problemRef: "timer-write-1",
          userId: member.id,
          note: "来週までに",
        }),
      },
      env,
    );
    expect(res.status).toBe(201);

    const mine = await app.request(
      `/api/orgs/${orgId}/assignments`,
      { headers: authHeaders(member) },
      env,
    );
    const mineBody = (await mine.json()) as { assignments: Array<{ problemRef: string }> };
    expect(mineBody.assignments.map((a) => a.problemRef)).toContain("timer-write-1");

    const theirs = await app.request(
      `/api/orgs/${orgId}/assignments`,
      { headers: authHeaders(other) },
      env,
    );
    const theirsBody = (await theirs.json()) as { assignments: unknown[] };
    expect(theirsBody.assignments).toEqual([]);
  });

  it("全員宛の割り当ては全メンバーに見える", async () => {
    const { admin, member, orgId } = await orgWithMember();
    await app.request(
      `/api/orgs/${orgId}/assignments`,
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({ kind: "official", problemRef: "counter-write-1" }),
      },
      env,
    );
    const res = await app.request(
      `/api/orgs/${orgId}/assignments`,
      { headers: authHeaders(member) },
      env,
    );
    const body = (await res.json()) as { assignments: Array<{ problemRef: string }> };
    expect(body.assignments.map((a) => a.problemRef)).toContain("counter-write-1");
  });

  it("メンバーは課題を割り当てられない", async () => {
    const { member, orgId } = await orgWithMember();
    const res = await app.request(
      `/api/orgs/${orgId}/assignments`,
      {
        method: "POST",
        headers: jsonHeaders(member),
        body: JSON.stringify({ kind: "official", problemRef: "timer-write-1" }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("組織外のユーザーには割り当てられない", async () => {
    const { admin, orgId } = await orgWithMember();
    const outsider = await signUp("outsider");
    const res = await app.request(
      `/api/orgs/${orgId}/assignments`,
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({ kind: "official", problemRef: "x-1", userId: outsider.id }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("管理者は割り当てを取り消せる", async () => {
    const { admin, orgId } = await orgWithMember();
    const created = await app.request(
      `/api/orgs/${orgId}/assignments`,
      {
        method: "POST",
        headers: jsonHeaders(admin),
        body: JSON.stringify({ kind: "official", problemRef: "timer-write-1" }),
      },
      env,
    );
    const id = ((await created.json()) as { assignment: { id: string } }).assignment.id;
    const res = await app.request(
      `/api/orgs/${orgId}/assignments/${id}`,
      { method: "DELETE", headers: authHeaders(admin) },
      env,
    );
    expect(res.status).toBe(200);
  });
});

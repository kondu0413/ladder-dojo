import { env } from "cloudflare:test";
import { type Circuit, ladder, no, out, timer } from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { authHeaders, jsonHeaders, signUp, type TestUser } from "./helpers.js";

const circuit = ladder(3).row(no("X0"), out("Y0")).build();

/** 指紋が全て異なる回路を作る */
function variantCircuit(i: number): Circuit {
  return ladder(3)
    .row(no("X0"), timer("T0", 100 + i))
    .build();
}

async function attempt(user: TestUser, problemId: string, passed: boolean) {
  const res = await app.request(
    `/api/progress/${problemId}/attempts`,
    { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ passed }) },
    env,
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { progress: ProgressJson }).progress;
}

type ProgressJson = {
  problemId: string;
  attempts: number;
  failures: number;
  clearedAt: string | null;
  lastAttemptAt: string;
};

describe("進捗", () => {
  it("初回の挑戦で行ができ、2 回目以降は加算される", async () => {
    const user = await signUp();
    const first = await attempt(user, "selfhold-1", false);
    expect(first).toMatchObject({ attempts: 1, failures: 1, clearedAt: null });

    const second = await attempt(user, "selfhold-1", false);
    expect(second).toMatchObject({ attempts: 2, failures: 2, clearedAt: null });
  });

  it("正解すると clearedAt が立ち、失敗回数は増えない", async () => {
    const user = await signUp();
    await attempt(user, "timer-1", false);
    const cleared = await attempt(user, "timer-1", true);
    expect(cleared.attempts).toBe(2);
    expect(cleared.failures).toBe(1);
    expect(cleared.clearedAt).not.toBeNull();
  });

  it("一度クリアした問題は、あとで失敗しても clearedAt が消えない", async () => {
    const user = await signUp();
    const cleared = await attempt(user, "counter-1", true);
    const after = await attempt(user, "counter-1", false);
    expect(after.clearedAt).toBe(cleared.clearedAt);
    expect(after.failures).toBe(1);
  });

  it("挑戦すると活動日(JST)が 1 日 1 行だけ記録される", async () => {
    const user = await signUp();
    await attempt(user, "selfhold-1", false);
    await attempt(user, "selfhold-1", true);
    await attempt(user, "timer-1", true);
    const row = await env.DB.prepare("select count(*) as n from activity_days where user_id = ?")
      .bind(user.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("一覧と単体取得ができ、未挑戦の問題は 404", async () => {
    const user = await signUp();
    await attempt(user, "selfhold-1", true);

    const list = await app.request("/api/progress", { headers: authHeaders(user) }, env);
    const body = (await list.json()) as { progress: ProgressJson[] };
    expect(body.progress.map((p) => p.problemId)).toEqual(["selfhold-1"]);

    const one = await app.request("/api/progress/selfhold-1", { headers: authHeaders(user) }, env);
    expect(one.status).toBe(200);

    const missing = await app.request("/api/progress/timer-9", { headers: authHeaders(user) }, env);
    expect(missing.status).toBe(404);
  });
});

describe("進捗のマージ(S-002)", () => {
  const merge = (user: TestUser, entries: unknown) =>
    app.request(
      "/api/progress/merge",
      { method: "POST", headers: jsonHeaders(user), body: JSON.stringify({ entries }) },
      env,
    );

  it("端末の進捗を取り込める", async () => {
    const user = await signUp();
    const res = await merge(user, [
      { problemId: "selfhold-write-1", attempts: 3, failures: 2, cleared: true },
      { problemId: "timer-write-1", attempts: 1, failures: 1, cleared: false },
    ]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { merged: number; progress: ProgressJson[] };
    expect(body.merged).toBe(2);

    const cleared = body.progress.find((p) => p.problemId === "selfhold-write-1");
    expect(cleared).toMatchObject({ attempts: 3, failures: 2 });
    expect(cleared?.clearedAt).not.toBeNull();

    const open = body.progress.find((p) => p.problemId === "timer-write-1");
    expect(open).toMatchObject({ attempts: 1, failures: 1, clearedAt: null });
  });

  it("既にサーバーにある進捗とは加算され、クリアは取り消されない", async () => {
    const user = await signUp();
    await attempt(user, "selfhold-write-1", true);
    await attempt(user, "selfhold-write-1", false);

    const res = await merge(user, [
      { problemId: "selfhold-write-1", attempts: 5, failures: 4, cleared: false },
    ]);
    const body = (await res.json()) as { progress: ProgressJson[] };
    const row = body.progress.find((p) => p.problemId === "selfhold-write-1");
    expect(row).toMatchObject({ attempts: 7, failures: 5 });
    expect(row?.clearedAt, "サーバー側のクリアは取り消さない").not.toBeNull();
  });

  it("端末側だけがクリアしていればクリアになる", async () => {
    const user = await signUp();
    await attempt(user, "timer-write-1", false);
    const res = await merge(user, [
      { problemId: "timer-write-1", attempts: 2, failures: 0, cleared: true },
    ]);
    const body = (await res.json()) as { progress: ProgressJson[] };
    expect(body.progress.find((p) => p.problemId === "timer-write-1")?.clearedAt).not.toBeNull();
  });

  it("端末で記録した日時を保つ(取り込み時刻にしない、S-054)", async () => {
    const user = await signUp();
    const day = 24 * 60 * 60 * 1000;
    const clearedAt = new Date(Date.now() - 10 * day).toISOString();
    const lastAttemptAt = new Date(Date.now() - 3 * day).toISOString();
    const res = await merge(user, [
      {
        problemId: "selfhold-write-1",
        attempts: 2,
        failures: 1,
        cleared: true,
        clearedAt,
        lastAttemptAt,
      },
    ]);
    expect(res.status).toBe(200);
    let row = ((await res.json()) as { progress: ProgressJson[] }).progress[0];
    expect(new Date(row?.clearedAt ?? 0).getTime()).toBe(new Date(clearedAt).getTime());
    expect(new Date(row?.lastAttemptAt ?? 0).getTime()).toBe(new Date(lastAttemptAt).getTime());

    // 2 回目: 最初のクリアは古いほうを残し、最後の挑戦は新しいほうにする
    const laterClear = new Date(Date.now() - 1 * day).toISOString();
    const laterAttempt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const again = await merge(user, [
      {
        problemId: "selfhold-write-1",
        attempts: 1,
        failures: 0,
        cleared: true,
        clearedAt: laterClear,
        lastAttemptAt: laterAttempt,
      },
    ]);
    row = ((await again.json()) as { progress: ProgressJson[] }).progress[0];
    expect(row).toMatchObject({ attempts: 3, failures: 1 });
    expect(new Date(row?.clearedAt ?? 0).getTime()).toBe(new Date(clearedAt).getTime());
    expect(new Date(row?.lastAttemptAt ?? 0).getTime()).toBe(new Date(laterAttempt).getTime());
  });

  it("未来の日時は取り込み時刻に丸め、日時でない文字列は 400", async () => {
    const user = await signUp();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await merge(user, [
      { problemId: "timer-write-1", attempts: 1, failures: 0, cleared: true, clearedAt: future },
    ]);
    expect(res.status).toBe(200);
    const row = ((await res.json()) as { progress: ProgressJson[] }).progress[0];
    expect(new Date(row?.clearedAt ?? 0).getTime()).toBeLessThanOrEqual(Date.now());

    const bad = await merge(user, [
      { problemId: "timer-write-1", attempts: 1, failures: 0, cleared: true, clearedAt: "きのう" },
    ]);
    expect(bad.status).toBe(400);
  });

  it("件数の上限を超えると 400", async () => {
    const user = await signUp();
    const entries = Array.from({ length: 46 }, (_, i) => ({
      problemId: `problem-${i}`,
      attempts: 1,
      failures: 0,
      cleared: false,
    }));
    expect((await merge(user, entries)).status).toBe(400);
  });

  it("空の配列は 400", async () => {
    const user = await signUp();
    expect((await merge(user, [])).status).toBe(400);
  });

  it("他人の進捗には影響しない", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    await merge(bob, [{ problemId: "selfhold-write-1", attempts: 9, failures: 9, cleared: true }]);

    const res = await app.request("/api/progress", { headers: authHeaders(alice) }, env);
    expect((await res.json()) as { progress: unknown[] }).toEqual({ progress: [] });
  });
});

describe("サンドボックス", () => {
  async function create(user: TestUser, title: string, body: Circuit = circuit) {
    const res = await app.request(
      "/api/sandbox",
      {
        method: "POST",
        headers: jsonHeaders(user),
        body: JSON.stringify({ title, circuit: body }),
      },
      env,
    );
    return res;
  }

  it("作成 → 取得 → 更新 → 削除ができる", async () => {
    const user = await signUp();
    const created = await create(user, "はじめての回路");
    expect(created.status).toBe(201);
    const { circuit: saved } = (await created.json()) as {
      circuit: { id: string; title: string; circuit: Circuit };
    };
    expect(saved.title).toBe("はじめての回路");
    // 保存した回路は元の形のまま戻る(指紋ではなく Circuit そのものを保存している)
    expect(saved.circuit).toEqual(circuit);

    const got = await app.request(`/api/sandbox/${saved.id}`, { headers: authHeaders(user) }, env);
    expect(got.status).toBe(200);

    const updated = await app.request(
      `/api/sandbox/${saved.id}`,
      {
        method: "PUT",
        headers: jsonHeaders(user),
        body: JSON.stringify({ title: "直した回路", circuit: variantCircuit(1) }),
      },
      env,
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { circuit: { title: string } }).circuit.title).toBe(
      "直した回路",
    );

    const removed = await app.request(
      `/api/sandbox/${saved.id}`,
      { method: "DELETE", headers: authHeaders(user) },
      env,
    );
    expect(removed.status).toBe(200);

    const gone = await app.request(`/api/sandbox/${saved.id}`, { headers: authHeaders(user) }, env);
    expect(gone.status).toBe(404);
  });

  it("テストケースがまだ無くても保存できる(§3.4)", async () => {
    const user = await signUp();
    const res = await app.request(
      "/api/sandbox",
      {
        method: "POST",
        headers: jsonHeaders(user),
        body: JSON.stringify({ title: "テスト未設定", circuit, testCases: [] }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { circuit: { testCases: unknown } };
    expect(body.circuit.testCases).toEqual([]);
  });

  it("テストケースを付けて保存できる(§3.4)", async () => {
    const user = await signUp();
    const testCases = [
      {
        id: "tc1",
        title: "押すと点灯",
        steps: [
          { type: "set", inputs: { X0: true } },
          { type: "expect", outputs: { Y0: true } },
        ],
      },
    ];
    const res = await app.request(
      "/api/sandbox",
      {
        method: "POST",
        headers: jsonHeaders(user),
        body: JSON.stringify({ title: "テスト付き", circuit, testCases }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { circuit: { testCases: unknown } };
    expect(body.circuit.testCases).toEqual(testCases);
  });

  it("壊れたテストケースは保存しない", async () => {
    const user = await signUp();
    const res = await app.request(
      "/api/sandbox",
      {
        method: "POST",
        headers: jsonHeaders(user),
        body: JSON.stringify({
          title: "壊れたテスト",
          circuit,
          testCases: [{ id: "tc1", title: "expect が無い", steps: [{ type: "wait", ms: 10 }] }],
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("保存数の上限を超えると 409", async () => {
    const user = await signUp();
    const now = Date.now();
    const stmt = env.DB.prepare(
      "insert into sandbox_circuits (id, user_id, title, circuit_json, test_cases_json, created_at, updated_at) values (?, ?, ?, ?, '[]', ?, ?)",
    );
    await env.DB.batch(
      Array.from({ length: 50 }, (_, i) =>
        stmt.bind(`seed-${user.id}-${i}`, user.id, `既存 ${i}`, JSON.stringify(circuit), now, now),
      ),
    );
    const res = await create(user, "51 個目");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "quota_exceeded" });
  });
});

describe("提出履歴", () => {
  async function submit(user: TestUser, problemId: string, body: Circuit, passed: boolean) {
    return app.request(
      "/api/submissions",
      {
        method: "POST",
        headers: jsonHeaders(user),
        body: JSON.stringify({ problemId, circuit: body, passed }),
      },
      env,
    );
  }

  it("提出を記録し、一覧で読める", async () => {
    const user = await signUp();
    const res = await submit(user, "selfhold-1", circuit, true);
    expect(res.status).toBe(201);
    expect((await res.json()) as { deduplicated: boolean }).toMatchObject({ deduplicated: false });

    const list = await app.request(
      "/api/submissions?problemId=selfhold-1",
      { headers: authHeaders(user) },
      env,
    );
    const body = (await list.json()) as { submissions: Array<{ circuit: Circuit }> };
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0]?.circuit).toEqual(circuit);
  });

  it("同じ回路を出し直しても行を増やさない(S-003)", async () => {
    const user = await signUp();
    await submit(user, "selfhold-1", circuit, false);
    const again = await submit(user, "selfhold-1", circuit, false);
    expect(again.status).toBe(200);
    expect((await again.json()) as { deduplicated: boolean }).toMatchObject({
      deduplicated: true,
    });

    const row = await env.DB.prepare("select count(*) as n from submissions where user_id = ?")
      .bind(user.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("問題が違えば同じ回路でも別に記録される", async () => {
    const user = await signUp();
    await submit(user, "selfhold-1", circuit, false);
    const other = await submit(user, "timer-1", circuit, false);
    expect(other.status).toBe(201);
  });

  it("不正解の履歴は直近 20 件に切り詰められ、正解は残る(S-003)", async () => {
    const user = await signUp();
    await submit(user, "selfhold-1", circuit, true);
    for (let i = 0; i < 25; i++) {
      const res = await submit(user, "selfhold-1", variantCircuit(i), false);
      expect(res.status).toBe(201);
    }

    const failed = await env.DB.prepare(
      "select count(*) as n from submissions where user_id = ? and problem_id = ? and passed = 0",
    )
      .bind(user.id, "selfhold-1")
      .first<{ n: number }>();
    expect(failed?.n).toBe(20);

    const passed = await env.DB.prepare(
      "select count(*) as n from submissions where user_id = ? and problem_id = ? and passed = 1",
    )
      .bind(user.id, "selfhold-1")
      .first<{ n: number }>();
    expect(passed?.n).toBe(1);
  });
});

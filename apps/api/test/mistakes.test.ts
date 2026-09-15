import { env } from "cloudflare:test";
import { type Circuit, ladder, no, out } from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { MIN_USERS_TO_SHOW } from "../src/routes/mistakes.js";
import { jsonHeaders, signUp, type TestUser } from "./helpers.js";

/**
 * 「みんながつまずくところ」の集計(SPEC.md §3.5)。
 *
 * 注意: 同じファイル内のテストは同じローカル D1 を共有する(helpers.ts)。
 * 集計はユーザーで絞れないので、テストごとに別の problemId を使う。
 */

let problemSeq = 0;
function freshProblemId(): string {
  problemSeq += 1;
  return `mistake-test-${problemSeq}-${Date.now().toString(36)}`;
}

/** 指紋が異なる回路。同じ回路の重複保存を避ける仕組み(S-003)と切り分けるため */
function variant(i: number): Circuit {
  return ladder(3 + (i % 3))
    .row(no("X0"), out("Y0"))
    .build();
}

async function submit(
  user: TestUser,
  problemId: string,
  body: { passed: boolean; diagnosisId?: string; circuit?: Circuit },
) {
  return app.request(
    "/api/submissions",
    {
      method: "POST",
      headers: jsonHeaders(user),
      body: JSON.stringify({
        problemId,
        circuit: body.circuit ?? variant(0),
        passed: body.passed,
        ...(body.diagnosisId ? { diagnosisId: body.diagnosisId } : {}),
      }),
    },
    env,
  );
}

async function readMistakes(problemId: string) {
  const res = await app.request(`/api/mistakes/${problemId}`, {}, env);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    problemId: string;
    minUsers: number;
    mistakes: Array<{ diagnosisId: string; users: number }>;
  };
}

describe("みんながつまずくところ", () => {
  it("ログインしていなくても読める(個人は出さない)", async () => {
    const body = await readMistakes(freshProblemId());
    expect(body.mistakes).toEqual([]);
    expect(body.minUsers).toBe(MIN_USERS_TO_SHOW);
  });

  it("人数がしきい値に届くまでは何も出さない", async () => {
    const problemId = freshProblemId();
    for (let i = 0; i < MIN_USERS_TO_SHOW - 1; i++) {
      const user = await signUp("few");
      const res = await submit(user, problemId, {
        passed: false,
        diagnosisId: "contact-kind",
        circuit: variant(i),
      });
      expect(res.status).toBe(201);
    }
    expect((await readMistakes(problemId)).mistakes).toEqual([]);
  });

  it("しきい値に達したら人数つきで出る", async () => {
    const problemId = freshProblemId();
    for (let i = 0; i < MIN_USERS_TO_SHOW; i++) {
      const user = await signUp("enough");
      await submit(user, problemId, {
        passed: false,
        diagnosisId: "no-self-hold",
        circuit: variant(i),
      });
    }
    const body = await readMistakes(problemId);
    expect(body.mistakes).toEqual([{ diagnosisId: "no-self-hold", users: MIN_USERS_TO_SHOW }]);
  });

  it("同じ人が何度つまずいても 1 人と数える", async () => {
    const problemId = freshProblemId();
    const repeater = await signUp("repeat");
    for (let i = 0; i < 5; i++) {
      await submit(repeater, problemId, {
        passed: false,
        diagnosisId: "contact-kind",
        circuit: variant(i),
      });
    }
    // 残り 2 人を別ユーザーで埋める
    for (let i = 0; i < MIN_USERS_TO_SHOW - 1; i++) {
      const other = await signUp("other");
      await submit(other, problemId, {
        passed: false,
        diagnosisId: "contact-kind",
        circuit: variant(i),
      });
    }
    const body = await readMistakes(problemId);
    expect(body.mistakes).toEqual([{ diagnosisId: "contact-kind", users: MIN_USERS_TO_SHOW }]);
  });

  it("同じ回路の出し直し(重複保存されない)でも人数には数える", async () => {
    const problemId = freshProblemId();
    const same = variant(0);
    for (let i = 0; i < MIN_USERS_TO_SHOW; i++) {
      const user = await signUp("dedup");
      const first = await submit(user, problemId, {
        passed: false,
        diagnosisId: "device-mixup",
        circuit: same,
      });
      expect(first.status).toBe(201);
      // まったく同じ回路をもう一度。行は増えないが、人数は既に数えられている
      const second = await submit(user, problemId, {
        passed: false,
        diagnosisId: "device-mixup",
        circuit: same,
      });
      expect(((await second.json()) as { deduplicated: boolean }).deduplicated).toBe(true);
    }
    const body = await readMistakes(problemId);
    expect(body.mistakes).toEqual([{ diagnosisId: "device-mixup", users: MIN_USERS_TO_SHOW }]);
  });

  it("多い順に並び、出すのは 3 種類まで", async () => {
    const problemId = freshProblemId();
    const plan: Array<[string, number]> = [
      ["contact-kind", 6],
      ["no-self-hold", 5],
      ["timer-preset", 4],
      ["vline-missing", 3],
    ];
    for (const [diagnosisId, count] of plan) {
      for (let i = 0; i < count; i++) {
        const user = await signUp("many");
        await submit(user, problemId, { passed: false, diagnosisId, circuit: variant(i) });
      }
    }
    const body = await readMistakes(problemId);
    expect(body.mistakes.map((m) => m.diagnosisId)).toEqual([
      "contact-kind",
      "no-self-hold",
      "timer-preset",
    ]);
    expect(body.mistakes.map((m) => m.users)).toEqual([6, 5, 4]);
  });

  it("正解の提出は数えない", async () => {
    const problemId = freshProblemId();
    for (let i = 0; i < MIN_USERS_TO_SHOW + 2; i++) {
      const user = await signUp("passed");
      await submit(user, problemId, {
        passed: true,
        diagnosisId: "contact-kind",
        circuit: variant(i),
      });
    }
    expect((await readMistakes(problemId)).mistakes).toEqual([]);
  });

  it("知らない診断 ID は受け付けない", async () => {
    const user = await signUp("bogus");
    const res = await submit(user, freshProblemId(), {
      passed: false,
      diagnosisId: "totally-made-up",
    });
    expect(res.status).toBe(400);
  });

  it("診断 ID が無い提出は保存できるが、集計には入らない", async () => {
    const problemId = freshProblemId();
    for (let i = 0; i < MIN_USERS_TO_SHOW; i++) {
      const user = await signUp("nodiag");
      const res = await submit(user, problemId, { passed: false, circuit: variant(i) });
      expect(res.status).toBe(201);
    }
    expect((await readMistakes(problemId)).mistakes).toEqual([]);
  });

  it("おかしな問題 ID は 400", async () => {
    const res = await app.request("/api/mistakes/Bad%20Id", {}, env);
    expect(res.status).toBe(400);
  });

  it("問題ごとに別々に数える", async () => {
    const a = freshProblemId();
    const b = freshProblemId();
    for (let i = 0; i < MIN_USERS_TO_SHOW; i++) {
      const user = await signUp("split");
      await submit(user, a, { passed: false, diagnosisId: "no-coil", circuit: variant(i) });
    }
    expect((await readMistakes(a)).mistakes).toHaveLength(1);
    expect((await readMistakes(b)).mistakes).toEqual([]);
  });
});

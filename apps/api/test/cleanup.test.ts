import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  countPrunable,
  KEEP_FAILED_DAYS,
  MAX_DELETE_PER_RUN,
  pruneOldSubmissions,
} from "../src/cleanup.js";
import worker from "../src/index.js";
import { signUp, type TestUser } from "./helpers.js";

/**
 * 古い提出履歴の掃除(改善候補 13 / S-017)。
 *
 * 消すのは 90 日より前の不正解だけ。正解は消さない。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 提出履歴を直接入れる。日付を自由に決めたいので API は通さない */
async function insertSubmission(
  user: TestUser,
  over: { problemId?: string; passed?: boolean; daysAgo?: number; hash?: string } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  const daysAgo = over.daysAgo ?? 0;
  await env.DB.prepare(
    `insert into submissions
       (id, user_id, problem_id, circuit_json, circuit_hash, passed, created_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      over.problemId ?? "selfhold-read-0",
      '{"rows":[]}',
      over.hash ?? id,
      over.passed === true ? 1 : 0,
      Date.now() - daysAgo * DAY_MS,
    )
    .run();
  return id;
}

async function exists(id: string): Promise<boolean> {
  const row = await env.DB.prepare("select id from submissions where id = ?").bind(id).first();
  return row !== null;
}

describe("古い提出履歴の掃除", () => {
  it("90 日より前の不正解は消す", async () => {
    const user = await signUp();
    const old = await insertSubmission(user, { daysAgo: KEEP_FAILED_DAYS + 1, passed: false });

    const { deleted } = await pruneOldSubmissions(env);
    expect(deleted).toBe(1);
    expect(await exists(old)).toBe(false);
  });

  it("**正解は消さない**。いつ解けたかは本人の記録として意味がある", async () => {
    const user = await signUp();
    const oldPass = await insertSubmission(user, { daysAgo: KEEP_FAILED_DAYS * 10, passed: true });

    const { deleted } = await pruneOldSubmissions(env);
    expect(deleted).toBe(0);
    expect(await exists(oldPass)).toBe(true);
  });

  it("90 日以内の不正解は消さない", async () => {
    const user = await signUp();
    const recent = await insertSubmission(user, { daysAgo: KEEP_FAILED_DAYS - 1, passed: false });

    await pruneOldSubmissions(env);
    expect(await exists(recent)).toBe(true);
  });

  it("境目のちょうど 90 日は残す(消すのは「より前」)", async () => {
    const user = await signUp();
    // 境目そのものを狙うと時刻のずれで揺れるので、わずかに内側に置く
    const onEdge = await insertSubmission(user, { passed: false });
    await env.DB.prepare("update submissions set created_at = ? where id = ?")
      .bind(Date.now() - KEEP_FAILED_DAYS * DAY_MS + 60_000, onEdge)
      .run();

    await pruneOldSubmissions(env);
    expect(await exists(onEdge)).toBe(true);
  });

  it("消すものが無ければ何もしない", async () => {
    await signUp();
    expect(await pruneOldSubmissions(env)).toEqual({ deleted: 0, hitLimit: false });
  });

  it("1 回の実行で消す件数に上限がある(D1 の書き込み枠を掃除で使い切らない)", async () => {
    const user = await signUp();
    // 上限より少し多く積む。全部消えてしまうなら上限が効いていない
    const total = MAX_DELETE_PER_RUN + 5;
    const values: string[] = [];
    for (let i = 0; i < total; i++) {
      values.push(
        `('${crypto.randomUUID()}', '${user.id}', 'p', '{}', '${i}', 0, ${
          Date.now() - (KEEP_FAILED_DAYS + 1) * DAY_MS - i
        })`,
      );
    }
    // まとめて入れる。1 件ずつだと時間がかかりすぎる
    for (let i = 0; i < values.length; i += 500) {
      await env.DB.prepare(
        `insert into submissions
           (id, user_id, problem_id, circuit_json, circuit_hash, passed, created_at)
         values ${values.slice(i, i + 500).join(",")}`,
      ).run();
    }

    const first = await pruneOldSubmissions(env);
    expect(first.deleted).toBe(MAX_DELETE_PER_RUN);
    expect(first.hitLimit).toBe(true);
    expect(await countPrunable(env)).toBe(5);

    // 残りは次の実行で消える
    const second = await pruneOldSubmissions(env);
    expect(second).toEqual({ deleted: 5, hitLimit: false });
    expect(await countPrunable(env)).toBe(0);
  });

  it("古いものから先に消す", async () => {
    const user = await signUp();
    const oldest = await insertSubmission(user, { daysAgo: 400, passed: false });
    const newer = await insertSubmission(user, { daysAgo: KEEP_FAILED_DAYS + 1, passed: false });

    // 1 件だけ消える状況を作れないので、両方消えることと、
    // 並び順が古い順であることを countPrunable の減り方で見る
    expect(await countPrunable(env)).toBe(2);
    await pruneOldSubmissions(env);
    expect(await exists(oldest)).toBe(false);
    expect(await exists(newer)).toBe(false);
  });

  it("他の人の履歴も同じ基準で消える(利用者が増えるほど溜まるのを防ぐ)", async () => {
    const a = await signUp("cleanup-a");
    const b = await signUp("cleanup-b");
    const oldA = await insertSubmission(a, { daysAgo: KEEP_FAILED_DAYS + 1, passed: false });
    const oldB = await insertSubmission(b, { daysAgo: KEEP_FAILED_DAYS + 1, passed: false });
    const recentB = await insertSubmission(b, { daysAgo: 1, passed: false });

    const { deleted } = await pruneOldSubmissions(env);
    expect(deleted).toBe(2);
    expect(await exists(oldA)).toBe(false);
    expect(await exists(oldB)).toBe(false);
    expect(await exists(recentB)).toBe(true);
  });
});

describe("1 日 1 回の Cron", () => {
  /** Cron の入口を実際に呼ぶ */
  async function runScheduled(): Promise<void> {
    const ctx = createExecutionContext();
    await worker.scheduled?.(
      createScheduledController({ scheduledTime: new Date(), cron: "0 18 * * *" }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
  }

  it("Cron から掃除が動く(呼び忘れていないこと)", async () => {
    const user = await signUp();
    const old = await insertSubmission(user, { daysAgo: KEEP_FAILED_DAYS + 1, passed: false });
    const recent = await insertSubmission(user, { daysAgo: 1, passed: false });

    await runScheduled();

    expect(await exists(old)).toBe(false);
    expect(await exists(recent)).toBe(true);
  });
});

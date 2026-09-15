import { describe, expect, it } from "vitest";
import type { ProgressMap } from "./progress.js";
import { dueForReview, REVIEW_INTERVALS_DAYS } from "./review.js";

const NOW = new Date("2026-09-15T00:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** クリア済みで、`days` 日前に最後に触った問題 */
function cleared(days: number, extra: { attempts?: number; failures?: number } = {}) {
  return {
    cleared: true,
    clearedAt: daysAgo(days),
    lastAttemptAt: daysAgo(days),
    attempts: extra.attempts ?? 1,
    failures: extra.failures ?? 0,
  };
}

describe("復習の提案", () => {
  it("クリアしていない問題は出さない", () => {
    const progress: ProgressMap = {
      a: { cleared: false, attempts: 5, failures: 5, lastAttemptAt: daysAgo(100) },
    };
    expect(dueForReview(progress, { now: NOW })).toEqual([]);
  });

  it("間隔が来ていない問題は出さない", () => {
    const progress: ProgressMap = { a: cleared(REVIEW_INTERVALS_DAYS[0] - 1) };
    expect(dueForReview(progress, { now: NOW })).toEqual([]);
  });

  it("間隔が来たら出す", () => {
    const progress: ProgressMap = { a: cleared(REVIEW_INTERVALS_DAYS[0]) };
    expect(dueForReview(progress, { now: NOW })).toEqual([
      { problemId: "a", daysSince: REVIEW_INTERVALS_DAYS[0] },
    ]);
  });

  it("思い出せた回数が増えるほど間隔が広がる", () => {
    const at30Days = 30;
    // 1 回成功 → 7 日で出る
    expect(
      dueForReview({ a: cleared(at30Days, { attempts: 1, failures: 0 }) }, { now: NOW }),
    ).toHaveLength(1);
    // 2 回成功 → 21 日。30 日経っているのでまだ出る
    expect(
      dueForReview({ a: cleared(at30Days, { attempts: 2, failures: 0 }) }, { now: NOW }),
    ).toHaveLength(1);
    // 3 回成功 → 60 日。30 日では出ない
    expect(
      dueForReview({ a: cleared(at30Days, { attempts: 3, failures: 0 }) }, { now: NOW }),
    ).toEqual([]);
  });

  it("失敗した回数は「思い出せた回数」に数えない", () => {
    // 10 回挑戦して 9 回失敗 = 1 回成功。間隔は 7 日のまま
    const progress: ProgressMap = { a: cleared(10, { attempts: 10, failures: 9 }) };
    expect(dueForReview(progress, { now: NOW })).toHaveLength(1);
  });

  it("放置が長い順に並ぶ", () => {
    const progress: ProgressMap = { a: cleared(10), b: cleared(90), c: cleared(30) };
    expect(dueForReview(progress, { now: NOW }).map((r) => r.problemId)).toEqual(["b", "c", "a"]);
  });

  it("同じ日数なら ID 順。並びが毎回変わらないように", () => {
    const progress: ProgressMap = { b: cleared(10), a: cleared(10) };
    expect(dueForReview(progress, { now: NOW }).map((r) => r.problemId)).toEqual(["a", "b"]);
  });

  it("出す件数を絞れる(既定 3 件)", () => {
    const progress: ProgressMap = {
      a: cleared(10),
      b: cleared(20),
      c: cleared(30),
      d: cleared(40),
    };
    expect(dueForReview(progress, { now: NOW })).toHaveLength(3);
    expect(dueForReview(progress, { now: NOW, limit: 1 })).toHaveLength(1);
  });

  it("知らない問題 ID は出さない(消した問題が残っていても平気)", () => {
    const progress: ProgressMap = { alive: cleared(30), deleted: cleared(90) };
    const items = dueForReview(progress, { now: NOW, known: new Set(["alive"]) });
    expect(items.map((r) => r.problemId)).toEqual(["alive"]);
  });

  it("挑戦の記録が無くても、クリア日時で判断する", () => {
    const progress: ProgressMap = {
      a: { cleared: true, clearedAt: daysAgo(30), attempts: 1, failures: 0 },
    };
    expect(dueForReview(progress, { now: NOW })).toHaveLength(1);
  });

  it("日時が壊れていても落ちない", () => {
    const progress: ProgressMap = {
      a: { cleared: true, clearedAt: "not-a-date", attempts: 1, failures: 0 },
      b: { cleared: true, attempts: 1, failures: 0 },
    };
    expect(dueForReview(progress, { now: NOW })).toEqual([]);
  });

  it("未来の日時(端末の時計がずれている)でも出さない", () => {
    const progress: ProgressMap = { a: cleared(-5) };
    expect(dueForReview(progress, { now: NOW })).toEqual([]);
  });
});

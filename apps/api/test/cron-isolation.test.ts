import { describe, expect, it, vi } from "vitest";
import { runDailyJobs } from "../src/jobs.js";

/**
 * Cron の中の仕事は互いを巻き込まない(改善候補 13 / S-017)。
 *
 * ランキング集計と提出履歴の掃除を順番に await で繋ぐと、
 * **ランキングが失敗した日は掃除も止まる**。掃除が止まったことは誰も見ないので、
 * 気づかないうちに古い履歴が溜まっていく。
 */

describe("1 日 1 回の仕事の動かし方", () => {
  it("1 つが落ちても、残りは動く", async () => {
    const ran: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runDailyJobs([
      {
        name: "落ちるほう",
        run: () => {
          ran.push("落ちるほう");
          return Promise.reject(new Error("boom"));
        },
      },
      {
        name: "動くほう",
        run: async () => {
          ran.push("動くほう");
        },
      },
    ]);

    expect(ran).toEqual(["落ちるほう", "動くほう"]);
    spy.mockRestore();
  });

  it("先に書いたほうが落ちても、後ろが飛ばされない(順番を変えても同じ)", async () => {
    const ran: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runDailyJobs([
      { name: "1", run: async () => void ran.push("1") },
      { name: "2", run: () => Promise.reject(new Error("boom")) },
      { name: "3", run: async () => void ran.push("3") },
    ]);

    expect(ran).toEqual(["1", "3"]);
    spy.mockRestore();
  });

  it("落ちた仕事の名前をログに残す(どれが止まったか分かるように)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runDailyJobs([{ name: "submission-cleanup", run: () => Promise.reject(new Error("x")) }]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("submission-cleanup");
    spy.mockRestore();
  });

  it("全部うまくいけば何もログに出さない", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runDailyJobs([{ name: "ok", run: async () => {} }]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("**全部が落ちても投げ返さない**(Cron の実行そのものは失敗扱いにしない)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runDailyJobs([
        { name: "a", run: () => Promise.reject(new Error("a")) },
        { name: "b", run: () => Promise.reject(new Error("b")) },
      ]),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

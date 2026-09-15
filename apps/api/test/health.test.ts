import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { productionEnv } from "./helpers.js";

describe("GET /api/health", () => {
  it("200 と core のバージョンを返す", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      env: "e2e",
      core: { schemaVersion: 1 },
      e2eAuthBypass: true,
    });
  });

  it("本番設定では e2eAuthBypass が false", async () => {
    const res = await app.request("/api/health", {}, productionEnv());
    expect(await res.json()).toMatchObject({ env: "production", e2eAuthBypass: false });
  });

  it("未知の /api ルートは 404 JSON", async () => {
    const res = await app.request("/api/nope", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("D1 バインディングがローカルで使える", async () => {
    const row = await env.DB.prepare("select 1 as one").first<{ one: number }>();
    expect(row?.one).toBe(1);
  });

  it("マイグレーションが適用されている", async () => {
    const rows = await env.DB.prepare(
      "select name from sqlite_master where type='table' order by name",
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "account",
        "activity_days",
        "progress",
        "sandbox_circuits",
        "session",
        "submissions",
        "user",
        "verification",
      ]),
    );
  });
});

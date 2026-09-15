import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  it("200 と core のバージョンを返す", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      env: "production",
      core: { schemaVersion: 1 },
    });
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

  it("本番設定では E2E_AUTH_BYPASS が存在しない(D-014)", () => {
    expect(env.E2E_AUTH_BYPASS).toBeUndefined();
  });
});

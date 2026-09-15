import { circuitSchema, sandboxTestCasesSchema } from "@ladder-dojo/core";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { sandboxCircuits } from "../db/schema.js";
import type { SandboxDto } from "../dto.js";
import type { AppBindings } from "../env.js";
import { byteLength, MAX_CIRCUIT_JSON_BYTES, newId } from "../lib/util.js";
import { requireUser } from "../middleware/auth.js";

/** 1 ユーザーあたりの保存上限(COST.md §1.2 の縮退方針) */
const MAX_CIRCUITS_PER_USER = 50;

const bodySchema = z.object({
  title: z.string().min(1).max(100),
  circuit: circuitSchema,
  testCases: sandboxTestCasesSchema.optional(),
});

/**
 * サンドボックスの保存回路(SPEC.md §3.4)。本人のデータのみ。
 * 他人の ID を指定した取得・更新・削除は 404 にする(存在を漏らさない。D-017 方針 3)。
 */
export const sandboxRoutes = new Hono<AppBindings>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: sandboxCircuits.id,
        title: sandboxCircuits.title,
        createdAt: sandboxCircuits.createdAt,
        updatedAt: sandboxCircuits.updatedAt,
      })
      .from(sandboxCircuits)
      .where(eq(sandboxCircuits.userId, c.var.user.id))
      .orderBy(desc(sandboxCircuits.updatedAt))
      .limit(MAX_CIRCUITS_PER_USER);
    return c.json({
      circuits: rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  })
  .get("/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const row = await findOwn(db, c.var.user.id, c.req.param("id"));
    if (!row) return c.json({ error: "not_found" } as const, 404);
    return c.json({ circuit: toJson(row) });
  })
  .post("/", async (c) => {
    const body = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);
    const circuitJson = JSON.stringify(body.data.circuit);
    const testCasesJson = JSON.stringify(body.data.testCases ?? []);
    if (byteLength(circuitJson) + byteLength(testCasesJson) > MAX_CIRCUIT_JSON_BYTES) {
      return c.json({ error: "too_large" } as const, 413);
    }

    const db = drizzle(c.env.DB);
    const count = await db.$count(sandboxCircuits, eq(sandboxCircuits.userId, c.var.user.id));
    if (count >= MAX_CIRCUITS_PER_USER) return c.json({ error: "quota_exceeded" } as const, 409);

    const now = new Date();
    const row = await db
      .insert(sandboxCircuits)
      .values({
        id: newId(),
        userId: c.var.user.id,
        title: body.data.title,
        circuitJson,
        testCasesJson,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json({ circuit: toJson(row) }, 201);
  })
  .put("/:id", async (c) => {
    const body = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);
    const circuitJson = JSON.stringify(body.data.circuit);
    const testCasesJson = JSON.stringify(body.data.testCases ?? []);
    if (byteLength(circuitJson) + byteLength(testCasesJson) > MAX_CIRCUIT_JSON_BYTES) {
      return c.json({ error: "too_large" } as const, 413);
    }

    const db = drizzle(c.env.DB);
    // 他人の回路を指定しても WHERE に user_id が入っているので 0 件更新 = 404 になる
    const row = await db
      .update(sandboxCircuits)
      .set({ title: body.data.title, circuitJson, testCasesJson, updatedAt: new Date() })
      .where(
        and(eq(sandboxCircuits.userId, c.var.user.id), eq(sandboxCircuits.id, c.req.param("id"))),
      )
      .returning()
      .get();
    if (!row) return c.json({ error: "not_found" } as const, 404);
    return c.json({ circuit: toJson(row) });
  })
  .delete("/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const row = await db
      .delete(sandboxCircuits)
      .where(
        and(eq(sandboxCircuits.userId, c.var.user.id), eq(sandboxCircuits.id, c.req.param("id"))),
      )
      .returning()
      .get();
    if (!row) return c.json({ error: "not_found" } as const, 404);
    return c.json({ deleted: true as const });
  });

type Db = ReturnType<typeof drizzle>;

function findOwn(db: Db, userId: string, id: string) {
  return db
    .select()
    .from(sandboxCircuits)
    .where(and(eq(sandboxCircuits.userId, userId), eq(sandboxCircuits.id, id)))
    .get();
}

function toJson(row: typeof sandboxCircuits.$inferSelect): SandboxDto {
  return {
    id: row.id,
    title: row.title,
    circuit: JSON.parse(row.circuitJson) as unknown,
    testCases: JSON.parse(row.testCasesJson) as unknown,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

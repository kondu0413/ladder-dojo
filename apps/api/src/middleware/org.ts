import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { orgMembers } from "../db/schema.js";
import type { AppBindings, Membership } from "../env.js";

/**
 * 組織の権限判定(DECISIONS.md D-017 方針 4)。
 *
 * - メンバー外は **404**(組織の存在を漏らさない)
 * - メンバーだが管理者でない場合は **403**
 *
 * 判定は `org_members` を 1 クエリ引くだけで済ませる(D1 の読み取り行数を抑える)。
 */
export const requireOrgMember = createMiddleware<AppBindings>(async (c, next) => {
  const membership = await loadMembership(c.env.DB, c.req.param("orgId"), c.var.user.id);
  if (!membership) return c.json({ error: "not_found" } as const, 404);
  c.set("membership", membership);
  await next();
});

export const requireOrgAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const membership = await loadMembership(c.env.DB, c.req.param("orgId"), c.var.user.id);
  if (!membership) return c.json({ error: "not_found" } as const, 404);
  if (membership.role !== "admin") return c.json({ error: "forbidden" } as const, 403);
  c.set("membership", membership);
  await next();
});

async function loadMembership(
  DB: D1Database,
  orgId: string | undefined,
  userId: string,
): Promise<Membership | undefined> {
  if (!orgId) return undefined;
  const db = drizzle(DB);
  const row = await db
    .select({ orgId: orgMembers.orgId, role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .get();
  return row ?? undefined;
}

/** 対象ユーザーがその組織のメンバーか(D-017 方針 6: 管理者でも組織外は見られない) */
export async function isOrgMember(DB: D1Database, orgId: string, userId: string): Promise<boolean> {
  return Boolean(await loadMembership(DB, orgId, userId));
}

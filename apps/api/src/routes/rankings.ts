import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { orgMembers } from "../db/schema.js";
import type { AppBindings } from "../env.js";
import { optionalUser } from "../middleware/auth.js";
import {
  computeOrgRanking,
  computeUserValue,
  METRICS,
  type Metric,
  PERIODS,
  type Period,
  readGlobalRanking,
} from "../ranking.js";

const querySchema = z.object({
  period: z.enum(PERIODS).default("weekly"),
  metric: z.enum(METRICS).default("solved"),
  /** 指定すると組織内ランキング(所属メンバーのみ、§3.7) */
  orgId: z.string().max(64).optional(),
});

/**
 * ランキング(SPEC.md §3.7)。速さは競わせず、貢献・継続系の指標だけを出す。
 * 未ログインでも全体ランキングは見られる。組織内ランキングは所属メンバーのみ。
 */
export const rankingRoutes = new Hono<AppBindings>().get("/", optionalUser, async (c) => {
  const query = querySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid_body" } as const, 400);
  const { period, metric, orgId } = query.data;

  // 連続学習日数は「いまの連続」なので期間で切らない
  const effectivePeriod: Period = metric === "streak" ? "all" : period;

  if (!orgId) {
    const result = await readGlobalRanking(c.env, metric as Metric, effectivePeriod);
    const signedIn = c.get("user");
    // ログインしていれば「あなたのいま」を別に出す。スナップショットは 1 日 1 回なので、
    // クリア直後は自分が一覧に載らず、記録されていないように見える(S-026)
    const mine = signedIn
      ? await computeUserValue(c.env, signedIn.id, metric as Metric, effectivePeriod)
      : null;
    return c.json({
      period: effectivePeriod,
      metric,
      orgId: null,
      entries: result.entries,
      computedAt: result.computedAt,
      // 全体ランキングは Cron で 1 日 1 回計算する(D-010)
      live: false,
      me: signedIn ? { userId: signedIn.id, userName: signedIn.name, value: mine ?? 0 } : null,
    });
  }

  const me = c.get("user");
  if (!me) return c.json({ error: "unauthorized" } as const, 401);

  const db = drizzle(c.env.DB);
  const membership = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))
    .limit(500);
  // 所属していなければ組織の存在を漏らさない(D-017 方針 4)
  if (!membership.some((m) => m.userId === me.id)) {
    return c.json({ error: "not_found" } as const, 404);
  }

  const entries = await computeOrgRanking(
    c.env,
    membership.map((m) => m.userId),
    metric as Metric,
    effectivePeriod,
  );
  // 組織は対象が少ないので毎回その場で計算する = 常に最新
  return c.json({
    period: effectivePeriod,
    metric,
    orgId,
    entries,
    computedAt: new Date().toISOString(),
    live: true,
  });
});

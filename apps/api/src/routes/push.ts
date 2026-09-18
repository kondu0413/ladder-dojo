import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { pushSubscriptions } from "../db/schema.js";
import type { PushPublicKeyDto, PushSubscriptionListDto, PushTestDto } from "../dto.js";
import type { AppBindings } from "../env.js";
import { newId } from "../lib/util.js";
import { requireUser } from "../middleware/auth.js";
import { sendWebPush } from "../push/webpush.js";

/** 1 人が登録できる端末(購読)の数。古いものから消す */
export const MAX_SUBSCRIPTIONS_PER_USER = 5;

const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2048),
  keys: z.object({
    p256dh: z.string().min(80).max(120),
    auth: z.string().min(16).max(32),
  }),
});
const endpointSchema = z.object({ endpoint: z.string().url().max(2048) });

/**
 * Web Push の購読(S-045)。本人の購読だけを触る(D-017 方針 3)。
 * 公開鍵は誰でも読める(ブラウザが購読を作るのに要る)。
 */
export const pushRoutes = new Hono<AppBindings>()
  .get("/public-key", (c) =>
    c.json<PushPublicKeyDto>({ publicKey: c.env.VAPID_PUBLIC_KEY ?? null }),
  )
  .use("*", requireUser)
  .get("/subscriptions", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, c.var.user.id))
      .limit(MAX_SUBSCRIPTIONS_PER_USER);
    return c.json<PushSubscriptionListDto>({ endpoints: rows.map((r) => r.endpoint) });
  })
  .post("/subscriptions", async (c) => {
    const body = subscriptionSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);
    const db = drizzle(c.env.DB);
    const userId = c.var.user.id;
    const now = new Date();
    // 同じ端末で別のアカウントに入り直した場合は、新しい持ち主に付け替える
    await db
      .insert(pushSubscriptions)
      .values({
        id: newId(),
        userId,
        endpoint: body.data.endpoint,
        p256dh: body.data.keys.p256dh,
        auth: body.data.keys.auth,
        createdAt: now,
        lastUsedAt: null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, createdAt: now },
      });

    // 端末が増えすぎたら古いものから消す
    const mine = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(desc(pushSubscriptions.createdAt))
      .limit(MAX_SUBSCRIPTIONS_PER_USER + 10);
    const extra = mine.slice(MAX_SUBSCRIPTIONS_PER_USER).map((r) => r.id);
    if (extra.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, extra));
    }
    return c.json({ subscribed: true as const }, 201);
  })
  .delete("/subscriptions", async (c) => {
    const body = endpointSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);
    const db = drizzle(c.env.DB);
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, c.var.user.id),
          eq(pushSubscriptions.endpoint, body.data.endpoint),
        ),
      );
    return c.json({ deleted: true as const });
  })
  /** 自分の端末にテスト通知を送る。届くかどうかをその場で確かめるためのもの */
  .post("/test", async (c) => {
    const publicKey = c.env.VAPID_PUBLIC_KEY;
    const privateKey = c.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return c.json({ error: "push_unavailable" } as const, 503);
    const db = drizzle(c.env.DB);
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, c.var.user.id))
      .limit(MAX_SUBSCRIPTIONS_PER_USER);
    const message = {
      title: "ラダー道場",
      body: "テスト通知です。課題の期限と新しい課題を、毎朝 9 時にここへお知らせします。",
      url: "/orgs",
      tag: "test",
    };
    let sent = 0;
    const gone: string[] = [];
    for (const sub of subs) {
      const r = await sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { publicKey, privateKey },
        c.env.BETTER_AUTH_URL,
      ).catch(() => ({ ok: false, status: 0, gone: false }));
      if (r.ok) sent++;
      else if (r.gone) gone.push(sub.id);
    }
    if (gone.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    }
    return c.json<PushTestDto>({ sent, removed: gone.length });
  });

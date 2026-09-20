import { and, asc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  assignments,
  orgMembers,
  postedAttempts,
  progress,
  pushSubscriptions,
} from "../db/schema.js";
import type { Env } from "../env.js";
import { type PushMessage, sendWebPush } from "./webpush.js";

/**
 * 課題の通知(S-045)。毎朝 1 回、購読している人にまとめて 1 通ずつ送る。
 *
 * - 期限が 3 日以内の課題と、この 24 時間で割り当てられた課題を拾う
 * - クリア済みの課題は知らせない(できたものを毎朝せっつかない)
 * - 1 人 1 通にまとめる。件数と、いちばん近い期限だけを書く
 *
 * Workers Free は 1 回の実行で**サブリクエスト 50 まで**(D1 のクエリも送信の fetch も
 * 1 つずつ数える、COST.md §1.1)。ここは D1 を 6 回までにし、送信は 40 通で打ち切る。
 * 打ち切りが続くようなら COST.md の見直しが要るので、その日は警告だけ残す。
 */

/** 通知の Cron(UTC 00:00 = JST 09:00)。wrangler.jsonc の triggers と合わせる */
export const REMINDER_CRON = "0 0 * * *";
export const REMINDER_WINDOW_DAYS = 3;
export const MAX_PUSHES_PER_RUN = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderResult = {
  /** 送れた通知の数 */
  sent: number;
  /** 無効になっていて消した購読の数 */
  removed: number;
  /** プッシュサービスが受け取らなかった数(一時的な失敗) */
  failed: number;
  /** 上限で送れなかった通知の数 */
  truncated: number;
};

type Item = { orgId: string; problemRef: string; kind: "official" | "posted"; dueAt: Date | null };

export async function sendDueReminders(env: Env, now: Date = new Date()): Promise<ReminderResult> {
  const empty: ReminderResult = { sent: 0, removed: 0, failed: 0, truncated: 0 };
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return empty;

  const db = drizzle(env.DB);
  // (1) 購読。誰も購読していなければ、課題を読む必要も無い。
  // 上限で送れなかった人が翌日も同じにならないよう、最後に送った時刻が古い順(S-054)
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .orderBy(sql`${pushSubscriptions.lastUsedAt} is not null`, asc(pushSubscriptions.lastUsedAt))
    .limit(500);
  if (subs.length === 0) return empty;
  const subscribedUsers = new Set(subs.map((s) => s.userId));

  // (2) 対象の課題: 期限が近い、または新しく割り当てられた
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS);
  const since = new Date(now.getTime() - DAY_MS);
  const rows = await db
    .select()
    .from(assignments)
    .where(
      or(
        and(gte(assignments.dueAt, now), lte(assignments.dueAt, windowEnd)),
        gte(assignments.createdAt, since),
      ),
    )
    .limit(500);
  if (rows.length === 0) return empty;

  // (3) 全員宛の課題は、組織のメンバーに展開する
  const orgIds = [...new Set(rows.filter((r) => r.userId === null).map((r) => r.orgId))];
  const members =
    orgIds.length > 0
      ? await db
          .select({ orgId: orgMembers.orgId, userId: orgMembers.userId })
          .from(orgMembers)
          .where(inArray(orgMembers.orgId, orgIds))
          .limit(2000)
      : [];
  const membersByOrg = new Map<string, string[]>();
  for (const m of members) {
    const list = membersByOrg.get(m.orgId) ?? [];
    list.push(m.userId);
    membersByOrg.set(m.orgId, list);
  }

  const itemsByUser = new Map<string, Item[]>();
  const add = (userId: string, row: (typeof rows)[number]) => {
    if (!subscribedUsers.has(userId)) return;
    const list = itemsByUser.get(userId) ?? [];
    list.push({ orgId: row.orgId, problemRef: row.problemRef, kind: row.kind, dueAt: row.dueAt });
    itemsByUser.set(userId, list);
  };
  for (const row of rows) {
    if (row.userId) add(row.userId, row);
    else for (const userId of membersByOrg.get(row.orgId) ?? []) add(userId, row);
  }
  if (itemsByUser.size === 0) return empty;

  // (4)(5) クリア済みを除く。公式問題は progress、投稿問題は posted_attempts
  const officialRefs = [
    ...new Set(rows.filter((r) => r.kind === "official").map((r) => r.problemRef)),
  ];
  const postedRefs = [...new Set(rows.filter((r) => r.kind === "posted").map((r) => r.problemRef))];
  // ユーザーと課題の id は SQL に並べない(D1 の 100 パラメータ制限、S-054)。
  // 購読している人 × 課題になっている問題、で引いてから JS で対象の組み合わせに絞る
  const subscribers = db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  const refsOf = (kind: "official" | "posted") =>
    db.select({ ref: assignments.problemRef }).from(assignments).where(eq(assignments.kind, kind));
  const cleared = new Set<string>();
  if (officialRefs.length > 0) {
    const done = await db
      .select({ userId: progress.userId, problemId: progress.problemId })
      .from(progress)
      .where(
        and(
          inArray(progress.userId, subscribers),
          inArray(progress.problemId, refsOf("official")),
          isNotNull(progress.clearedAt),
        ),
      )
      .limit(2000);
    for (const d of done) cleared.add(`${d.userId}:official:${d.problemId}`);
  }
  if (postedRefs.length > 0) {
    const done = await db
      .select({ userId: postedAttempts.userId, problemId: postedAttempts.problemId })
      .from(postedAttempts)
      .where(
        and(
          inArray(postedAttempts.userId, subscribers),
          inArray(postedAttempts.problemId, refsOf("posted")),
          isNotNull(postedAttempts.clearedAt),
        ),
      )
      .limit(2000);
    for (const d of done) cleared.add(`${d.userId}:posted:${d.problemId}`);
  }

  // 1 人 1 通にまとめて送る
  const subject = env.BETTER_AUTH_URL;
  const keys = { publicKey, privateKey };
  const result: ReminderResult = { sent: 0, removed: 0, failed: 0, truncated: 0 };
  const gone: string[] = [];
  const used: string[] = [];
  let budget = MAX_PUSHES_PER_RUN;
  for (const [userId, items] of itemsByUser) {
    const pending = items.filter((i) => !cleared.has(`${userId}:${i.kind}:${i.problemRef}`));
    const message = composeMessage(pending, now);
    if (!message) continue;
    for (const sub of subs.filter((s) => s.userId === userId)) {
      if (budget <= 0) {
        result.truncated++;
        continue;
      }
      budget--;
      const r = await sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        keys,
        subject,
      ).catch(() => ({ ok: false, status: 0, gone: false }));
      if (r.ok) {
        result.sent++;
        used.push(sub.id);
      } else if (r.gone) gone.push(sub.id);
      else result.failed++;
    }
  }

  // (6) 無効になった購読を消し、送れた購読に時刻を残す(次回は送れていない人から)
  if (gone.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    result.removed = gone.length;
  }
  if (used.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastUsedAt: now })
      .where(inArray(pushSubscriptions.id, used));
  }
  if (result.truncated > 0) {
    console.warn(`assignment reminders hit the per-run limit (${result.truncated} skipped)`);
  }
  return result;
}

/** 通知の文面。知らせるものが無ければ undefined */
export function composeMessage(items: readonly Item[], now: Date): PushMessage | undefined {
  if (items.length === 0) return undefined;
  const windowEnd = now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS;
  const dueSoon = items.filter(
    (i) => i.dueAt && i.dueAt.getTime() >= now.getTime() && i.dueAt.getTime() <= windowEnd,
  );
  const fresh = items.filter((i) => !dueSoon.includes(i));
  const parts: string[] = [];
  if (dueSoon.length > 0) {
    const nearest = Math.min(...dueSoon.map((i) => (i.dueAt as Date).getTime()));
    parts.push(`期限が近い課題が ${dueSoon.length} 件(いちばん近いのは${dayLabel(nearest, now)})`);
  }
  if (fresh.length > 0) parts.push(`新しい課題が ${fresh.length} 件`);
  const orgIds = new Set(items.map((i) => i.orgId));
  const [only] = orgIds;
  return {
    title: "ラダー道場",
    body: `${parts.join("、")}あります。`,
    url: orgIds.size === 1 && only ? `/orgs/${only}` : "/orgs",
    tag: "assignments",
  };
}

/** 「今日」「明日」「3 日後」。日付は JST で数える */
function dayLabel(dueMs: number, now: Date): string {
  const jstDay = (ms: number) => Math.floor((ms + 9 * 60 * 60 * 1000) / DAY_MS);
  const days = jstDay(dueMs) - jstDay(now.getTime());
  if (days <= 0) return "今日";
  if (days === 1) return "明日";
  return `${days} 日後`;
}

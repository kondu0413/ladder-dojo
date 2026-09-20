import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import {
  assignments,
  orgInvites,
  orgMembers,
  orgs,
  type postedAttempts,
  postedProblems,
  progress,
  submissions,
  user,
} from "../db/schema.js";
import type { AssignmentDto, MatrixDto } from "../dto.js";
import type { AppBindings } from "../env.js";
import { newId } from "../lib/util.js";
import { requireUser } from "../middleware/auth.js";
import { isOrgMember, requireOrgAdmin, requireOrgMember } from "../middleware/org.js";

/** 招待コードの既定の有効期間 */
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** 1 ユーザーが所属できる組織数 */
const MAX_ORGS_PER_USER = 20;
const MAX_MEMBERS = 500;

const createSchema = z.object({ name: z.string().min(1).max(60) });
const joinSchema = z.object({ code: z.string().min(6).max(64) });
const roleSchema = z.object({ role: z.enum(["admin", "member"]) });
const assignSchema = z.object({
  kind: z.enum(["official", "posted"]),
  problemRef: z.string().min(1).max(64),
  /** 省略すると組織全員への割り当て */
  userId: z.string().max(64).optional(),
  note: z.string().max(200).optional(),
  dueAt: z.string().datetime().optional(),
});

/**
 * 組織と管理者ビュー(SPEC.md §3.8)。
 *
 * 権限は `requireOrgMember` / `requireOrgAdmin` に集約する(DECISIONS.md D-017 方針 4)。
 * 管理者が見られるのは「自分が管理者である組織のメンバー」のデータだけ(方針 6)。
 * 組織横断の一覧 API は作らない。
 */
/** 一度に返す課題の数。達成率の集計で読む行数を抑えるため */
const MAX_ASSIGNMENTS = 100;

/**
 * 表に出すメンバーの上限。1 回の表示で読む D1 の行数を抑えるため(COST.md §1.2)。
 * これを超える規模の組織は、そもそも 1 枚の表では読めない
 */
const MAX_MATRIX_MEMBERS = 50;
/** 1 回の表示で読む進捗の行数の上限 */
const MAX_MATRIX_CELLS = 2000;

export const orgRoutes = new Hono<AppBindings>()
  .use("*", requireUser)
  /** 自分が所属する組織 */
  .get("/", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: orgs.id,
        name: orgs.name,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
      })
      .from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, c.var.user.id))
      .limit(MAX_ORGS_PER_USER);
    return c.json({
      orgs: rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        joinedAt: r.joinedAt.toISOString(),
      })),
    });
  })
  /** 組織を作る。作った人が管理者になる */
  .post("/", async (c) => {
    const body = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const mine = await db.$count(orgMembers, eq(orgMembers.userId, c.var.user.id));
    if (mine >= MAX_ORGS_PER_USER) return c.json({ error: "quota_exceeded" } as const, 409);

    const now = new Date();
    const id = newId();
    await db.batch([
      db
        .insert(orgs)
        .values({ id, name: body.data.name, createdBy: c.var.user.id, createdAt: now }),
      db
        .insert(orgMembers)
        .values({ orgId: id, userId: c.var.user.id, role: "admin", joinedAt: now }),
    ]);
    return c.json({ org: { id, name: body.data.name, role: "admin" as const } }, 201);
  })
  /** 招待コードで参加する */
  .post("/join", async (c) => {
    const body = joinSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const invite = await db
      .select()
      .from(orgInvites)
      .where(eq(orgInvites.code, body.data.code))
      .get();
    const now = new Date();
    if (!invite || invite.expiresAt < now || invite.uses >= invite.maxUses) {
      return c.json({ error: "not_found" } as const, 404);
    }

    const already = await isOrgMember(c.env.DB, invite.orgId, c.var.user.id);
    const org = await db.select().from(orgs).where(eq(orgs.id, invite.orgId)).get();
    if (!org) return c.json({ error: "not_found" } as const, 404);
    if (already) {
      return c.json({
        org: { id: org.id, name: org.name, role: "member" as const },
        joined: false,
      });
    }

    const count = await db.$count(orgMembers, eq(orgMembers.orgId, invite.orgId));
    if (count >= MAX_MEMBERS) return c.json({ error: "quota_exceeded" } as const, 409);
    // 参加する側の上限も見る(作るときだけ見ていた、S-054)
    const mine = await db.$count(orgMembers, eq(orgMembers.userId, c.var.user.id));
    if (mine >= MAX_ORGS_PER_USER) return c.json({ error: "quota_exceeded" } as const, 409);

    await db.batch([
      db
        .insert(orgMembers)
        .values({ orgId: invite.orgId, userId: c.var.user.id, role: "member", joinedAt: now }),
      db
        .update(orgInvites)
        .set({ uses: sql`${orgInvites.uses} + 1` })
        .where(eq(orgInvites.code, invite.code)),
    ]);
    return c.json({ org: { id: org.id, name: org.name, role: "member" as const }, joined: true });
  })
  /** 組織の概要。メンバー一覧は管理者だけが見られる */
  .get("/:orgId", requireOrgMember, async (c) => {
    const db = drizzle(c.env.DB);
    const org = await db.select().from(orgs).where(eq(orgs.id, c.var.membership.orgId)).get();
    if (!org) return c.json({ error: "not_found" } as const, 404);

    const isAdmin = c.var.membership.role === "admin";
    const members = isAdmin ? await listMembers(db, org.id) : [];
    return c.json({
      org: {
        id: org.id,
        name: org.name,
        role: c.var.membership.role,
        createdAt: org.createdAt.toISOString(),
      },
      members,
    });
  })
  /** 招待コードを発行する(管理者のみ) */
  .post("/:orgId/invites", requireOrgAdmin, async (c) => {
    const db = drizzle(c.env.DB);
    const code = newId().replace(/-/g, "").slice(0, 12);
    const now = new Date();
    await db.insert(orgInvites).values({
      code,
      orgId: c.var.membership.orgId,
      createdBy: c.var.user.id,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    });
    return c.json(
      { invite: { code, expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString() } },
      201,
    );
  })
  /** メンバーの権限を変える(管理者のみ)。最後の管理者は降格できない */
  .put("/:orgId/members/:userId/role", requireOrgAdmin, async (c) => {
    const body = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const db = drizzle(c.env.DB);
    const orgId = c.var.membership.orgId;
    const targetId = c.req.param("userId");
    if (!(await isOrgMember(c.env.DB, orgId, targetId))) {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (body.data.role === "member" && !(await hasOtherAdmin(db, orgId, targetId))) {
      return c.json({ error: "last_admin" as const }, 409);
    }
    await db
      .update(orgMembers)
      .set({ role: body.data.role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetId)));
    return c.json({ updated: true as const });
  })
  /** メンバーを外す。管理者は誰でも、メンバーは自分だけ */
  .delete("/:orgId/members/:userId", requireOrgMember, async (c) => {
    const db = drizzle(c.env.DB);
    const orgId = c.var.membership.orgId;
    const targetId = c.req.param("userId");
    const isSelf = targetId === c.var.user.id;
    if (!isSelf && c.var.membership.role !== "admin") {
      return c.json({ error: "forbidden" } as const, 403);
    }
    if (!(await isOrgMember(c.env.DB, orgId, targetId))) {
      return c.json({ error: "not_found" } as const, 404);
    }
    if (!(await hasOtherAdmin(db, orgId, targetId))) {
      return c.json({ error: "last_admin" as const }, 409);
    }
    // 個人あての課題も消す。残すと通知が届き続け、管理者の集計にも数えられる(S-054)
    await db.batch([
      db
        .delete(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetId))),
      db
        .delete(assignments)
        .where(and(eq(assignments.orgId, orgId), eq(assignments.userId, targetId))),
    ]);
    return c.json({ removed: true as const });
  })
  /** メンバーの進捗(管理者のみ、§3.8) */
  .get("/:orgId/members/:userId/progress", requireOrgAdmin, async (c) => {
    const db = drizzle(c.env.DB);
    const orgId = c.var.membership.orgId;
    const targetId = c.req.param("userId");
    // 自分が管理者である組織のメンバーのデータだけ(D-017 方針 6)
    if (!(await isOrgMember(c.env.DB, orgId, targetId))) {
      return c.json({ error: "not_found" } as const, 404);
    }
    const rows = await db.select().from(progress).where(eq(progress.userId, targetId)).limit(500);
    return c.json({
      progress: rows.map((r) => ({
        problemId: r.problemId,
        attempts: r.attempts,
        failures: r.failures,
        clearedAt: r.clearedAt?.toISOString() ?? null,
        lastAttemptAt: r.lastAttemptAt.toISOString(),
      })),
    });
  })
  /** メンバーの提出履歴(管理者のみ、§3.8) */
  .get("/:orgId/members/:userId/submissions", requireOrgAdmin, async (c) => {
    const db = drizzle(c.env.DB);
    const orgId = c.var.membership.orgId;
    const targetId = c.req.param("userId");
    if (!(await isOrgMember(c.env.DB, orgId, targetId))) {
      return c.json({ error: "not_found" } as const, 404);
    }
    const problemId = c.req.query("problemId");
    const where = problemId
      ? and(eq(submissions.userId, targetId), eq(submissions.problemId, problemId))
      : eq(submissions.userId, targetId);
    const rows = await db
      .select()
      .from(submissions)
      .where(where)
      .orderBy(desc(submissions.createdAt))
      .limit(50);
    return c.json({
      submissions: rows.map((r) => ({
        id: r.id,
        problemId: r.problemId,
        circuit: JSON.parse(r.circuitJson) as unknown,
        passed: r.passed,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  })
  /** つまずき箇所(失敗が多い / 未クリアで止まっている問題)を組織でまとめる(§3.8) */
  .get("/:orgId/stuck", requireOrgAdmin, async (c) => {
    const db = drizzle(c.env.DB);
    const orgId = c.var.membership.orgId;
    // メンバーの id を並べず副問い合わせで絞る(D1 の 100 パラメータ制限、S-054)
    const rows = await db
      .select({
        problemId: progress.problemId,
        userId: progress.userId,
        failures: progress.failures,
        clearedAt: progress.clearedAt,
      })
      .from(progress)
      .where(and(inArray(progress.userId, memberIdsOf(db, orgId)), isNull(progress.clearedAt)))
      .limit(2000);

    const byProblem = new Map<string, { stuckUsers: number; failures: number }>();
    for (const row of rows) {
      const cur = byProblem.get(row.problemId) ?? { stuckUsers: 0, failures: 0 };
      cur.stuckUsers += 1;
      cur.failures += row.failures;
      byProblem.set(row.problemId, cur);
    }
    const stuck = [...byProblem.entries()]
      .map(([problemId, v]) => ({ problemId, ...v }))
      .sort((a, b) => b.stuckUsers - a.stuckUsers || b.failures - a.failures)
      .slice(0, 50);
    const memberCount = await db.$count(orgMembers, eq(orgMembers.orgId, orgId));
    return c.json({ stuck, memberCount });
  })
  /**
   * クラス全体の進捗(管理者のみ、§3.8)。
   *
   * メンバー × 問題の表を作るための素。1 人ずつ開かなくても一望できる。
   * 返すのは「クリアしたか / 挑戦したか / 失敗回数」だけ。回路や日時は出さない
   * (一望するのに要らないし、行が重くなる)。
   *
   * D1 の読み取り行数に注意(COST.md §1.2)。メンバー数 × 触った問題数だけ読むので、
   * 人数に上限を設けて、1 回の表示で読む行数が青天井にならないようにしている。
   */
  .get("/:orgId/matrix", requireOrgAdmin, async (c) => {
    const db = drizzle(c.env.DB);
    const members = (await listMembers(db, c.var.membership.orgId)).slice(0, MAX_MATRIX_MEMBERS);
    if (members.length === 0) {
      return c.json({ members: [], cells: [], truncated: false } as MatrixDto);
    }
    const memberIds = members.map((m) => m.userId);

    const rows = await db
      .select({
        userId: progress.userId,
        problemId: progress.problemId,
        clearedAt: progress.clearedAt,
        failures: progress.failures,
      })
      .from(progress)
      .where(inArray(progress.userId, memberIds))
      .limit(MAX_MATRIX_CELLS);

    const dto: MatrixDto = {
      members: members.map((m) => ({ userId: m.userId, name: m.name, role: m.role })),
      cells: rows.map((r) => ({
        userId: r.userId,
        problemId: r.problemId,
        cleared: r.clearedAt !== null,
        failures: r.failures,
      })),
      truncated: rows.length >= MAX_MATRIX_CELLS,
    };
    return c.json(dto);
  })
  /** 課題を割り当てる(管理者のみ、§3.8) */
  .post("/:orgId/assignments", requireOrgAdmin, async (c) => {
    const body = assignSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" } as const, 400);

    const orgId = c.var.membership.orgId;
    if (body.data.userId && !(await isOrgMember(c.env.DB, orgId, body.data.userId))) {
      return c.json({ error: "not_found" } as const, 404);
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .insert(assignments)
      .values({
        id: newId(),
        orgId,
        kind: body.data.kind,
        problemRef: body.data.problemRef,
        userId: body.data.userId ?? null,
        note: body.data.note ?? null,
        dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null,
        createdBy: c.var.user.id,
        createdAt: new Date(),
      })
      .returning()
      .get();
    return c.json({ assignment: toAssignment(row) }, 201);
  })
  /** 割り当てられた課題。メンバーは自分宛と全員宛、管理者は組織のすべて */
  .get("/:orgId/assignments", requireOrgMember, async (c) => {
    const db = drizzle(c.env.DB);
    const orgId = c.var.membership.orgId;
    const mineOnly = and(
      eq(assignments.orgId, orgId),
      or(isNull(assignments.userId), eq(assignments.userId, c.var.user.id)),
    );
    const isAdmin = c.var.membership.role === "admin";
    const where = isAdmin ? eq(assignments.orgId, orgId) : mineOnly;
    const rows = await db
      .select()
      .from(assignments)
      .where(where)
      .orderBy(desc(assignments.createdAt))
      .limit(MAX_ASSIGNMENTS);

    const dtos = rows.map(toAssignment);
    // 達成率は管理者だけに出す。メンバーには自分の課題しか見えないので、
    // 「何人できたか」を見せても意味がないうえ、他人の状況が透けてしまう
    if (isAdmin && dtos.length > 0) {
      await attachProgress(db, orgId, dtos);
    }
    return c.json({ assignments: dtos });
  })
  .delete("/:orgId/assignments/:assignmentId", requireOrgAdmin, async (c) => {
    const db = drizzle(c.env.DB);
    const row = await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.orgId, c.var.membership.orgId),
          eq(assignments.id, c.req.param("assignmentId")),
        ),
      )
      .returning()
      .get();
    if (!row) return c.json({ error: "not_found" } as const, 404);
    return c.json({ deleted: true as const });
  })
  /** 組織限定で公開された投稿問題(§3.8) */
  .get("/:orgId/problems", requireOrgMember, async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: postedProblems.id,
        title: postedProblems.title,
        difficulty: postedProblems.difficulty,
        clears: postedProblems.clearsCount,
        attempts: postedProblems.attemptsCount,
      })
      .from(postedProblems)
      .where(
        and(
          eq(postedProblems.orgId, c.var.membership.orgId),
          eq(postedProblems.visibility, "org"),
          eq(postedProblems.hidden, false),
        ),
      )
      .orderBy(desc(postedProblems.createdAt))
      .limit(100);
    return c.json({ problems: rows });
  });

// ---------------------------------------------------------------------------

type Db = ReturnType<typeof drizzle>;

/** 組織のメンバーの id(副問い合わせ)。id を並べると D1 の 100 パラメータ制限に当たる(S-054) */
function memberIdsOf(db: Db, orgId: string) {
  return db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId));
}

async function listMembers(db: Db, orgId: string) {
  const rows = await db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      joinedAt: orgMembers.joinedAt,
      name: user.name,
      email: user.email,
    })
    .from(orgMembers)
    .innerJoin(user, eq(user.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .limit(MAX_MEMBERS);
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
  }));
}

/** target 以外に管理者がいるか(最後の 1 人を降格・脱退させないため) */
async function hasOtherAdmin(db: Db, orgId: string, targetId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin")))
    .limit(5);
  return rows.some((r) => r.userId !== targetId);
}

/**
 * 課題ごとの達成状況(改善候補 9)を詰める。
 *
 * 1 件ずつ数えると課題の数だけクエリが飛ぶ(D1 は 1 リクエスト 50 クエリまで、
 * COST.md §1.2)ので、メンバーと問題をまとめて 1 回で読んでから JS で数える。
 * 読む行数は メンバー数 × 課題に出てくる問題数 が上限。
 */
async function attachProgress(
  db: ReturnType<typeof drizzle>,
  orgId: string,
  dtos: AssignmentDto[],
): Promise<void> {
  const members = await listMembers(db, orgId);
  if (members.length === 0 || dtos.length === 0) return;
  const memberIds = members.map((m) => m.userId);

  // メンバーと課題の id を並べず、副問い合わせで絞る(D1 の 100 パラメータ制限、S-054)
  const rows = await db
    .select({
      userId: progress.userId,
      problemId: progress.problemId,
      clearedAt: progress.clearedAt,
    })
    .from(progress)
    .where(
      and(
        inArray(progress.userId, memberIdsOf(db, orgId)),
        inArray(
          progress.problemId,
          db
            .select({ ref: assignments.problemRef })
            .from(assignments)
            .where(eq(assignments.orgId, orgId)),
        ),
      ),
    )
    .limit(MAX_MATRIX_CELLS);

  /** 問題 ID → (ユーザー ID → クリアしたか) */
  const byProblem = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    const m = byProblem.get(row.problemId) ?? new Map<string, boolean>();
    m.set(row.userId, row.clearedAt !== null);
    byProblem.set(row.problemId, m);
  }

  for (const dto of dtos) {
    // 個人宛ならその 1 人、全員宛なら組織のメンバー全員が対象
    const targets = dto.userId ? [dto.userId] : memberIds;
    const seen = byProblem.get(dto.problemRef);
    let cleared = 0;
    let attempting = 0;
    for (const userId of targets) {
      const state = seen?.get(userId);
      if (state === true) cleared += 1;
      else if (state === false) attempting += 1;
    }
    dto.stats = {
      total: targets.length,
      cleared,
      attempting,
      untouched: targets.length - cleared - attempting,
    };
  }
}

function toAssignment(row: typeof assignments.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    problemRef: row.problemRef,
    userId: row.userId,
    note: row.note,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 投稿問題の挑戦状況(管理者ビューで使う予定。いまは型の参照のみ) */
export type PostedAttemptRow = typeof postedAttempts.$inferSelect;

import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * D1 のスキーマ(DECISIONS.md D-018)。
 *
 * - `user` / `session` / `account` / `verification` は Better Auth が使うテーブル。
 *   プロパティ名と列名は Better Auth のフィールド名(camelCase)に合わせる。Drizzle アダプタが
 *   `schema[model][field]` で参照するため、ここを snake_case にすると動かない
 * - アプリ側のテーブルは snake_case。D1 は読み取り「行数」課金なので、すべて user_id 先頭の
 *   複合インデックスを張ってテーブルスキャンを避ける
 */

// ---------------------------------------------------------------------------
// Better Auth
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// アプリ(フェーズ1)
// ---------------------------------------------------------------------------

/** 問題ごとの進捗(SPEC.md §3.5)。1 ユーザー 1 問題につき 1 行 */
export const progress = sqliteTable(
  "progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    problemId: text("problem_id").notNull(),
    clearedAt: integer("cleared_at", { mode: "timestamp_ms" }),
    attempts: integer("attempts").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.problemId] })],
);

/** 提出した回路の履歴(SPEC.md §3.5、保持上限は S-003) */
export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    problemId: text("problem_id").notNull(),
    circuitJson: text("circuit_json").notNull(),
    /** 同一回路の重複保存を避けるための正規化 JSON のハッシュ(S-003) */
    circuitHash: text("circuit_hash").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("submissions_user_problem_idx").on(t.userId, t.problemId, t.createdAt),
    index("submissions_user_problem_hash_idx").on(t.userId, t.problemId, t.circuitHash),
  ],
);

/** サンドボックスの保存回路(SPEC.md §3.4) */
export const sandboxCircuits = sqliteTable(
  "sandbox_circuits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    circuitJson: text("circuit_json").notNull(),
    /** 自分で付けたテストケース(§3.4)。未設定なら空配列の JSON */
    testCasesJson: text("test_cases_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("sandbox_user_updated_idx").on(t.userId, t.updatedAt)],
);

/** 連続学習日数の材料(SPEC.md §3.7)。日付は JST で切る(S-001) */
export const activityDays = sqliteTable(
  "activity_days",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `YYYY-MM-DD`(JST) */
    dateJst: text("date_jst").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dateJst] })],
);

export const schema = {
  user,
  session,
  account,
  verification,
  progress,
  submissions,
  sandboxCircuits,
  activityDays,
};

/** `sql` を import 済みであることを型レベルで保つためのダミー(drizzle-kit の解析用) */
export const nowMs = sql`(unixepoch() * 1000)`;

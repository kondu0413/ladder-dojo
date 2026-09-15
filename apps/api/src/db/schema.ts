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

// ---------------------------------------------------------------------------
// 投稿問題(フェーズ2、SPEC.md §3.6)
// ---------------------------------------------------------------------------

/**
 * ユーザーが投稿した問題。
 * 件数(いいね・挑戦者・クリア者・通報)は集計列で持つ。D1 は読み取り「行数」課金なので
 * `COUNT(*)` を避ける(DECISIONS.md D-018)。
 */
export const postedProblems = sqliteTable(
  "posted_problems",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    spec: text("spec").notNull(),
    /** 模範解答(投稿者の回路)。クリアするまで他人には返さない */
    circuitJson: text("circuit_json").notNull(),
    testCasesJson: text("test_cases_json").notNull(),
    /** 投稿者の申告(1〜5)。表示は投票の平均と併記する */
    difficulty: integer("difficulty").notNull(),
    tagsJson: text("tags_json").notNull().default("[]"),
    /** public = 全体公開 / private = 本人のみ(org はフェーズ3で追加) */
    visibility: text("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("public"),
    likesCount: integer("likes_count").notNull().default(0),
    attemptsCount: integer("attempts_count").notNull().default(0),
    clearsCount: integer("clears_count").notNull().default(0),
    reportsCount: integer("reports_count").notNull().default(0),
    difficultyVotesCount: integer("difficulty_votes_count").notNull().default(0),
    difficultyVotesSum: integer("difficulty_votes_sum").notNull().default(0),
    /** 通報による非表示。一覧にも取得にも出さない(D-017 方針 5) */
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    // 一覧の並び順ごとにインデックスを張り、テーブルスキャンを避ける
    index("posted_visible_new_idx").on(t.hidden, t.visibility, t.createdAt),
    index("posted_visible_likes_idx").on(t.hidden, t.visibility, t.likesCount),
    index("posted_visible_difficulty_idx").on(t.hidden, t.visibility, t.difficulty),
    index("posted_author_idx").on(t.authorId, t.createdAt),
  ],
);

/** いいね(SPEC.md §3.6)。1 ユーザー 1 回 */
export const problemLikes = sqliteTable(
  "problem_likes",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => postedProblems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.problemId, t.userId] })],
);

/** 難易度投票(1〜5)。1 ユーザー 1 票、変更可 */
export const problemDifficultyVotes = sqliteTable(
  "problem_difficulty_votes",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => postedProblems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    difficulty: integer("difficulty").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.problemId, t.userId] })],
);

/** 通報。一定数で自動的に非表示にする(§3.6: 自動チェック + 通報の事後対応) */
export const problemReports = sqliteTable(
  "problem_reports",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => postedProblems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.problemId, t.userId] })],
);

/** 投稿問題への挑戦。クリア率の分母・分子をユーザー単位で数えるために持つ */
export const postedAttempts = sqliteTable(
  "posted_attempts",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => postedProblems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    clearedAt: integer("cleared_at", { mode: "timestamp_ms" }),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.userId] }),
    index("posted_attempts_user_idx").on(t.userId, t.lastAttemptAt),
  ],
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
  postedProblems,
  problemLikes,
  problemDifficultyVotes,
  problemReports,
  postedAttempts,
};

/** `sql` を import 済みであることを型レベルで保つためのダミー(drizzle-kit の解析用) */
export const nowMs = sql`(unixepoch() * 1000)`;

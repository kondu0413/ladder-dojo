/**
 * API のレスポンス型(`apps/web` と共有する)。
 *
 * **このファイルは Cloudflare Workers の型(D1Database など)に依存してはいけない。**
 * ブラウザ側から型だけを import するため、Workers のグローバル型を持ち込むと
 * DOM の型(Response / Request など)と衝突する。素の TypeScript の型だけを置く。
 */

export type MeDto = {
  user: { id: string; name: string; email: string; image: string | null } | null;
};

export type ProgressDto = {
  problemId: string;
  attempts: number;
  failures: number;
  /** ISO 8601。未クリアなら null */
  clearedAt: string | null;
  lastAttemptAt: string;
};

export type ProgressListDto = { progress: ProgressDto[] };
export type ProgressMergeDto = { merged: number; progress: ProgressDto[] };
export type ProgressOneDto = { progress: ProgressDto };

export type SandboxSummaryDto = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SandboxDto = SandboxSummaryDto & {
  /** 回路 JSON(core の Circuit)。型は core 側で検証する */
  circuit: unknown;
  /** テストケース JSON(core の TestCase[]) */
  testCases: unknown;
};

export type SandboxListDto = { circuits: SandboxSummaryDto[] };
export type SandboxOneDto = { circuit: SandboxDto };

export type SubmissionDto = {
  id: string;
  problemId: string;
  circuit: unknown;
  passed: boolean;
  createdAt: string;
};

export type SubmissionListDto = { submissions: SubmissionDto[] };

/** 「みんながつまずくところ」。個人は出さず、人数だけ */
export type MistakeDto = {
  /** core の DIAGNOSIS_IDS のいずれか */
  diagnosisId: string;
  users: number;
};

export type MistakeListDto = {
  problemId: string;
  /** この人数に達していない種類は返していない */
  minUsers: number;
  mistakes: MistakeDto[];
};
export type SubmissionOneDto = { submission: SubmissionDto; deduplicated: boolean };

export type ApiErrorDto = {
  error:
    | "unauthorized"
    | "not_found"
    | "invalid_body"
    | "too_large"
    | "quota_exceeded"
    | "push_unavailable"
    | "internal_error";
};

// ---------------------------------------------------------------------------
// Web Push(S-045)
// ---------------------------------------------------------------------------

/** VAPID の公開鍵(base64url)。鍵が登録されていない環境では null */
export type PushPublicKeyDto = { publicKey: string | null };
export type PushSubscriptionListDto = { endpoints: string[] };
export type PushTestDto = { sent: number; removed: number };

// ---------------------------------------------------------------------------
// 投稿問題(フェーズ2、SPEC.md §3.6)
// ---------------------------------------------------------------------------

export type PostedProblemSummaryDto = {
  id: string;
  title: string;
  spec: string;
  /** 投稿者の申告(1〜5) */
  difficulty: number;
  /** 投票の平均(小数第 1 位)。票がなければ null */
  votedDifficulty: number | null;
  difficultyVotes: number;
  tags: string[];
  visibility: "public" | "org" | "private";
  /** visibility が "org" のときの対象組織 */
  orgId: string | null;
  likes: number;
  /** 挑戦した人数 */
  attempts: number;
  /** クリアした人数 */
  clears: number;
  /** クリア率(%)。挑戦者がいなければ null */
  clearRate: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PostedProblemDetailDto = PostedProblemSummaryDto & {
  /** テストケース JSON(core の TestCase[]) */
  testCases: unknown;
  /** 模範解答。投稿者本人かクリア済みの人にだけ入る。それ以外は null */
  solution: unknown | null;
  isAuthor: boolean;
  cleared: boolean;
  liked: boolean;
  myDifficulty: number | null;
};

export type PostedProblemListDto = {
  problems: PostedProblemSummaryDto[];
  nextCursor: string | null;
};
export type PostedProblemOneDto = { problem: PostedProblemSummaryDto };
export type PostedProblemDetailResponseDto = { problem: PostedProblemDetailDto };
/** 投稿時に模範解答がテストを通らなかった場合(422) */
export type SolutionFailedDto = {
  error: "solution_failed";
  failures: Array<{
    caseId: string;
    title: string;
    /** mismatch = 期待と違う / unstable = 発振して収束しない / limit = 重すぎて打ち切った */
    kind: "mismatch" | "unstable" | "limit";
  }>;
};

// ---------------------------------------------------------------------------
// 組織とランキング(フェーズ3、SPEC.md §3.7 / §3.8)
// ---------------------------------------------------------------------------

export type OrgRole = "admin" | "member";

/** クラス全体の進捗(§3.8)。メンバー × 問題の表を描くための素 */
export type MatrixMemberDto = {
  userId: string;
  name: string;
  role: OrgRole;
};

export type MatrixCellDto = {
  userId: string;
  problemId: string;
  cleared: boolean;
  failures: number;
};

export type MatrixDto = {
  members: MatrixMemberDto[];
  cells: MatrixCellDto[];
  /** 上限に当たって一部しか返していない */
  truncated: boolean;
};

export type OrgSummaryDto = {
  id: string;
  name: string;
  role: OrgRole;
  joinedAt?: string;
};

export type OrgMemberDto = {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
};

export type OrgListDto = { orgs: OrgSummaryDto[] };
export type OrgDetailDto = {
  org: { id: string; name: string; role: OrgRole; createdAt: string };
  /** 管理者のときだけ中身が入る */
  members: OrgMemberDto[];
};
export type OrgInviteDto = { invite: { code: string; expiresAt: string } };

export type AssignmentDto = {
  id: string;
  kind: "official" | "posted";
  problemRef: string;
  /** null = 組織全員への割り当て */
  userId: string | null;
  note: string | null;
  dueAt: string | null;
  createdAt: string;
  /**
   * 達成状況(改善候補 9)。**管理者にだけ入る。**
   * メンバーには自分の課題しか見えないので、何人できたかを見せても意味がなく、
   * 他人の状況が透けてしまう
   */
  stats?: AssignmentStatsDto;
};

export type AssignmentStatsDto = {
  /** 対象の人数。個人宛なら 1、全員宛なら組織のメンバー数 */
  total: number;
  cleared: number;
  /** 挑戦したがまだクリアしていない */
  attempting: number;
  untouched: number;
};
export type AssignmentListDto = { assignments: AssignmentDto[] };

export type StuckDto = {
  stuck: Array<{ problemId: string; stuckUsers: number; failures: number }>;
  memberCount: number;
};

export type RankingMetric = "solved" | "authored_solved" | "authored_likes" | "streak";
export type RankingPeriod = "weekly" | "monthly" | "all";

export type RankingDto = {
  period: RankingPeriod;
  metric: RankingMetric;
  orgId: string | null;
  entries: Array<{ rank: number; userId: string; userName: string; value: number }>;
  /** この順位を計算した時刻 */
  computedAt: string;
  /** true = その場で計算(組織内)、false = 1 日 1 回のスナップショット(全体) */
  live: boolean;
  /**
   * ログイン中の本人の**いまの値**(全体ランキングのときだけ。未ログインなら null)。
   *
   * スナップショットは 1 日 1 回なので、クリア直後は一覧に載らない。
   * 記録されていないように見えるのを防ぐために別に返す(S-026)
   */
  me?: { userId: string; userName: string; value: number } | null;
};

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
export type SubmissionOneDto = { submission: SubmissionDto; deduplicated: boolean };

export type ApiErrorDto = {
  error:
    | "unauthorized"
    | "not_found"
    | "invalid_body"
    | "too_large"
    | "quota_exceeded"
    | "internal_error";
};

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
  visibility: "public" | "private";
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

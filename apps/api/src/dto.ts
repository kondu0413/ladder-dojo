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

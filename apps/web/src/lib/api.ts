import type {
  ApiErrorDto,
  MeDto,
  ProgressDto,
  ProgressListDto,
  ProgressMergeDto,
  ProgressOneDto,
  SandboxListDto,
  SandboxOneDto,
  SubmissionOneDto,
} from "@ladder-dojo/api/dto";
import type { Circuit, TestCase } from "@ladder-dojo/core";

/**
 * API クライアント(DECISIONS.md D-016 改訂)。
 *
 * `apps/api` からは **DTO の型だけ** を import する(`@ladder-dojo/api/dto`)。
 * あのファイルは Workers のグローバル型に依存しないので、ブラウザ側の DOM 型と衝突しない。
 * 呼び出しは素の fetch。SPA と API は同一オリジンなので Cookie はそのまま送られる。
 */

export type { MeDto, ProgressDto, SandboxListDto, SandboxOneDto };
export type SandboxSummary = SandboxListDto["circuits"][number];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorDto["error"] | "unknown",
  ) {
    super(`API エラー: ${status} ${code}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorDto | null;
    throw new ApiError(res.status, body?.error ?? "unknown");
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<MeDto>("/me"),

  listProgress: () => request<ProgressListDto>("/progress"),

  recordMerge: (
    entries: Array<{ problemId: string; attempts: number; failures: number; cleared: boolean }>,
  ) =>
    request<ProgressMergeDto>("/progress/merge", {
      method: "POST",
      body: JSON.stringify({ entries }),
    }),

  recordAttempt: (problemId: string, passed: boolean) =>
    request<ProgressOneDto>(`/progress/${problemId}/attempts`, {
      method: "POST",
      body: JSON.stringify({ passed }),
    }),

  listSandbox: () => request<SandboxListDto>("/sandbox"),

  getSandbox: (id: string) => request<SandboxOneDto>(`/sandbox/${id}`),

  createSandbox: (input: { title: string; circuit: Circuit; testCases?: TestCase[] }) =>
    request<SandboxOneDto>("/sandbox", { method: "POST", body: JSON.stringify(input) }),

  updateSandbox: (id: string, input: { title: string; circuit: Circuit; testCases?: TestCase[] }) =>
    request<SandboxOneDto>(`/sandbox/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  deleteSandbox: (id: string) => request<{ deleted: true }>(`/sandbox/${id}`, { method: "DELETE" }),

  submit: (input: { problemId: string; circuit: Circuit; passed: boolean }) =>
    request<SubmissionOneDto>("/submissions", { method: "POST", body: JSON.stringify(input) }),
};

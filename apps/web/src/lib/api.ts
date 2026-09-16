import type {
  ApiErrorDto,
  AssignmentListDto,
  MatrixDto,
  MeDto,
  MistakeListDto,
  OrgDetailDto,
  OrgInviteDto,
  OrgListDto,
  PostedProblemDetailResponseDto,
  PostedProblemListDto,
  PostedProblemOneDto,
  ProgressDto,
  ProgressListDto,
  ProgressMergeDto,
  ProgressOneDto,
  RankingDto,
  RankingMetric,
  RankingPeriod,
  SandboxListDto,
  SandboxOneDto,
  SolutionFailedDto,
  StuckDto,
  SubmissionListDto,
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
export type PostedProblemSummary = PostedProblemListDto["problems"][number];
export type PostedProblemDetail = PostedProblemDetailResponseDto["problem"];
export type SolutionFailure = SolutionFailedDto["failures"][number];
export type OrgSummary = OrgListDto["orgs"][number];
export type OrgDetail = OrgDetailDto;
export type OrgMember = OrgDetailDto["members"][number];
export type Assignment = AssignmentListDto["assignments"][number];
export type Ranking = RankingDto;
export type { RankingMetric, RankingPeriod };
export type SandboxSummary = SandboxListDto["circuits"][number];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorDto["error"] | "solution_failed" | "unknown",
    /** 投稿時に模範解答が通らなかった場合の内訳 */
    readonly failures?: SolutionFailure[],
  ) {
    super(`API エラー: ${status} ${code}`);
    this.name = "ApiError";
  }
}

/** 画面遷移や入力の切り替えで不要になったリクエストを中断したときのエラー */
export function isAborted(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
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
    // 422 は投稿時の検証失敗で、通常のエラーとは形が違う(failures を持つ)
    const body = (await res.json().catch(() => null)) as ApiErrorDto | SolutionFailedDto | null;
    const failures = body && "failures" in body ? body.failures : undefined;
    throw new ApiError(res.status, body?.error ?? "unknown", failures);
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

  submit: (input: { problemId: string; circuit: Circuit; passed: boolean; diagnosisId?: string }) =>
    request<SubmissionOneDto>("/submissions", { method: "POST", body: JSON.stringify(input) }),

  /** 「みんながつまずくところ」。ログイン不要 */
  mistakes: (problemId: string) => request<MistakeListDto>(`/mistakes/${problemId}`),

  // --- 投稿問題(フェーズ2、SPEC.md §3.6)---

  listPosted: (
    params: {
      sort?: "new" | "likes" | "difficulty";
      tag?: string;
      q?: string;
      difficulty?: number;
      cursor?: string;
      mine?: boolean;
    },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const qs = search.toString();
    return request<PostedProblemListDto>(
      `/problems${qs ? `?${qs}` : ""}`,
      signal ? { signal } : undefined,
    );
  },

  getPosted: (id: string) => request<PostedProblemDetailResponseDto>(`/problems/${id}`),

  publishProblem: (input: {
    title: string;
    spec: string;
    circuit: Circuit;
    testCases: TestCase[];
    difficulty: number;
    tags: string[];
    visibility: "public" | "org" | "private";
    /** visibility が "org" のときの公開先 */
    orgId?: string;
  }) => request<PostedProblemOneDto>("/problems", { method: "POST", body: JSON.stringify(input) }),

  deletePosted: (id: string) => request<{ deleted: true }>(`/problems/${id}`, { method: "DELETE" }),

  recordPostedAttempt: (id: string, passed: boolean) =>
    request<PostedProblemOneDto>(`/problems/${id}/attempts`, {
      method: "POST",
      body: JSON.stringify({ passed }),
    }),

  likePosted: (id: string, liked: boolean) =>
    request<{ liked: boolean }>(`/problems/${id}/like`, { method: liked ? "POST" : "DELETE" }),

  votePostedDifficulty: (id: string, difficulty: number) =>
    request<PostedProblemOneDto>(`/problems/${id}/difficulty`, {
      method: "PUT",
      body: JSON.stringify({ difficulty }),
    }),

  reportPosted: (id: string, reason: string) =>
    request<{ reported: true; hidden: boolean }>(`/problems/${id}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // --- 組織とランキング(フェーズ3、SPEC.md §3.7 / §3.8)---

  listOrgs: () => request<OrgListDto>("/orgs"),

  createOrg: (name: string) =>
    request<{ org: OrgSummary }>("/orgs", { method: "POST", body: JSON.stringify({ name }) }),

  joinOrg: (code: string) =>
    request<{ org: OrgSummary; joined: boolean }>("/orgs/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  getOrg: (orgId: string) => request<OrgDetailDto>(`/orgs/${orgId}`),

  createInvite: (orgId: string) =>
    request<OrgInviteDto>(`/orgs/${orgId}/invites`, { method: "POST" }),

  setMemberRole: (orgId: string, userId: string, role: "admin" | "member") =>
    request<{ updated: true }>(`/orgs/${orgId}/members/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  removeMember: (orgId: string, userId: string) =>
    request<{ removed: true }>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }),

  memberProgress: (orgId: string, userId: string) =>
    request<ProgressListDto>(`/orgs/${orgId}/members/${userId}/progress`),

  memberSubmissions: (orgId: string, userId: string) =>
    request<SubmissionListDto>(`/orgs/${orgId}/members/${userId}/submissions`),

  /** クラス全体の進捗(管理者のみ) */
  orgMatrix: (orgId: string) => request<MatrixDto>(`/orgs/${orgId}/matrix`),

  orgStuck: (orgId: string) => request<StuckDto>(`/orgs/${orgId}/stuck`),

  listAssignments: (orgId: string) => request<AssignmentListDto>(`/orgs/${orgId}/assignments`),

  createAssignment: (
    orgId: string,
    input: { kind: "official" | "posted"; problemRef: string; userId?: string; note?: string },
  ) =>
    request<{ assignment: Assignment }>(`/orgs/${orgId}/assignments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteAssignment: (orgId: string, assignmentId: string) =>
    request<{ deleted: true }>(`/orgs/${orgId}/assignments/${assignmentId}`, { method: "DELETE" }),

  ranking: (params: { metric: RankingMetric; period: RankingPeriod; orgId?: string }) => {
    const search = new URLSearchParams({ metric: params.metric, period: params.period });
    if (params.orgId) search.set("orgId", params.orgId);
    return request<RankingDto>(`/rankings?${search.toString()}`);
  },
};

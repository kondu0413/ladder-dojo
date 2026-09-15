import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, api } from "./api.js";
import { useSession } from "./auth-client.js";
import {
  clearAllProgress,
  getProblemProgress,
  loadProgress,
  type ProblemProgress,
  type ProgressMap,
  recordAttempt as recordLocal,
} from "./progress.js";

/** 1 回のマージで送れる件数(API 側 MAX_MERGE_ENTRIES と合わせる) */
const MAX_MERGE_ENTRIES = 45;

export type ProgressContextValue = {
  progress: ProgressMap;
  /** ログイン中のユーザー。未ログインは null */
  user: { id: string; name: string; email: string; image: string | null } | null;
  loading: boolean;
  /** サーバーとの同期が失敗している場合の説明(未ログイン時は undefined) */
  syncError?: string;
  /** 引き継ぎ確認中の端末側の進捗(S-002) */
  pendingMerge?: ProgressMap;
  get: (problemId: string) => ProblemProgress;
  record: (problemId: string, passed: boolean) => void;
  acceptMerge: () => Promise<void>;
  dismissMerge: () => void;
};

const ProgressContext = createContext<ProgressContextValue | undefined>(undefined);

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("ProgressProvider の外で useProgress を呼びました");
  return ctx;
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      }
    : null;

  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [pendingMerge, setPendingMerge] = useState<ProgressMap | undefined>(undefined);
  const [syncError, setSyncError] = useState<string | undefined>(undefined);
  const [askedFor, setAskedFor] = useState<string | undefined>(undefined);

  // ログイン状態が変わったら、進捗の取得元を切り替える
  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setProgress(loadProgress());
      setPendingMerge(undefined);
      setSyncError(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { progress: rows } = await api.listProgress();
        if (cancelled) return;
        setProgress(fromServer(rows));
        setSyncError(undefined);
        const local = loadProgress();
        if (Object.keys(local).length > 0 && askedFor !== user.id) {
          setPendingMerge(local);
          setAskedFor(user.id);
        }
      } catch {
        if (!cancelled)
          setSyncError("サーバーから進捗を取得できませんでした。この端末の記録を表示しています。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isPending, askedFor]);

  const record = useCallback(
    (problemId: string, passed: boolean) => {
      if (!user) {
        setProgress(recordLocal(problemId, passed));
        return;
      }
      // 画面はすぐ更新し、サーバーへは後ろで送る
      setProgress((prev) => {
        const cur = getProblemProgress(prev, problemId);
        const now = new Date().toISOString();
        return {
          ...prev,
          [problemId]: {
            cleared: cur.cleared || passed,
            attempts: cur.attempts + 1,
            failures: cur.failures + (passed ? 0 : 1),
            lastAttemptAt: now,
            ...(cur.clearedAt ? { clearedAt: cur.clearedAt } : passed ? { clearedAt: now } : {}),
          },
        };
      });
      api.recordAttempt(problemId, passed).catch((err: unknown) => {
        const message =
          err instanceof ApiError && err.status === 401
            ? "ログインが切れています。もう一度ログインしてください。"
            : "進捗をサーバーに保存できませんでした。";
        setSyncError(message);
      });
    },
    [user],
  );

  const acceptMerge = useCallback(async () => {
    if (!pendingMerge) return;
    const entries = Object.entries(pendingMerge)
      .slice(0, MAX_MERGE_ENTRIES)
      .map(([problemId, p]) => ({
        problemId,
        attempts: p.attempts,
        failures: p.failures,
        cleared: p.cleared,
      }));
    if (entries.length === 0) {
      setPendingMerge(undefined);
      return;
    }
    try {
      const res = await api.recordMerge(entries);
      setProgress(fromServer(res.progress));
      clearAllProgress();
      setPendingMerge(undefined);
      setSyncError(undefined);
    } catch {
      setSyncError("この端末の進捗を取り込めませんでした。時間をおいて試してください。");
    }
  }, [pendingMerge]);

  const dismissMerge = useCallback(() => setPendingMerge(undefined), []);

  const value: ProgressContextValue = {
    progress,
    user,
    loading: isPending,
    get: (problemId) => getProblemProgress(progress, problemId),
    record,
    acceptMerge,
    dismissMerge,
    ...(syncError ? { syncError } : {}),
    ...(pendingMerge ? { pendingMerge } : {}),
  };

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

function fromServer(
  rows: Array<{
    problemId: string;
    attempts: number;
    failures: number;
    clearedAt: string | null;
    lastAttemptAt: string;
  }>,
): ProgressMap {
  const map: ProgressMap = {};
  for (const row of rows) {
    map[row.problemId] = {
      cleared: row.clearedAt !== null,
      attempts: row.attempts,
      failures: row.failures,
      lastAttemptAt: row.lastAttemptAt,
      ...(row.clearedAt ? { clearedAt: row.clearedAt } : {}),
    };
  }
  return map;
}

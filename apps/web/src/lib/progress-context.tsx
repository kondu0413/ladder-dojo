import type { Circuit } from "@ladder-dojo/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError, api } from "./api.js";
import { useSession } from "./auth-client.js";
import {
  chunkEntries,
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
  /**
   * 提出した回路を履歴に残す(SPEC.md §3.5)。ログイン中だけサーバーに送る。
   * `record` と同じく、セッション確認中に呼ばれたら確認が済むまで預かる
   */
  recordSubmission: (
    problemId: string,
    circuit: Circuit,
    passed: boolean,
    diagnosisId?: string,
  ) => void;
  acceptMerge: () => Promise<void>;
  dismissMerge: () => void;
};

/** セッション確認中に預かる書き込み */
type PendingWrite =
  | { kind: "attempt"; problemId: string; passed: boolean }
  | {
      kind: "submission";
      problemId: string;
      circuit: Circuit;
      passed: boolean;
      diagnosisId?: string;
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

  /**
   * セッション確認中(`isPending`)に発生した書き込みの控え。
   *
   * 確認が済むまで `user` は null なので、そのまま判断すると
   * 「ログイン済みなのに端末にしか記録されない」「提出が黙って捨てられる」が起きる。
   * ページを開いた直後に答え合わせを押すと実際にそうなっていた。
   * 行き先が決まるまでここに預かり、決まってから流す。
   */
  const deferred = useRef<PendingWrite[]>([]);

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

  /** サーバーへの送信。投げっぱなしで、失敗しても学習の流れは止めない(S-002 / S-007) */
  const sendAttempt = useCallback((problemId: string, passed: boolean) => {
    api.recordAttempt(problemId, passed).catch((err: unknown) => {
      const message =
        err instanceof ApiError && err.status === 401
          ? "ログインが切れています。もう一度ログインしてください。"
          : "進捗をサーバーに保存できませんでした。";
      setSyncError(message);
    });
  }, []);

  /** 画面の見た目だけ先に進める。サーバーの返事は待たない */
  const applyLocally = useCallback((problemId: string, passed: boolean) => {
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
  }, []);

  const record = useCallback(
    (problemId: string, passed: boolean) => {
      if (isPending) {
        deferred.current.push({ kind: "attempt", problemId, passed });
        applyLocally(problemId, passed);
        return;
      }
      if (!user) {
        setProgress(recordLocal(problemId, passed));
        return;
      }
      applyLocally(problemId, passed);
      sendAttempt(problemId, passed);
    },
    [user, isPending, applyLocally, sendAttempt],
  );

  const recordSubmission = useCallback(
    (problemId: string, circuit: Circuit, passed: boolean, diagnosisId?: string) => {
      if (isPending) {
        deferred.current.push({
          kind: "submission",
          problemId,
          circuit,
          passed,
          ...(diagnosisId ? { diagnosisId } : {}),
        });
        return;
      }
      // 未ログインなら提出履歴は残さない(サーバーにしか置き場がない)
      if (!user) return;
      api
        .submit({ problemId, circuit, passed, ...(diagnosisId ? { diagnosisId } : {}) })
        .catch(() => undefined);
    },
    [user, isPending],
  );

  // セッションの確認が済んだら、預かっていた書き込みを流す
  useEffect(() => {
    if (isPending) return;
    const queued = deferred.current;
    if (queued.length === 0) return;
    deferred.current = [];
    for (const write of queued) {
      if (write.kind === "attempt") {
        if (user) sendAttempt(write.problemId, write.passed);
        else setProgress(recordLocal(write.problemId, write.passed));
        continue;
      }
      if (!user) continue;
      const { kind: _kind, diagnosisId, ...rest } = write;
      api.submit({ ...rest, ...(diagnosisId ? { diagnosisId } : {}) }).catch(() => undefined);
    }
  }, [isPending, user, sendAttempt]);

  const acceptMerge = useCallback(async () => {
    if (!pendingMerge) return;
    const entries = Object.entries(pendingMerge).map(([problemId, p]) => ({
      problemId,
      attempts: p.attempts,
      failures: p.failures,
      cleared: p.cleared,
    }));
    if (entries.length === 0) {
      setPendingMerge(undefined);
      return;
    }
    /**
     * **1 回に送れる件数を超えたら、分けて送る**(S-032)。
     *
     * 以前は先頭 45 件だけ送って、そのあと端末の進捗を全部消していた。
     * 46 件目から先は、ログインした瞬間に黙って消えていた。
     * 送り切ってから消す
     */
    try {
      let last = fromServer([]);
      for (const batch of chunkEntries(entries, MAX_MERGE_ENTRIES)) {
        // マージの応答は「その時点の全進捗」なので、最後の 1 回で足りる
        const res = await api.recordMerge(batch);
        last = fromServer(res.progress);
      }
      setProgress(last);
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
    recordSubmission,
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

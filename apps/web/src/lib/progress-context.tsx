import type { Circuit } from "@ladder-dojo/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, api } from "./api.js";
import { useSession } from "./auth-client.js";
import {
  chunkEntries,
  getProblemProgress,
  loadProgress,
  loadQueue,
  type ProblemProgress,
  type ProgressMap,
  recordAttempt as recordLocal,
  removeProgress,
  saveQueue,
} from "./progress.js";

/** 1 回のマージで送れる件数(API 側 MAX_MERGE_ENTRIES と合わせる) */
const MAX_MERGE_ENTRIES = 45;

export type SessionUser = { id: string; name: string; email: string; image: string | null };

export type ProgressContextValue = {
  progress: ProgressMap;
  /** ログイン中のユーザー。未ログインは null */
  user: SessionUser | null;
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

/** 1 回の挑戦を進捗の表に足す(純粋)。画面の先行更新と、取得結果への再適用で使う */
function applyAttempt(map: ProgressMap, problemId: string, passed: boolean): ProgressMap {
  const cur = getProblemProgress(map, problemId);
  const now = new Date().toISOString();
  return {
    ...map,
    [problemId]: {
      cleared: cur.cleared || passed,
      attempts: cur.attempts + 1,
      failures: cur.failures + (passed ? 0 : 1),
      lastAttemptAt: now,
      ...(cur.clearedAt ? { clearedAt: cur.clearedAt } : passed ? { clearedAt: now } : {}),
    },
  };
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("ProgressProvider の外で useProgress を呼びました");
  return ctx;
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const sessionUser = session?.user;
  const userId = sessionUser?.id;
  const userName = sessionUser?.name;
  const userEmail = sessionUser?.email;
  const userImage = sessionUser?.image ?? null;

  /**
   * **ユーザーは中身が同じなら同じオブジェクトにする**(S-036)。
   *
   * 以前は描画のたびに `{ id, name, ... }` を作り直していて、それを下の
   * 取得の effect が依存に持っていた。取得が済むと `setProgress` で描画され、
   * 描画されると新しいユーザーオブジェクトができ、effect がまた走って取得する。
   * ログインしている間、`GET /api/progress` が**毎秒 100 回**飛び続けていた
   * (実測 4 秒で 427 回)。Workers Free の 10 万リクエスト/日を 1 人で
   * 20 分ほどで使い切る量で、0 円運用(SPEC.md §2.3)が成り立たない
   */
  const user = useMemo<SessionUser | null>(
    () =>
      userId !== undefined && userName !== undefined && userEmail !== undefined
        ? { id: userId, name: userName, email: userEmail, image: userImage }
        : null,
    [userId, userName, userEmail, userImage],
  );

  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [pendingMerge, setPendingMerge] = useState<ProgressMap | undefined>(undefined);
  const [syncError, setSyncError] = useState<string | undefined>(undefined);
  /** 引き継ぎを聞いたユーザー。描画を起こさないよう ref に持つ(state だと effect がもう一度走る) */
  const askedFor = useRef<string | undefined>(undefined);

  /**
   * セッション確認中(`isPending`)に発生した書き込みの控え。
   *
   * 確認が済むまで `user` は null なので、そのまま判断すると
   * 「ログイン済みなのに端末にしか記録されない」「提出が黙って捨てられる」が起きる。
   * ページを開いた直後に答え合わせを押すと実際にそうなっていた。
   * 行き先が決まるまでここに預かり、決まってから流す。
   */
  const deferred = useRef<PendingWrite[]>([]);
  /**
   * セッション確認中に画面へ先に反映した挑戦(S-053)。
   * 確認が済むと進捗を取得して表を丸ごと入れ替えるが、預かった POST はまだ届いて
   * いないことがある。取得結果の上にもう一度乗せないと、答えたばかりの問題が
   * 未クリアに戻って見える
   */
  const appliedWhilePending = useRef<Array<{ problemId: string; passed: boolean }>>([]);
  const userRef = useRef(user);
  userRef.current = user;
  /** 控えの送り直しが重ならないように */
  const flushing = useRef(false);

  // ログイン状態が変わったら、進捗の取得元を切り替える。ここは**ユーザーが変わったときだけ**走る
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
        let map = fromServer(rows);
        for (const w of appliedWhilePending.current) map = applyAttempt(map, w.problemId, w.passed);
        appliedWhilePending.current = [];
        setProgress(map);
        setSyncError(undefined);
        const local = loadProgress();
        if (Object.keys(local).length > 0 && askedFor.current !== user.id) {
          askedFor.current = user.id;
          setPendingMerge(local);
        }
      } catch {
        if (!cancelled)
          setSyncError("サーバーから進捗を取得できませんでした。この端末の記録を表示しています。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isPending]);

  /**
   * 端末に控えた挑戦を順に送り直す(S-053)。1 件ずつ送り、通った分から控えを減らす。
   * 途中で失敗したら残りは次につながったときに回す
   */
  const flushQueue = useCallback(async () => {
    const u = userRef.current;
    if (!u || flushing.current) return;
    flushing.current = true;
    try {
      let queue = loadQueue(u.id);
      while (queue.length > 0) {
        const [head, ...rest] = queue;
        if (!head) break;
        await api.recordAttempt(head.problemId, head.passed);
        queue = rest;
        saveQueue(u.id, queue);
      }
      setSyncError(undefined);
    } catch {
      // つながっていない。次の online か送信成功のときにもう一度
    } finally {
      flushing.current = false;
    }
  }, []);

  /**
   * サーバーへの送信。投げっぱなしで、失敗しても学習の流れは止めない(S-002 / S-007)。
   * 失敗した挑戦は端末に控えて、つながったら送り直す(S-053)。
   * 以前は画面にしか残らず、読み込み直すとオフラインで答えた分が消えていた
   */
  const sendAttempt = useCallback(
    (problemId: string, passed: boolean) => {
      const u = userRef.current;
      api
        .recordAttempt(problemId, passed)
        .then(() => {
          setSyncError(undefined);
          void flushQueue();
        })
        .catch((err: unknown) => {
          if (u) {
            saveQueue(u.id, [
              ...loadQueue(u.id),
              { problemId, passed, at: new Date().toISOString() },
            ]);
          }
          const message =
            err instanceof ApiError && err.status === 401
              ? "ログインが切れています。もう一度ログインすると、この端末に控えた進捗を送り直します。"
              : "進捗をサーバーに保存できませんでした。この端末に控えを残し、つながったら送り直します。";
          setSyncError(message);
        });
    },
    [flushQueue],
  );

  // ログインが済んだとき、つながったときに控えを送り直す
  useEffect(() => {
    if (isPending || !user) return;
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [isPending, user, flushQueue]);

  /** 画面の見た目だけ先に進める。サーバーの返事は待たない */
  const applyLocally = useCallback((problemId: string, passed: boolean) => {
    setProgress((prev) => applyAttempt(prev, problemId, passed));
  }, []);

  const record = useCallback(
    (problemId: string, passed: boolean) => {
      if (isPending) {
        deferred.current.push({ kind: "attempt", problemId, passed });
        appliedWhilePending.current.push({ problemId, passed });
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
    // 送り終えた分はその場で端末から消す。途中で失敗して押し直しても、済んだ分を
    // もう一度送って試行回数を二重に数えない(S-053)
    const remaining: ProgressMap = { ...pendingMerge };
    try {
      let last: ProgressMap | undefined;
      for (const batch of chunkEntries(entries, MAX_MERGE_ENTRIES)) {
        // マージの応答は「その時点の全進捗」なので、最後の 1 回で足りる
        const res = await api.recordMerge(batch);
        last = fromServer(res.progress);
        const ids = batch.map((e) => e.problemId);
        removeProgress(ids);
        for (const id of ids) delete remaining[id];
      }
      if (last) setProgress(last);
      setPendingMerge(undefined);
      setSyncError(undefined);
    } catch {
      setPendingMerge(Object.keys(remaining).length > 0 ? remaining : undefined);
      setSyncError("この端末の進捗を取り込めませんでした。時間をおいて試してください。");
    }
  }, [pendingMerge]);

  const dismissMerge = useCallback(() => setPendingMerge(undefined), []);

  // 値も作り直さない。作り直すと、進捗を読むだけの画面まで毎回描き直される
  const value = useMemo<ProgressContextValue>(
    () => ({
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
    }),
    [
      progress,
      user,
      isPending,
      record,
      recordSubmission,
      acceptMerge,
      dismissMerge,
      syncError,
      pendingMerge,
    ],
  );

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

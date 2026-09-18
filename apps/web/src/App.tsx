import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router";
import { Skeleton } from "./components/ui.js";
import { NotationProvider } from "./lib/notation-context.jsx";
import { ProgressProvider, useProgress } from "./lib/progress-context.jsx";
import { LandingPage } from "./pages/LandingPage.js";
import { ProblemListPage } from "./pages/ProblemListPage.js";

/**
 * 画面ごとに分けて読み込む(改善候補 11)。
 *
 * 1 つにまとめると初回に 565 KB(gzip 164 KB)を全部読むことになる。
 * 最初に出るのは問題一覧なので、それだけを最初から持ち、残りは開くときに読む。
 *
 * ただし**読み終わったら残りも裏で取っておく**(`prefetchRoutes`)。
 * オフライン対応(S-013)の Service Worker は「通ったものを貯める」方式なので、
 * 取りに行かないとキャッシュに入らず、圏外で開けない画面ができてしまう。
 * 初回表示を軽くしつつ、オフラインでも全部開ける状態を保つ。
 */
const CommunityListPage = lazy(() =>
  import("./pages/CommunityListPage.js").then((m) => ({ default: m.CommunityListPage })),
);
const CommunityProblemPage = lazy(() =>
  import("./pages/CommunityProblemPage.js").then((m) => ({ default: m.CommunityProblemPage })),
);
const OrgDetailPage = lazy(() =>
  import("./pages/OrgDetailPage.js").then((m) => ({ default: m.OrgDetailPage })),
);
const OrgListPage = lazy(() =>
  import("./pages/OrgListPage.js").then((m) => ({ default: m.OrgListPage })),
);
const ProblemPage = lazy(() =>
  import("./pages/ProblemPage.js").then((m) => ({ default: m.ProblemPage })),
);
const RankingPage = lazy(() =>
  import("./pages/RankingPage.js").then((m) => ({ default: m.RankingPage })),
);
const SandboxPage = lazy(() =>
  import("./pages/SandboxPage.js").then((m) => ({ default: m.SandboxPage })),
);
const SimulatorDemoPage = lazy(() =>
  import("./pages/SimulatorDemoPage.js").then((m) => ({ default: m.SimulatorDemoPage })),
);

/** 分けた分を裏で取りに行く。取っておかないとオフラインで開けない(S-013) */
function prefetchRoutes(): void {
  void import("./pages/ProblemPage.js");
  void import("./pages/SandboxPage.js");
  void import("./pages/CommunityListPage.js");
  void import("./pages/CommunityProblemPage.js");
  void import("./pages/OrgListPage.js");
  void import("./pages/OrgDetailPage.js");
  void import("./pages/RankingPage.js");
  void import("./pages/SimulatorDemoPage.js");
}

export function App() {
  useEffect(() => {
    // 手が空いてから。最初の描画と競争させない
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(() => prefetchRoutes(), { timeout: 5_000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(prefetchRoutes, 2_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ProgressProvider>
      <NotationProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/problems" element={<ProblemListPage />} />
            <Route path="/problems/:id" element={<ProblemPage />} />
            <Route path="/community" element={<CommunityListPage />} />
            <Route path="/community/:id" element={<CommunityProblemPage />} />
            <Route path="/orgs" element={<OrgListPage />} />
            <Route path="/orgs/:id" element={<OrgDetailPage />} />
            <Route path="/rankings" element={<RankingPage />} />
            <Route path="/sandbox" element={<SandboxPage />} />
            <Route path="/samples" element={<SimulatorDemoPage />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </NotationProvider>
    </ProgressProvider>
  );
}

/**
 * トップ(S-021)。
 *
 * **未ログインなら紹介の画面、ログイン済みなら問題一覧**。初めて来た人に
 * いきなり問題の一覧を出しても何のアプリか分からないが、毎日使う人に
 * 毎回紹介を見せるのも邪魔なので、入口で分ける。
 *
 * セッションの確認中は**どちらにも倒さない**。ここで未ログインと決めると、
 * ログイン済みの人が一瞬だけ紹介の画面を見ることになる(S-007 と同じ考え方)。
 */
function Home() {
  const { user, loading } = useProgress();
  if (loading) return <PageLoading />;
  return user ? <ProblemListPage /> : <LandingPage />;
}

function PageLoading() {
  return (
    <div data-testid="page-loading" className="flex min-h-dvh flex-col bg-slate-50">
      <p className="sr-only" role="status">
        読み込み中
      </p>
      <div className="h-14 bg-slate-950" aria-hidden="true" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton key={k} className="h-24" />
          ))}
        </div>
      </main>
    </div>
  );
}

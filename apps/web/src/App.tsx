import { Route, Routes } from "react-router";
import { ProgressProvider } from "./lib/progress-context.jsx";
import { CommunityListPage } from "./pages/CommunityListPage.js";
import { CommunityProblemPage } from "./pages/CommunityProblemPage.js";
import { OrgDetailPage } from "./pages/OrgDetailPage.js";
import { OrgListPage } from "./pages/OrgListPage.js";
import { ProblemListPage } from "./pages/ProblemListPage.js";
import { ProblemPage } from "./pages/ProblemPage.js";
import { RankingPage } from "./pages/RankingPage.js";
import { SandboxPage } from "./pages/SandboxPage.js";
import { SimulatorDemoPage } from "./pages/SimulatorDemoPage.js";

export function App() {
  return (
    <ProgressProvider>
      <Routes>
        <Route path="/" element={<ProblemListPage />} />
        <Route path="/problems/:id" element={<ProblemPage />} />
        <Route path="/community" element={<CommunityListPage />} />
        <Route path="/community/:id" element={<CommunityProblemPage />} />
        <Route path="/orgs" element={<OrgListPage />} />
        <Route path="/orgs/:id" element={<OrgDetailPage />} />
        <Route path="/rankings" element={<RankingPage />} />
        <Route path="/sandbox" element={<SandboxPage />} />
        <Route path="/samples" element={<SimulatorDemoPage />} />
        <Route path="*" element={<ProblemListPage />} />
      </Routes>
    </ProgressProvider>
  );
}

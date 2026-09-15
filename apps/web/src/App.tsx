import { Route, Routes } from "react-router";
import { ProgressProvider } from "./lib/progress-context.jsx";
import { ProblemListPage } from "./pages/ProblemListPage.js";
import { ProblemPage } from "./pages/ProblemPage.js";
import { SandboxPage } from "./pages/SandboxPage.js";
import { SimulatorDemoPage } from "./pages/SimulatorDemoPage.js";

export function App() {
  return (
    <ProgressProvider>
      <Routes>
        <Route path="/" element={<ProblemListPage />} />
        <Route path="/problems/:id" element={<ProblemPage />} />
        <Route path="/sandbox" element={<SandboxPage />} />
        <Route path="/samples" element={<SimulatorDemoPage />} />
        <Route path="*" element={<ProblemListPage />} />
      </Routes>
    </ProgressProvider>
  );
}

import { Route, Routes } from "react-router";
import { SandboxPage } from "./pages/SandboxPage.js";
import { SimulatorDemoPage } from "./pages/SimulatorDemoPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SimulatorDemoPage />} />
      <Route path="/sandbox" element={<SandboxPage />} />
      <Route path="*" element={<SimulatorDemoPage />} />
    </Routes>
  );
}

import { Route, Routes } from "react-router";
import { SimulatorDemoPage } from "./pages/SimulatorDemoPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SimulatorDemoPage />} />
      <Route path="*" element={<SimulatorDemoPage />} />
    </Routes>
  );
}

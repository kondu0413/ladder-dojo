import { SCHEMA_VERSION } from "@ladder-dojo/core";
import { Route, Routes } from "react-router";

function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-sm flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">ラダー図トレーニング</h1>
      <p className="text-slate-600">
        PLC のラダー図を「読む」「直す」「書く」の順に身につける学習アプリです。準備中。
      </p>
      <p className="text-xs text-slate-400" data-testid="schema-version">
        schema v{SCHEMA_VERSION}
      </p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

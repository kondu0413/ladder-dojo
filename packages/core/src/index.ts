/**
 * @ladder-dojo/core
 *
 * ラダーシミュレータ・判定・回路 JSON スキーマの共通コア。
 * DOM / Node API に依存せず、ブラウザ・Workers・Vitest のどこでも動く純 TypeScript。
 */
export * from "./builder.js";
export * from "./describe.js";
export * from "./diagnose.js";
export * from "./edit.js";
export * from "./fingerprint.js";
export * from "./judge/judge.js";
export * from "./metrics.js";
export * from "./schema/index.js";
export * from "./sim/simulator.js";

/** パッケージが読み込めていることを確認するための最小限の関数 */
export function coreVersion(): { schemaVersion: 1 } {
  return { schemaVersion: 1 };
}

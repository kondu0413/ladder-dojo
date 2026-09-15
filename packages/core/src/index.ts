/**
 * @ladder-dojo/core
 *
 * ラダーシミュレータ・判定・回路 JSON スキーマの共通コア。
 * DOM / Node API に依存せず、ブラウザ・Workers・Vitest のどこでも動く純 TypeScript。
 *
 * 現在は骨組みのみ(着手順 3〜4 でスキーマとシミュレータを追加する)。
 */

/** 回路 JSON のスキーマバージョン。互換性のない変更で上げる */
export const SCHEMA_VERSION = 1 as const;

/** パッケージが読み込めていることを確認するための最小限の関数 */
export function coreVersion(): { schemaVersion: typeof SCHEMA_VERSION } {
  return { schemaVersion: SCHEMA_VERSION };
}

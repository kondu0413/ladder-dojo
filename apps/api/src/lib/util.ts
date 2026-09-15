/** 回路 JSON 1 件の上限(COST.md §1.2: D1 の 1 行 2 MB に対して余裕をとる) */
export const MAX_CIRCUIT_JSON_BYTES = 256 * 1024;

/** 正規化済み JSON の SHA-256(提出履歴の重複判定、S-003) */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** JST の `YYYY-MM-DD`(S-001: 連続学習日数は JST で切る) */
export function jstDate(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export function newId(): string {
  return crypto.randomUUID();
}

/** UTF-8 のバイト数 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * CSV の組み立て(改善候補 10)。
 *
 * 教育担当者が Excel で開いて社内の報告に使うことを想定している。
 * そのため 2 つ、素直に書くと落とし穴になるところを塞いでいる。
 *
 * 1. **数式として実行されないようにする**(CSV インジェクション)。
 *    メンバーの表示名は本人が決められるので、`=1+1` や `@SUM(...)` のような
 *    名前を付けられる。そのまま書くと Excel が数式として解釈してしまう。
 *    先頭が `= + - @ タブ 改行` のセルには `'` を足して、文字列として読ませる
 * 2. **BOM を付ける**。付けないと Excel(Windows)が日本語を文字化けさせる
 */

/** Excel が数式と解釈しうる先頭文字 */
const FORMULA_LEAD = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** 1 セルを CSV の 1 フィールドにする */
export function escapeCsvCell(value: string): string {
  const guarded = FORMULA_LEAD.has(value[0] ?? "") ? `'${value}` : value;
  // 区切り・引用符・改行を含むなら引用符で囲み、中の引用符は 2 つ重ねる
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
  return guarded;
}

/** 行の配列を CSV 本文にする。改行は CRLF(Excel が期待する形) */
export function toCsv(rows: ReadonlyArray<readonly string[]>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/** Excel(Windows)で文字化けしないように BOM を付ける */
export const UTF8_BOM = "﻿";

/** Blob の URL を捨てるまでの待ち時間(ms) */
const REVOKE_AFTER_MS = 30_000;

/**
 * CSV をファイルとしてダウンロードさせる。
 *
 * Blob の URL は放っておくとページを閉じるまで残るので必ず捨てるが、
 * **click の直後に捨ててはいけない**。ダウンロードが始まる前に消えてしまい、
 * ファイル名が `download` になったり、中身が取れなかったりする。
 * 少し待ってから捨てる。
 */
export function downloadCsv(filename: string, rows: ReadonlyArray<readonly string[]>): void {
  const blob = new Blob([UTF8_BOM, toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  // 後片付けはあとで。click() の直後に要素を消したり URL を捨てたりすると、
  // ダウンロードが始まる前に無くなってファイル名が失われる
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, REVOKE_AFTER_MS);
}

/**
 * 組織名をファイル名の一部にできる形にする。**使えるものが無ければ空文字**を返す。
 *
 * ASCII だけにしているのは、**日本語を含むファイル名だと保存名ごと失われる**ブラウザが
 * あるため。実際 Chromium では `進捗.csv` が `download`(拡張子なし)で保存されてしまい、
 * 何のファイルか分からなくなる。中身は UTF-8 + BOM なので日本語はそのまま読める。
 *
 * そのため、日本語だけの組織名では空文字になる。呼ぶ側で既定の名前と組み合わせる。
 */
export function safeFilePart(text: string): string {
  return text
    .replaceAll(/[^\u0020-\u007E]/g, "")
    .replaceAll(/[\\/:*?"<>|\s]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 40)
    .replaceAll(/_+$/g, "");
}

import { describe, expect, it } from "vitest";
import { escapeCsvCell, safeFilePart, toCsv } from "./csv.js";

describe("CSV の組み立て", () => {
  describe("1 セルの書き方", () => {
    it("ふつうの文字はそのまま", () => {
      expect(escapeCsvCell("山田太郎")).toBe("山田太郎");
      expect(escapeCsvCell("")).toBe("");
    });

    it("区切り・引用符・改行を含むセルは引用符で囲む", () => {
      expect(escapeCsvCell("A,B")).toBe('"A,B"');
      expect(escapeCsvCell('彼は "すごい" と言った')).toBe('"彼は ""すごい"" と言った"');
      expect(escapeCsvCell("1 行目\n2 行目")).toBe('"1 行目\n2 行目"');
      // 数式の目印は先頭だけを見る。末尾の \r はただのデータなので囲むだけ
      expect(escapeCsvCell("戻る\r")).toBe('"戻る\r"');
    });

    describe("数式として実行されないようにする(CSV インジェクション)", () => {
      // 表示名は本人が決められるので、こういう名前を付けられる
      it.each([
        ["=1+1", "'=1+1"],
        ["+1", "'+1"],
        ["-1", "'-1"],
        ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
        ["\tタブ始まり", "'\tタブ始まり"],
      ])("%s は文字列として読ませる", (input, expected) => {
        expect(escapeCsvCell(input)).toBe(expected);
      });

      it("よくある呼び出し(DDE)も文字列になる", () => {
        const attack = "=cmd|' /C calc'!A0";
        const escaped = escapeCsvCell(attack);
        expect(escaped.startsWith("\"'=") || escaped.startsWith("'=")).toBe(true);
      });

      it("途中に = があるだけなら何もしない", () => {
        expect(escapeCsvCell("a=b")).toBe("a=b");
      });
    });
  });

  describe("行をつなぐ", () => {
    it("改行は CRLF(Excel が期待する形)", () => {
      expect(
        toCsv([
          ["名前", "状態"],
          ["太郎", "クリア"],
        ]),
      ).toBe("名前,状態\r\n太郎,クリア");
    });

    it("空の表は空文字", () => {
      expect(toCsv([])).toBe("");
    });

    it("セルごとに書き方が適用される", () => {
      expect(toCsv([["=1", "a,b", "ふつう"]])).toBe('\'=1,"a,b",ふつう');
    });
  });

  describe("ファイル名に使う部分", () => {
    it("使えない文字を _ にする", () => {
      expect(safeFilePart('a:b*c?d"e<f>g|h')).toBe("a_b_c_d_e_f_g_h");
      expect(safeFilePart("Acme Corp")).toBe("Acme_Corp");
    });

    it("非 ASCII を落とす(保存名ごと失われるブラウザがあるため)", () => {
      // Chromium では「進捗.csv」が download(拡張子なし)で保存されてしまう
      expect(safeFilePart("A 社 第 1 期")).toBe("A_1");
      expect(safeFilePart("ラダー道場")).toBe("");
      expect(safeFilePart("Acme 株式会社")).toBe("Acme");
    });

    it("返すのは ASCII だけ", () => {
      for (const input of ["日本語", "Acme 株式会社", "①②③", "a\u0000b"]) {
        expect(safeFilePart(input)).toMatch(/^[\u0020-\u007E]*$/);
      }
    });

    it("長すぎる名前は切る", () => {
      expect(safeFilePart("a".repeat(100))).toHaveLength(40);
    });

    it("使えるものが無ければ空文字。既定の名前は呼ぶ側で決める", () => {
      expect(safeFilePart("   ")).toBe("");
      expect(safeFilePart("")).toBe("");
      expect(safeFilePart("日本語だけ")).toBe("");
    });
  });
});

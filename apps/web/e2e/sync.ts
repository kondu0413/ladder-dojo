import type { Page, Response } from "@playwright/test";

/**
 * 画面が「投げっぱなし」で送るリクエストの完了を待つ。
 *
 * 進捗(DECISIONS.md S-002)と提出回路(S-007)は、判定の表示を待たせないために
 * await せずに送っている。画面としてはこれが正しいが、E2E がそのあとすぐ
 * `page.goto()` で移動したり `context.close()` したりすると、送信中のリクエストごと
 * 消えてしまう。サーバーに書かれた結果を見るテストは、移動する前にここで待つ。
 *
 * **操作より先に呼ぶこと。** あとから呼んでも、すでに終わったレスポンスは拾えない。
 *
 * ```ts
 * const saved = waitForPost(page, ATTEMPTS);
 * await page.getByTestId("check-answer").click();
 * await saved;
 * await page.goto("/");
 * ```
 */
export function waitForPost(page: Page, pathFragment: string): Promise<Response> {
  return page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().includes(pathFragment) && res.status() < 400,
  );
}

/** 進捗の試行記録。`POST /api/progress/:id/attempts` */
export const ATTEMPTS = "/attempts";
/** 提出回路。`POST /api/submissions` */
export const SUBMISSIONS = "/api/submissions";

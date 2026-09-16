/**
 * アイコンの PNG を SVG から作り直す。
 *
 * 正は `public/*.svg` のほうで、PNG はそこから作った出力。
 * PNG はバイナリなので差分を目で読めない。手で描いたものを置くと、
 * 何がどう変わったのか誰にも分からなくなる。SVG を直してこれを流し直す。
 *
 *   node scripts/build-icons.mjs
 *
 * PNG が要るのは iOS Safari のため。ホーム画面に追加したときのアイコン
 * (`apple-touch-icon`)に SVG を指定しても読んでもらえず、ページの
 * 縮小画像が代わりに使われる(S-013 の追記を参照)。
 *
 * 描画には Playwright の Chromium を使う。E2E ですでに入っているものを使い回す。
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");

/** 角丸の背景と同じ色。これを下に敷くと角が埋まって正方形になる */
const BACKDROP = "#0f172a";

const TARGETS = [
  // iOS はアイコンに自前で角丸を掛ける。こちらで角を透明にすると、そこが黒く出る。
  // 背景を同じ色で敷いて「角丸の無い不透明な正方形」にしておく
  { svg: "icon.svg", out: "apple-touch-icon-180.png", size: 180, backdrop: BACKDROP },
  // manifest 用。角丸は活かす(purpose: any)
  { svg: "icon.svg", out: "icon-192.png", size: 192, backdrop: null },
  { svg: "icon.svg", out: "icon-512.png", size: 512, backdrop: null },
  // purpose: maskable。端を削られる前提で中身が中央 60% に縮めてある
  { svg: "icon-maskable.svg", out: "icon-maskable-512.png", size: 512, backdrop: BACKDROP },
];

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
});

try {
  await mkdir(publicDir, { recursive: true });
  for (const target of TARGETS) {
    const svg = await readFile(join(publicDir, target.svg), "utf8");
    const page = await browser.newPage({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>
         html,body{margin:0;padding:0;width:${target.size}px;height:${target.size}px;
           background:${target.backdrop ?? "transparent"}}
         svg{display:block;width:${target.size}px;height:${target.size}px}
       </style>${svg}`,
    );
    await page.screenshot({
      path: join(publicDir, target.out),
      omitBackground: target.backdrop === null,
    });
    await page.close();
    console.log(`${target.svg} -> ${target.out} (${target.size}x${target.size})`);
  }
} finally {
  await browser.close();
}

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ホーム画面のアイコンが本当に置いてあるかを確かめる。
 *
 * ここを自動で見ている理由は 2 つある。
 *
 * 1. **iPhone で確認できる人がいない**。手元に端末が無いので、
 *    「追加したらアイコンが出なかった」に気づく手段が他に無い
 * 2. **PNG はバイナリなので差分を目で読めない**。参照先を書き換えたのに
 *    ファイルを置き忘れた、という壊し方は、レビューでは見つけられない
 *
 * PNG そのものは `scripts/build-icons.mjs` が SVG から作る。
 * ここでは「参照されているものが全部あり、PNG として読める大きさで入っている」
 * ところまでを見る。
 */

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const indexHtml = readFileSync(join(publicDir, "..", "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8")) as {
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};

/** PNG の先頭から幅と高さを読む(IHDR は必ず先頭のチャンク) */
function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(0, 8).equals(signature)).toBe(true);
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("ホーム画面のアイコン", () => {
  it("iOS 向けの apple-touch-icon が PNG で指定されている", () => {
    // SVG を指定しても iOS Safari は読まず、ページの縮小画像が代わりに使われる
    const match = indexHtml.match(/<link rel="apple-touch-icon"[^>]*href="([^"]+)"/);
    expect(match?.[1]).toBeDefined();
    expect(match?.[1]).toMatch(/\.png$/);
  });

  it.each([
    ["apple-touch-icon-180.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
  ])("%s が PNG として読めて %d 角である", (name, size) => {
    expect(pngSize(readFileSync(join(publicDir, name)))).toEqual({
      width: size,
      height: size,
    });
  });

  it("manifest には PNG のアイコンがある(SVG だけにしない)", () => {
    const png = manifest.icons.filter((icon) => icon.type === "image/png");
    expect(png.length).toBeGreaterThan(0);
    expect(png.map((icon) => icon.purpose)).toContain("maskable");
  });

  it("manifest が指すファイルは全部置いてある", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(() => readFileSync(join(publicDir, icon.src.slice(1)))).not.toThrow();
    }
  });

  it("index.html が指すアイコンも全部置いてある", () => {
    const refs = [...indexHtml.matchAll(/(?:href|content)="(\/[^"]+\.(?:png|svg|webmanifest))"/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, path] of refs) {
      expect(() => readFileSync(join(publicDir, (path as string).slice(1)))).not.toThrow();
    }
  });
});

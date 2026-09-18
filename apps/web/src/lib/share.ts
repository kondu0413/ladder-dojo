import { type Circuit, circuitSchema, type Element, SCHEMA_VERSION } from "@ladder-dojo/core";

/**
 * 回路の共有リンク(S-039)。
 *
 * サーバーに保存せず、URL のハッシュ(`#c=...`)に回路そのものを載せる。
 * - ログインしていなくても共有できる(保存は本人のみ・ログイン必須。§3.4)
 * - ハッシュはサーバーに送られないので、通信量もストレージも使わない(0 円)
 * - 受け取った側は開くだけ。壊れたリンクは黙って無視して空の回路にする
 *
 * 形式: `v1.<cols>.<rows>.<cell>;<cell>;...`
 * cell: `<row>,<col>,<code>[,<device>][,<preset>][,v]`
 * code: w 横線 / a a接点 / b b接点 / r 立上り / f 立下り / o 出力 / e SET / p PLS /
 *       t タイマ / d オフディレイ / c カウンタ / s RST
 *       `-` は要素なし(縦線だけのマス)。末尾の `v` は下への縦線。
 * 使う文字は英数字と `. , ; -` だけなので、URL のハッシュにそのまま書ける。
 */

const FORMAT = "v1";

const CODE_OF: Record<string, string> = {
  wire: "w",
  "contact:no": "a",
  "contact:nc": "b",
  "contact:rise": "r",
  "contact:fall": "f",
  "coil:out": "o",
  "coil:set": "e",
  "coil:pulse": "p",
  "coil:timer": "t",
  "coil:offdelay": "d",
  "coil:counter": "c",
  "coil:reset": "s",
};

function keyOf(el: Element): string {
  if (el.type === "wire") return "wire";
  return `${el.type}:${el.kind}`;
}

/** 回路を短い文字列にする */
export function encodeCircuit(circuit: Circuit): string {
  const cells = circuit.cells
    .filter((c) => c.element || c.vline)
    .map((c) => {
      const fields: (string | number)[] = [c.row, c.col];
      const el = c.element;
      if (!el) {
        fields.push("-");
      } else {
        fields.push(CODE_OF[keyOf(el)] ?? "-");
        if (el.type !== "wire") fields.push(el.device);
        if (el.type === "coil" && (el.kind === "timer" || el.kind === "offdelay")) {
          fields.push(el.presetMs);
        }
        if (el.type === "coil" && el.kind === "counter") fields.push(el.preset);
      }
      if (c.vline) fields.push("v");
      return fields.join(",");
    });
  return [FORMAT, circuit.cols, circuit.rows, cells.join(";")].join(".");
}

/** 文字列から回路に戻す。形式が違う・検証に落ちるときは undefined */
export function decodeCircuit(text: string): Circuit | undefined {
  const [format, colsText, rowsText, body, ...rest] = text.split(".");
  if (format !== FORMAT || rest.length > 0 || colsText === undefined || rowsText === undefined) {
    return undefined;
  }
  const cols = toInt(colsText);
  const rows = toInt(rowsText);
  if (cols === undefined || rows === undefined) return undefined;

  // マスは緩く組み立てて、最後にスキーマでまとめて検証する
  // (デバイス名・設定値の範囲・コイルの位置などはスキーマが見る)
  const cells: unknown[] = [];
  for (const item of (body ?? "").split(";")) {
    if (item === "") continue;
    const cell = decodeCell(item);
    if (!cell) return undefined;
    cells.push(cell);
  }
  const parsed = circuitSchema.safeParse({ schemaVersion: SCHEMA_VERSION, cols, rows, cells });
  return parsed.success ? parsed.data : undefined;
}

const KIND_OF: Record<string, { type: "contact" | "coil"; kind: string }> = {
  a: { type: "contact", kind: "no" },
  b: { type: "contact", kind: "nc" },
  r: { type: "contact", kind: "rise" },
  f: { type: "contact", kind: "fall" },
  o: { type: "coil", kind: "out" },
  e: { type: "coil", kind: "set" },
  p: { type: "coil", kind: "pulse" },
  s: { type: "coil", kind: "reset" },
  t: { type: "coil", kind: "timer" },
  d: { type: "coil", kind: "offdelay" },
  c: { type: "coil", kind: "counter" },
};

function decodeCell(item: string): Record<string, unknown> | undefined {
  const fields = item.split(",");
  const row = toInt(fields[0] ?? "");
  const col = toInt(fields[1] ?? "");
  const code = fields[2];
  if (row === undefined || col === undefined || code === undefined) return undefined;

  let index = 3;
  let element: Record<string, unknown> | undefined;
  if (code === "w") {
    element = { type: "wire" };
  } else if (code !== "-") {
    const known = KIND_OF[code];
    if (!known) return undefined;
    const device = fields[index++];
    if (!device) return undefined;
    element = { type: known.type, kind: known.kind, device };
    if (code === "t" || code === "d" || code === "c") {
      const preset = toInt(fields[index++] ?? "");
      if (preset === undefined) return undefined;
      element[code === "c" ? "preset" : "presetMs"] = preset;
    }
  }

  const cell: Record<string, unknown> = { row, col };
  if (element) cell.element = element;
  if (fields[index] === "v") {
    cell.vline = true;
    index++;
  }
  if (index !== fields.length) return undefined;
  return cell;
}

function toInt(text: string): number | undefined {
  return /^\d{1,6}$/.test(text) ? Number(text) : undefined;
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/** 共有リンクを作る。`origin` は省略すると今のページのもの */
export function shareUrl(
  circuit: Circuit,
  title?: string,
  origin = window.location.origin,
): string {
  const params = [`c=${encodeCircuit(circuit)}`];
  const t = title?.trim();
  if (t) params.push(`t=${encodeURIComponent(t.slice(0, 100))}`);
  return `${origin}/sandbox#${params.join("&")}`;
}

/** URL のハッシュから共有された回路を読む。無ければ undefined */
export function readSharedCircuit(
  hash: string,
): { circuit: Circuit; title: string | undefined } | undefined {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!body) return undefined;
  let encoded: string | undefined;
  let title: string | undefined;
  for (const part of body.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "c") encoded = value;
    if (key === "t") {
      try {
        title = decodeURIComponent(value).slice(0, 100);
      } catch {
        title = undefined;
      }
    }
  }
  if (!encoded) return undefined;
  const circuit = decodeCircuit(encoded);
  return circuit ? { circuit, title } : undefined;
}

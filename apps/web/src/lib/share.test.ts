import {
  counter,
  fall,
  ladder,
  nc,
  no,
  out,
  pulse,
  reset,
  rise,
  set,
  timer,
  tof,
  wire,
} from "@ladder-dojo/core";
import { describe, expect, it } from "vitest";
import { decodeCircuit, encodeCircuit, readSharedCircuit, shareUrl } from "./share.js";

describe("回路の共有リンク(S-039)", () => {
  const circuit = ladder(6)
    .row(no("X0"), nc("X1"), wire, wire, wire, out("Y0"))
    .row(no("Y0"))
    .row(rise("X2"), wire, wire, wire, wire, timer("T0", 3000))
    .row(no("T0"), wire, wire, wire, wire, counter("C0", 3))
    .row(no("C0"), wire, wire, wire, wire, reset("C0"))
    .row(no("X3"), wire, wire, wire, wire, pulse("M0"))
    .row(fall("X4"), wire, wire, wire, wire, set("M1"))
    .row(no("M1"), wire, wire, wire, wire, tof("T1", 500))
    .row(no("X5"), wire, wire, wire, wire, reset("M1"))
    .v(0, 0)
    .build();

  it("すべての部品と縦線が往復で失われない", () => {
    const text = encodeCircuit(circuit);
    expect(text.startsWith("v1.6.9.")).toBe(true);
    // URL のハッシュにそのまま書ける文字だけを使う
    expect(text).toMatch(/^[A-Za-z0-9.,;-]+$/);
    expect(decodeCircuit(text)).toEqual(circuit);
  });

  it("空の回路も往復できる", () => {
    const empty = ladder(4).build();
    expect(decodeCircuit(encodeCircuit(empty))).toEqual(empty);
  });

  it.each([
    "",
    "v2.6.3.",
    "v1.6",
    "v1.x.3.",
    "v1.6.3.0,0,q,X0",
    "v1.6.3.0,0,a",
    "v1.6.3.0,0,a,Z0",
    "v1.6.3.0,0,o,Y0",
    "v1.6.3.0,0,t,T0",
    "v1.6.3.0,0,a,X0,zz",
    "v1.6.3.9,0,a,X0",
    "v1.6.3.0,0,a,X0.extra",
  ])("壊れた文字列 %j は undefined", (text) => {
    expect(decodeCircuit(text)).toBeUndefined();
  });

  it("URL のハッシュに回路と名前を載せて、読み戻せる", () => {
    const url = shareUrl(circuit, "  自己保持の例  ", "https://example.test");
    expect(url.startsWith("https://example.test/sandbox#c=v1.6.9.")).toBe(true);
    const hash = url.slice(url.indexOf("#"));
    const shared = readSharedCircuit(hash);
    expect(shared?.circuit).toEqual(circuit);
    expect(shared?.title).toBe("自己保持の例");
  });

  it("名前が無ければ載せない。回路が無ければ何も返さない", () => {
    const url = shareUrl(circuit, "", "https://example.test");
    expect(url).not.toContain("&t=");
    expect(readSharedCircuit("")).toBeUndefined();
    expect(readSharedCircuit("#t=x")).toBeUndefined();
    expect(readSharedCircuit("#c=broken")).toBeUndefined();
  });
});

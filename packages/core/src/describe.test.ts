import { describe, expect, it } from "vitest";
import {
  counter,
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
} from "./builder.js";
import { describeCircuit, describeRow } from "./describe.js";
import { Simulator } from "./sim/simulator.js";

/**
 * ラダー図の読み上げ(改善候補 14 / S-018)。
 *
 * SVG は線と丸の集まりなので、そのままでは「ラダー図」としか伝わらない。
 * ここで作る文章が、目で見ない人にとっての回路そのものになる。
 */

describe("1 行ぶんの読み上げ", () => {
  it("接点とコイルを左から順に読む", () => {
    const circuit = ladder(4).row(no("X0"), out("Y0")).build();
    expect(describeRow(circuit, 0)).toBe("1 行目、X0 の a 接点、Y0 の出力コイル");
  });

  it("接点の種類を言い分ける", () => {
    const circuit = ladder(5).row(no("X0"), nc("X1"), rise("X2"), out("Y0")).build();
    expect(describeRow(circuit, 0)).toBe(
      "1 行目、X0 の a 接点、X1 の b 接点、X2 の立ち上がり接点、Y0 の出力コイル",
    );
  });

  describe("コイルの種類と設定値", () => {
    it("タイマは設定の秒数を言う", () => {
      const circuit = ladder(3).row(no("X0"), timer("T0", 3000)).build();
      expect(describeRow(circuit, 0)).toContain("T0 のタイマコイル、設定 3 秒");
    });

    it("端数のある秒数も読める形にする", () => {
      const circuit = ladder(3).row(no("X0"), timer("T0", 1500)).build();
      expect(describeRow(circuit, 0)).toContain("設定 1.5 秒");
    });

    it("カウンタは設定の回数を言う", () => {
      const circuit = ladder(3).row(no("X0"), counter("C0", 5)).build();
      expect(describeRow(circuit, 0)).toContain("C0 のカウンタコイル、設定 5 回");
    });

    it.each([
      [pulse("M0"), "M0 の立ち上がり微分コイル"],
      [reset("C0"), "C0 のリセットコイル"],
      [set("Y0"), "Y0 のセットコイル"],
      [tof("T0", 1500), "T0 のオフディレイタイマコイル、設定 1.5 秒"],
    ])("%o を読む", (coil, expected) => {
      const circuit = ladder(3).row(no("X0"), coil).build();
      expect(describeRow(circuit, 0)).toContain(expected);
    });
  });

  it("**配線そのものは読まない**(順番で分かるし、挟まると聞き取りにくい)", () => {
    const circuit = ladder(5).row(no("X0"), wire, wire, out("Y0")).build();
    expect(describeRow(circuit, 0)).toBe("1 行目、X0 の a 接点、Y0 の出力コイル");
  });

  it("**分岐は読む**(並列は回路の意味そのもの)", () => {
    const circuit = ladder(4).row(no("X0"), out("Y0")).row(no("Y0")).v(0, 0).build();
    expect(describeRow(circuit, 0)).toContain("ここから 2 行目へ分岐");
  });

  it("空の行は「何も置かれていません」と言う(黙って飛ばすと何行目か分からなくなる)", () => {
    const circuit = ladder(4).row(no("X0"), out("Y0")).row().build();
    expect(describeRow(circuit, 1)).toBe("2 行目、何も置かれていません");
  });

  it("デバイスの説明があれば添える", () => {
    const circuit = ladder(4).row(no("X0"), out("Y0")).build();
    expect(describeRow(circuit, 0, { deviceLabels: { X0: "起動ボタン", Y0: "ランプ" } })).toBe(
      "1 行目、X0(起動ボタン)の a 接点、Y0(ランプ)の出力コイル",
    );
  });
});

describe("回路全体の読み上げ", () => {
  it("大きさを先に言ってから、行を順に読む", () => {
    const circuit = ladder(4).row(no("X0"), out("Y0")).row(nc("X1"), out("Y1")).build();
    expect(describeCircuit(circuit)).toBe(
      "2 行 4 列のラダー図。1 行目、X0 の a 接点、Y0 の出力コイル。2 行目、X1 の b 接点、Y1 の出力コイル",
    );
  });

  it("行がすべて読まれる(取りこぼさない)", () => {
    const circuit = ladder(4)
      .row(no("X0"), out("Y0"))
      .row(no("X1"), out("Y1"))
      .row(no("X2"), out("Y2"))
      .build();
    const text = describeCircuit(circuit);
    for (const head of ["1 行目", "2 行目", "3 行目"]) {
      expect(text).toContain(head);
    }
  });
});

describe("動かしているときの通電状態", () => {
  /** 自己保持: X0 で起動、X1 で停止 */
  function selfHold() {
    return ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
  }

  it("止まっているときは通電のことを言わない(編集中に読み上げても意味が無い)", () => {
    const text = describeRow(selfHold(), 0);
    expect(text).not.toContain("通電中");
    expect(text).not.toContain("無電圧");
  });

  it("電流が流れている行は「通電中」と言う", () => {
    const sim = new Simulator(selfHold());
    sim.scan(0);
    sim.setInput("X0", true);
    const power = sim.scan(0);

    expect(describeRow(selfHold(), 0, { power })).toContain("通電中");
  });

  it("流れていない行は「無電圧」と言う", () => {
    const sim = new Simulator(selfHold());
    const power = sim.scan(0);
    expect(describeRow(selfHold(), 0, { power })).toContain("無電圧");
  });
});

/**
 * 読み上げも表記に従う(S-028)。
 * 図だけ切り替えて読み上げが元のままだと、目で見ない人に別の回路が伝わる。
 */
describe("表記の切り替え", () => {
  const circuit = ladder(4).row(no("X0"), counter("C0", 5)).row(no("C0"), out("Y0")).build();

  it("既定(三菱系)はデバイス名をそのまま読む", () => {
    expect(describeRow(circuit, 0)).toContain("X0 の a 接点");
    expect(describeRow(circuit, 1)).toContain("Y0 の出力コイル");
  });

  it("オムロン系ではワード.ビットで読む", () => {
    const text = describeRow(circuit, 0, { notation: "omron" });
    expect(text).toContain("0.00 の a 接点");
    expect(text).toContain("C0000 のカウンタコイル");
    expect(text).not.toContain("X0");
  });

  it("説明付きでも表記が効く", () => {
    const text = describeRow(circuit, 1, {
      notation: "omron",
      deviceLabels: { Y0: "ランプ" },
    });
    expect(text).toContain("100.00(ランプ)の出力コイル");
  });

  it("IEC はデバイス名を変えない", () => {
    expect(describeRow(circuit, 0, { notation: "iec" })).toContain("X0 の a 接点");
  });

  it("回路全体の読み上げにも表記が伝わる", () => {
    expect(describeCircuit(circuit, { notation: "omron" })).toContain("100.00");
  });
});

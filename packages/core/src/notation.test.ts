import { describe, expect, it } from "vitest";
import {
  formatCounterPreset,
  formatDevice,
  formatDeviceNames,
  formatTimerPreset,
  NOTATIONS,
  risingMark,
} from "./notation.js";

describe("表記の切り替え(S-028)", () => {
  it("三菱系はデバイス名を変えない", () => {
    expect(formatDevice("X0", "mitsubishi")).toBe("X0");
    expect(formatDevice("Y12", "mitsubishi")).toBe("Y12");
    expect(formatDeviceNames("X0 を押すと Y0 が点く", "mitsubishi")).toBe("X0 を押すと Y0 が点く");
  });

  it("IEC でもデバイス名は変えない(規格が名前の付け方を決めていない)", () => {
    expect(formatDevice("X0", "iec")).toBe("X0");
    expect(formatDeviceNames("X0 を押す", "iec")).toBe("X0 を押す");
  });

  describe("オムロン系(ワード.ビット形式)", () => {
    it("入力は 0 ワード目、出力は 100 ワード目から割り付ける", () => {
      expect(formatDevice("X0", "omron")).toBe("0.00");
      expect(formatDevice("X4", "omron")).toBe("0.04");
      expect(formatDevice("Y0", "omron")).toBe("100.00");
      expect(formatDevice("Y1", "omron")).toBe("100.01");
    });

    it("16 点で 1 ワード繰り上がる", () => {
      expect(formatDevice("X15", "omron")).toBe("0.15");
      expect(formatDevice("X16", "omron")).toBe("1.00");
      expect(formatDevice("Y16", "omron")).toBe("101.00");
    });

    it("内部リレーは W、タイマとカウンタは 4 桁", () => {
      expect(formatDevice("M0", "omron")).toBe("W0.00");
      expect(formatDevice("T0", "omron")).toBe("T0000");
      expect(formatDevice("C12", "omron")).toBe("C0012");
    });

    it("文章の中のデバイス名も置き換える", () => {
      expect(
        formatDeviceNames("起動ボタン X0 と停止ボタン X1 でランプ Y0 を制御する", "omron"),
      ).toBe("起動ボタン 0.00 と停止ボタン 0.01 でランプ 100.00 を制御する");
    });

    it("日本語に直接くっついていても置き換える", () => {
      expect(formatDeviceNames("ランプY0が点く", "omron")).toBe("ランプ100.00が点く");
    });

    it("デバイス名に見えない語は触らない", () => {
      // 4 桁以上の番号、英字が続く語、単なる英単語
      expect(formatDeviceNames("X1000 と CPU と TEXT", "omron")).toBe("X1000 と CPU と TEXT");
    });
  });

  describe("設定値の書き方", () => {
    it("タイマ", () => {
      expect(formatTimerPreset(3000, "mitsubishi")).toBe("K30"); // 0.1 秒を 1 として数える
      expect(formatTimerPreset(3000, "omron")).toBe("#0030"); // 0.1 秒を 1 として数える
      expect(formatTimerPreset(3000, "iec")).toBe("PT 3.0s");
    });

    it("カウンタ", () => {
      expect(formatCounterPreset(5, "mitsubishi")).toBe("K5");
      expect(formatCounterPreset(5, "omron")).toBe("#0005");
      expect(formatCounterPreset(5, "iec")).toBe("PV 5");
    });
  });

  it("立ち上がり接点は IEC だけ P、ほかは ↑", () => {
    expect(risingMark("iec")).toBe("P");
    expect(risingMark("mitsubishi")).toBe("↑");
    expect(risingMark("omron")).toBe("↑");
  });

  it("どの表記でもデバイス名が空にならない", () => {
    for (const notation of NOTATIONS) {
      for (const id of ["X0", "Y0", "M0", "T0", "C0"] as const) {
        expect(formatDevice(id, notation)).not.toBe("");
      }
    }
  });
});

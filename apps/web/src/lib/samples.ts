import { type Circuit, counter, ladder, nc, no, out, reset, rise, timer } from "@ladder-dojo/core";

export type Sample = {
  id: string;
  title: string;
  description: string;
  circuit: Circuit;
  deviceLabels: Record<string, string>;
};

/** 動作確認用のサンプル回路(公式問題を作るまでの仮置き) */
export const SAMPLES: Sample[] = [
  {
    id: "selfhold",
    title: "自己保持",
    description: "X0 を押すと Y0 が点灯し、離しても点いたまま。X1 で消灯する。",
    circuit: ladder(5).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build(),
    deviceLabels: { X0: "起動", X1: "停止", Y0: "ランプ" },
  },
  {
    id: "timer",
    title: "オンディレイタイマ",
    description: "X0 を押すと Y0 が点灯し、3 秒後に自動で消灯する。",
    circuit: ladder(5)
      .row(no("X0"), nc("T0"), out("Y0"))
      .row(no("Y0"))
      .v(0, 0)
      .row(no("Y0"), timer("T0", 3000))
      .build(),
    deviceLabels: { X0: "起動", Y0: "ランプ", T0: "3秒" },
  },
  {
    id: "counter",
    title: "カウンタ",
    description: "X0 を 3 回押すと Y0 が点灯する。X1 でリセット。",
    circuit: ladder(4)
      .row(no("X0"), counter("C0", 3))
      .row(no("X1"), reset("C0"))
      .row(no("C0"), out("Y0"))
      .build(),
    deviceLabels: { X0: "カウント", X1: "リセット", Y0: "完了ランプ" },
  },
  {
    id: "interlock",
    title: "インターロック",
    description: "正転 Y0 と逆転 Y1 は同時に入らない。先に押した方が優先される。",
    circuit: ladder(6)
      .row(no("X0"), nc("Y1"), nc("X2"), out("Y0"))
      .row(no("Y0"))
      .v(0, 0)
      .row(no("X1"), nc("Y0"), nc("X2"), out("Y1"))
      .row(no("Y1"))
      .v(2, 0)
      .build(),
    deviceLabels: { X0: "正転", X1: "逆転", X2: "停止", Y0: "正転出力", Y1: "逆転出力" },
  },
  {
    id: "pulse",
    title: "立ち上がり微分",
    description: "X0 を押し続けても、Y0 は押した瞬間の 1 スキャンだけ動く。",
    circuit: ladder(4).row(rise("X0"), out("M0")).row(no("M0"), out("Y0")).build(),
    deviceLabels: { X0: "ボタン", M0: "パルス", Y0: "出力" },
  },
];

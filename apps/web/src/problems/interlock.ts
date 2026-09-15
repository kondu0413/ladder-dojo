import { ladder, nc, no, out, type Problem, SCHEMA_VERSION } from "@ladder-dojo/core";

const LABELS = {
  X0: "正転ボタン",
  X1: "逆転ボタン",
  X2: "停止ボタン",
  X3: "上限リミット",
  X4: "下限リミット",
  Y0: "正転出力",
  Y1: "逆転出力",
} as const;

/** 正転 Y0 と逆転 Y1 の相互インターロック。X2 で停止 */
const basic = ladder(6)
  .row(no("X0"), nc("Y1"), nc("X2"), out("Y0"))
  .row(no("Y0"))
  .row(no("X1"), nc("Y0"), nc("X2"), out("Y1"))
  .row(no("Y1"))
  .v(0, 0)
  .v(2, 0)
  .build();

/** 相互インターロックにリミットスイッチを足したもの(上昇 Y0 / 下降 Y1) */
const withLimits = ladder(7)
  .row(no("X0"), nc("Y1"), nc("X3"), nc("X2"), out("Y0"))
  .row(no("Y0"))
  .row(no("X1"), nc("Y0"), nc("X4"), nc("X2"), out("Y1"))
  .row(no("Y1"))
  .v(0, 0)
  .v(2, 0)
  .build();

const basicCases = [
  {
    id: "initial",
    title: "最初はどちらも止まっている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, Y1: false } }],
  },
  {
    id: "forward",
    title: "正転ボタンで正転する",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
  {
    id: "reverse",
    title: "逆転ボタンで逆転する",
    steps: [
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: true } },
    ],
  },
  {
    id: "interlock-forward",
    title: "正転中に逆転ボタンを押しても切り替わらない",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      {
        type: "expect" as const,
        outputs: { Y0: true, Y1: false },
        note: "同時に入らないようにするのがインターロック",
      },
    ],
  },
  {
    id: "interlock-reverse",
    title: "逆転中に正転ボタンを押しても切り替わらない",
    steps: [
      { type: "press" as const, device: "X1" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: true } },
    ],
  },
  {
    id: "stop-forward",
    title: "停止ボタンで正転が止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X2" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false } },
    ],
  },
  {
    id: "switch-after-stop",
    title: "一度止めれば逆方向に切り替えられる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X2" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: true } },
    ],
  },
];

const limitCases = [
  {
    id: "up",
    title: "上昇できる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
  {
    id: "upper-limit-stops",
    title: "上限リミットに当たると上昇が止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "set" as const, inputs: { X3: true } },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "upper-limit-blocks",
    title: "上限リミットが効いている間は上昇できない",
    steps: [
      { type: "set" as const, inputs: { X3: true } },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "down-at-upper-limit",
    title: "上限に当たっていても下降はできる",
    steps: [
      { type: "set" as const, inputs: { X3: true } },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y1: true, Y0: false } },
    ],
  },
  {
    id: "lower-limit-stops",
    title: "下限リミットに当たると下降が止まる",
    steps: [
      { type: "press" as const, device: "X1" as const },
      { type: "set" as const, inputs: { X4: true } },
      { type: "expect" as const, outputs: { Y1: false } },
    ],
  },
  {
    id: "interlock",
    title: "上昇中に下降ボタンを押しても切り替わらない",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
  {
    id: "stop",
    title: "停止ボタンで両方止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X2" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false } },
    ],
  },
];

export const interlockProblems: Problem[] = [
  {
    schemaVersion: SCHEMA_VERSION,
    id: "interlock-read-1",
    title: "動作中に反対のボタンを押すと?",
    mode: "read",
    stage: "interlock",
    difficulty: 3,
    tags: ["インターロック", "自己保持"],
    spec: "正転 X0・逆転 X1・停止 X2 でモータの向きを制御する回路です。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases.slice(0, 5),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "正転中(Y0 点灯)に逆転ボタン X1 を押すと、どうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X1" },
          ],
          choices: ["逆転に切り替わる", "正転のまま。逆転は入らない", "両方とも入って短絡する"],
          answerIndex: 1,
          explanation:
            "逆転のラングには Y0 の b 接点が入っています。正転出力が入っている間は逆転側の回路が切れているため、切り替わりません。",
        },
        {
          id: "q2",
          prompt: "逆転に切り替えたいときは、どうすればよいですか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X2" },
            { type: "press", device: "X1" },
          ],
          choices: [
            "停止ボタン X2 でいったん止めてから逆転ボタンを押す",
            "逆転ボタンを長く押す",
            "正転ボタンと逆転ボタンを同時に押す",
          ],
          answerIndex: 0,
          explanation:
            "インターロックは「両方が同時に入らない」ためのものです。一度止めれば相手側の b 接点が閉じ、切り替えられます。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "interlock-read-2",
    title: "リミットスイッチの効き方",
    mode: "read",
    stage: "interlock",
    difficulty: 3,
    tags: ["インターロック", "リミットスイッチ"],
    spec: "昇降装置の回路です。上昇 X0・下降 X1・停止 X2 に加え、上限リミット X3 と下限リミット X4 があります。",
    deviceLabels: LABELS,
    solution: withLimits,
    testCases: limitCases.slice(0, 5),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "上昇中に上限リミット X3 が ON になると、どうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "set", inputs: { X3: true } },
          ],
          choices: ["上昇が止まる", "下降に切り替わる", "そのまま上昇し続ける"],
          answerIndex: 0,
          explanation:
            "上昇のラングに X3 の b 接点が直列に入っているため、回路が切れて止まります。",
        },
        {
          id: "q2",
          prompt: "上限リミット X3 が ON のまま、下降ボタン X1 を押すとどうなりますか?",
          scenario: [
            { type: "set", inputs: { X3: true } },
            { type: "press", device: "X1" },
          ],
          choices: ["下降できる", "下降もできない"],
          answerIndex: 0,
          explanation:
            "X3 は上昇のラングにしか入っていません。上限に当たっていても、逃げる方向(下降)には動けるようにします。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "interlock-fix-1",
    title: "両方が同時に入ってしまう",
    mode: "fix",
    stage: "interlock",
    difficulty: 3,
    tags: ["インターロック"],
    spec: "正転 Y0 と逆転 Y1 は同時に入ってはいけません。いまは正転中に逆転ボタンを押すと両方入ってしまいます。直してください。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases,
    fix: {
      initial: ladder(6)
        .row(no("X0"), nc("Y1"), nc("X2"), out("Y0"))
        .row(no("Y0"))
        .row(no("X1"), nc("X2"), out("Y1"))
        .row(no("Y1"))
        .v(0, 0)
        .v(2, 0)
        .build(),
      bugCount: 1,
      hint: "逆転のラングに、相手(正転出力)の b 接点が入っていません。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "interlock-fix-2",
    title: "上限に当たっても止まらない",
    mode: "fix",
    stage: "interlock",
    difficulty: 4,
    tags: ["インターロック", "リミットスイッチ"],
    spec: "昇降装置の回路です。上限リミット X3 が ON になったら上昇 Y0 が止まり、下限リミット X4 が ON になったら下降 Y1 が止まるはずです。いまは上限に当たっても上昇が止まりません。直してください。",
    deviceLabels: LABELS,
    solution: withLimits,
    testCases: limitCases,
    fix: {
      initial: ladder(7)
        .row(no("X0"), nc("Y1"), nc("X2"), out("Y0"))
        .row(no("Y0"))
        .row(no("X1"), nc("Y0"), nc("X4"), nc("X2"), out("Y1"))
        .row(no("Y1"))
        .v(0, 0)
        .v(2, 0)
        .build(),
      bugCount: 1,
      hint: "上昇のラングに上限リミットの b 接点が入っていません。下降のラングと見比べてください。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "interlock-write-1",
    title: "正逆運転のインターロックを作る",
    mode: "write",
    stage: "interlock",
    difficulty: 4,
    tags: ["インターロック", "自己保持"],
    spec: "正転ボタン X0 を押すと正転出力 Y0 が入り、離しても運転を続ける。逆転ボタン X1 を押すと逆転出力 Y1 が入り、同じく運転を続ける。停止ボタン X2 でどちらも止まる。Y0 と Y1 は絶対に同時に入ってはならず、運転中に反対のボタンを押しても切り替わらない(いったん停止してから切り替える)。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases,
    write: {
      hint: "自己保持を 2 組作り、それぞれのラングに相手の出力の b 接点を直列に入れます。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "interlock-write-2",
    title: "リミットスイッチつきの昇降回路",
    mode: "write",
    stage: "interlock",
    difficulty: 5,
    tags: ["インターロック", "リミットスイッチ"],
    spec: "上昇ボタン X0 で上昇出力 Y0、下降ボタン X1 で下降出力 Y1 が入り、離しても動き続ける。停止ボタン X2 で両方止まる。Y0 と Y1 は同時に入らない。さらに、上限リミット X3 が ON の間は上昇できず(上昇中なら止まる)、下限リミット X4 が ON の間は下降できない。上限に当たっていても下降はできること。",
    deviceLabels: LABELS,
    solution: withLimits,
    testCases: limitCases,
    write: {
      hint: "リミットの b 接点は、止めたい方向のラングにだけ入れます。両方に入れると逃げられなくなります。",
    },
  },
];

import {
  counter,
  ladder,
  nc,
  no,
  out,
  type Problem,
  reset,
  rise,
  SCHEMA_VERSION,
  timer,
  wire,
} from "@ladder-dojo/core";

const LABELS = {
  X0: "起動",
  X1: "停止",
  X2: "センサ",
  Y0: "運転出力",
  Y1: "警告灯",
  T0: "タイマ",
  C0: "カウンタ",
  M0: "起動パルス",
} as const;

/** 自己保持した運転出力から、2 つめの出力を取り出すだけの組み合わせ */
const runAndLamp = ladder(4)
  .row(no("X0"), nc("X1"), out("Y0"))
  .row(no("Y0"))
  .row(no("Y0"), wire, out("Y1"))
  .v(0, 0)
  .build();

const runAndLampCases = [
  {
    id: "initial",
    title: "最初はどちらも消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, Y1: false } }],
  },
  {
    id: "start",
    title: "起動すると両方点く",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: true } },
    ],
  },
  {
    id: "held",
    title: "離しても両方点いたまま",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 500 },
      { type: "expect" as const, outputs: { Y0: true, Y1: true } },
    ],
  },
  {
    id: "stop",
    title: "停止すると両方消える",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false } },
    ],
  },
];

/** 運転開始から 5 秒後に警告灯が点く。X1 で全停止 */
const warnAfter5 = ladder(5)
  .row(no("X0"), nc("X1"), out("Y0"))
  .row(no("Y0"))
  .row(no("Y0"), timer("T0", 5000))
  .row(no("T0"), out("Y1"))
  .v(0, 0)
  .build();

/** センサ 3 回で運転開始、2 秒後に自動停止してカウンタもリセット */
const countThenTimeout = ladder(4)
  .row(no("X2"), counter("C0", 3))
  .row(no("C0"), out("Y0"))
  .row(no("C0"), timer("T0", 2000))
  .row(no("T0"), reset("C0"))
  .build();

/**
 * 押しボタン 1 つで運転と停止を交互に切り替える(オルタネート)。
 * Y0 = (M0 かつ Y0 でない) または (M0 でない かつ Y0) = M0 と Y0 の排他和。
 * M0 は立ち上がりで 1 スキャンだけ ON になるので、押すたびに 1 回だけ反転する。
 */
const alternate = ladder(4)
  .row(rise("X0"), out("M0"))
  .row(no("M0"), nc("Y0"), out("Y0"))
  .row(nc("M0"), no("Y0"))
  .v(1, 1)
  .build();

const warnCases = [
  {
    id: "initial",
    title: "最初はどちらも消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, Y1: false } }],
  },
  {
    id: "start",
    title: "起動すると運転出力だけ入る",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
  {
    id: "before-warn",
    title: "4 秒ではまだ警告灯は点かない",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 4000 },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
  {
    id: "warn",
    title: "5 秒で警告灯が点く",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 5100 },
      { type: "expect" as const, outputs: { Y0: true, Y1: true } },
    ],
  },
  {
    id: "stop-all",
    title: "停止すると両方消える",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 5100 },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false } },
    ],
  },
  {
    id: "restart-resets-timer",
    title: "止めて再起動するとタイマも数え直す",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 4000 },
      { type: "press" as const, device: "X1" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 2000 },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
];

const pressX2 = (times: number) =>
  Array.from({ length: times }, () => ({ type: "press" as const, device: "X2" as const }));

const countTimeoutCases = [
  {
    id: "initial",
    title: "最初は止まっている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, C0: false } }],
  },
  {
    id: "two",
    title: "2 回では動かない",
    steps: [...pressX2(2), { type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "three",
    title: "3 回で動き出す",
    steps: [...pressX2(3), { type: "expect" as const, outputs: { Y0: true, C0: true } }],
  },
  {
    id: "still-running",
    title: "1 秒後はまだ動いている",
    steps: [
      ...pressX2(3),
      { type: "wait" as const, ms: 1000 },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "auto-stop",
    title: "2 秒後に自動で止まり、カウンタも戻る",
    steps: [
      ...pressX2(3),
      { type: "wait" as const, ms: 2200 },
      {
        type: "expect" as const,
        outputs: { Y0: false, C0: false },
        note: "タイマでカウンタをリセットするので次のサイクルに入れる",
      },
    ],
  },
  {
    id: "next-cycle",
    title: "止まったあと、もう一度 3 回で動く",
    steps: [
      ...pressX2(3),
      { type: "wait" as const, ms: 2200 },
      { type: "expect" as const, outputs: { Y0: false } },
      ...pressX2(3),
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
];

const alternateCases = [
  {
    id: "initial",
    title: "最初は止まっている",
    steps: [{ type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "first-press",
    title: "1 回目の押下で動き出す",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "second-press",
    title: "2 回目の押下で止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "third-press",
    title: "3 回目でまた動き出す",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "hold",
    title: "押しっぱなしにしても切り替わり続けない",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 1000 },
      { type: "expect" as const, outputs: { Y0: true }, note: "立ち上がりでしか反応しない" },
    ],
  },
];

/**
 * 順序起動。1 号機 Y0 が動いていないと 2 号機 Y1 を起動できない。
 * 2 号機の枝は「起動ボタン or 自己保持」の**あとに** 1 号機の a 接点が入るので、
 * 1 号機が止まれば 2 号機も止まる
 */
const sequence = ladder(6)
  .row(no("X0"), nc("X2"), out("Y0"))
  .row(no("Y0"))
  .v(0, 0)
  .row(no("X1"), no("Y0"), nc("X2"), out("Y1"))
  .row(no("Y1"))
  .v(2, 0)
  .build();

const sequenceCases = [
  {
    id: "initial",
    title: "最初はどちらも止まっている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, Y1: false } }],
  },
  {
    id: "second-alone",
    title: "1 号機が止まっているときは 2 号機を起動できない",
    steps: [
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false } },
    ],
  },
  {
    id: "in-order",
    title: "1 号機を起動してからなら 2 号機も起動できる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: true } },
    ],
  },
  {
    id: "stop-both",
    title: "停止で両方止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "press" as const, device: "X2" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false } },
    ],
  },
];

/** 運転中だけ警告灯が 1 秒ごとに点滅する */
const runningFlicker = ladder(6)
  .row(no("X0"), nc("X1"), out("Y0"))
  .row(no("Y0"))
  .v(0, 0)
  .row(no("Y0"), nc("T1"), timer("T0", 1000))
  .row(no("T0"), timer("T1", 1000))
  .row(no("T0"), out("Y1"))
  .build();

const runningFlickerCases = [
  {
    id: "initial",
    title: "止まっているときは警告灯も消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, Y1: false } }],
  },
  {
    id: "running",
    title: "起動して 1 秒で警告灯が点く",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
      { type: "wait" as const, ms: 1100 },
      { type: "expect" as const, outputs: { Y1: true } },
    ],
  },
  {
    id: "blink",
    title: "さらに 1 秒で消える(点滅する)",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 1100 },
      { type: "wait" as const, ms: 1000 },
      { type: "expect" as const, outputs: { Y0: true, Y1: false } },
    ],
  },
  {
    id: "stop",
    title: "止めたら警告灯も消え、タイマも 0 に戻る",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 1100 },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, Y1: false, T0: false } },
      { type: "wait" as const, ms: 1500 },
      { type: "expect" as const, outputs: { Y1: false }, note: "止まっている間は点滅しない" },
    ],
  },
];

export const comboProblems: Problem[] = [
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-read-0",
    title: "自己保持から 2 つめの出力を取る",
    mode: "read",
    stage: "combo",
    difficulty: 2,
    tags: ["自己保持", "組み合わせ"],
    spec: "起動 X0・停止 X1 で運転出力 Y0 を自己保持し、その Y0 の a 接点でもう 1 つの出力 Y1(警告灯)を動かす回路です。",
    deviceLabels: LABELS,
    solution: runAndLamp,
    testCases: runAndLampCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "起動ボタン X0 を押して離すと、警告灯 Y1 はどうなりますか?",
          scenario: [{ type: "press", device: "X0" }],
          choices: ["点かない", "Y0 と一緒に点く", "少し遅れて点く"],
          answerIndex: 1,
          explanation:
            "3 行目のラングは Y0 の a 接点だけでできています。Y0 が自己保持で ON になると、同じスキャンのうちに Y1 も ON になります。上のラングの結果は、同じスキャンの下のラングから見えます。",
        },
        {
          id: "q2",
          prompt: "停止ボタン X1 を押すと、Y1 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X1" },
          ],
          premiseSteps: 1,
          choices: ["Y0 だけ消えて Y1 は残る", "両方消える", "Y1 だけ残って点滅する"],
          answerIndex: 1,
          explanation:
            "Y1 は Y0 を見ているだけなので、Y0 が消えれば Y1 も消えます。出力から出力を作ると、こうして 1 か所の停止で全部が止まります。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-read-1",
    title: "運転と警告灯の関係",
    mode: "read",
    stage: "combo",
    difficulty: 3,
    tags: ["自己保持", "タイマ", "組み合わせ"],
    spec: "起動 X0・停止 X1 で運転出力 Y0 を制御し、運転が 5 秒続くと警告灯 Y1 が点く回路です。",
    deviceLabels: LABELS,
    solution: warnAfter5,
    testCases: warnCases.slice(0, 5),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "起動して 4 秒で停止し、すぐまた起動しました。その 2 秒後に警告灯 Y1 は?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "wait", ms: 4000 },
            { type: "press", device: "X1" },
            { type: "press", device: "X0" },
            { type: "wait", ms: 2000 },
          ],
          choices: ["点灯している(合計 6 秒だから)", "点灯していない(数え直しだから)"],
          answerIndex: 1,
          explanation:
            "タイマは Y0 で動いています。停止で Y0 が消えるとタイマの通電も切れ、現在値は 0 に戻ります。",
        },
        {
          id: "q2",
          prompt: "警告灯が点いている状態で停止ボタン X1 を押すと、Y1 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "wait", ms: 5100 },
            { type: "press", device: "X1" },
          ],
          premiseSteps: 2,
          choices: ["消える", "点いたまま残る"],
          answerIndex: 0,
          explanation:
            "Y1 はタイマ T0 の a 接点で点いています。Y0 が消えると T0 も落ちるため、Y1 も同時に消えます。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-read-2",
    title: "1 つのボタンで入切する回路",
    mode: "read",
    stage: "combo",
    difficulty: 5,
    tags: ["立ち上がり微分", "自己保持", "組み合わせ"],
    spec: "押しボタン X0 を押すたびに、運転出力 Y0 が入 → 切 → 入 と交互に切り替わる回路です(オルタネート)。",
    deviceLabels: LABELS,
    solution: alternate,
    testCases: alternateCases.slice(0, 4),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を押したまま離さずにいると、Y0 はどうなりますか?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 1000 },
          ],
          choices: ["入と切を高速で繰り返す", "1 回だけ切り替わって、そのまま", "何も起きない"],
          answerIndex: 1,
          explanation:
            "立ち上がり接点は「OFF から ON に変わった瞬間」の 1 スキャンしか通しません。押し続けても 2 回目は反応しません。",
        },
        {
          id: "q2",
          // 以前は「立ち上がり接点を a 接点に変えたらどうなるか」を聞いていたが、
          // それは**この回路では起きない**話なので、答え合わせで動かして見せられなかった
          // (S-022)。同じ狙い(立ち上がり微分がなぜ要るか)を、実際に見せられる形にした
          prompt: "一度点灯させたあと、もう一度 X0 を押して離すと、Y0 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
          ],
          premiseSteps: 1,
          choices: ["消える", "点いたまま変わらない", "一瞬消えてまた点く"],
          answerIndex: 0,
          explanation:
            "押すたびに入と切が入れ替わります(オルタネート)。これができるのは、立ち上がり接点が「押した瞬間の 1 スキャン」だけを通すからです。もし普通の a 接点だったら、押している間ずっと切り替え条件が成立して反転を繰り返してしまい、離したときにどちらになっているか分かりません。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-fix-1",
    title: "警告灯が点かない",
    mode: "fix",
    stage: "combo",
    difficulty: 4,
    tags: ["タイマ", "自己保持", "組み合わせ"],
    spec: "起動 X0・停止 X1 で運転出力 Y0 を制御し、運転が 5 秒続くと警告灯 Y1 が点きます。停止したら両方消え、運転が続いていれば 5 秒で警告灯が点くはずですが、いまはボタンを押し続けないと 5 秒たっても警告灯が点きません。直してください。",
    deviceLabels: LABELS,
    solution: warnAfter5,
    testCases: warnCases,
    fix: {
      initial: ladder(5)
        .row(no("X0"), nc("X1"), out("Y0"))
        .row(no("Y0"))
        .row(no("X0"), timer("T0", 5000))
        .row(no("T0"), out("Y1"))
        .v(0, 0)
        .build(),
      bugCount: 1,
      hint: "タイマを動かしている接点は、押しボタンではなく運転出力であるべきです。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-fix-2",
    title: "止まらずに次のサイクルに入れない",
    mode: "fix",
    stage: "combo",
    difficulty: 4,
    tags: ["カウンタ", "タイマ", "組み合わせ"],
    spec: "センサ X2 が 3 回入力されると運転出力 Y0 が入り、2 秒後に自動で止まってカウンタもリセットされ、次のサイクルに入れるはずです。いまは 2 秒たっても止まらず、次のサイクルに入れません。直してください。",
    deviceLabels: LABELS,
    solution: countThenTimeout,
    testCases: countTimeoutCases,
    fix: {
      initial: ladder(4)
        .row(no("X2"), counter("C0", 3))
        .row(no("C0"), out("Y0"))
        .row(no("C0"), timer("T0", 2000))
        .row()
        .build(),
      bugCount: 1,
      hint: "タイマが時間になったときに、カウンタをリセットするラングがありません。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-write-1",
    title: "運転 5 秒で警告を出す回路",
    mode: "write",
    stage: "combo",
    difficulty: 4,
    tags: ["自己保持", "タイマ", "組み合わせ"],
    spec: "起動ボタン X0 で運転出力 Y0 が入り、離しても運転を続ける。停止ボタン X1 で止まる。運転が 5 秒続いたら警告灯 Y1 を点ける。停止したら Y0 も Y1 も消え、次に起動したときはタイマを 0 から数え直す。",
    deviceLabels: LABELS,
    solution: warnAfter5,
    testCases: warnCases,
    write: { hint: "タイマは Y0 で動かします。X0 で動かすと停止しても数え続けてしまいます。" },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-write-2",
    title: "3 個たまったら 2 秒動かす回路",
    mode: "write",
    stage: "combo",
    difficulty: 5,
    tags: ["カウンタ", "タイマ", "組み合わせ"],
    spec: "センサ X2 が 3 回入力されると運転出力 Y0 が入る。運転開始から 2 秒後に自動で止まり、同時にカウンタもリセットされて 0 に戻る。そのあと、また 3 回入力されれば同じように動く。",
    deviceLabels: LABELS,
    solution: countThenTimeout,
    testCases: countTimeoutCases,
    write: {
      hint: "カウンタの a 接点で Y0 とタイマを動かし、タイマの a 接点でカウンタの RST を動かします。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-read-3",
    title: "順番を守らないと動かない",
    mode: "read",
    stage: "combo",
    difficulty: 3,
    tags: ["組み合わせ", "インターロック", "自己保持"],
    spec: "コンベアが 2 台あります。1 号機 Y0 が動いていないと 2 号機 Y1 を起動できない回路です(順序起動)。停止 X2 で両方止まります。",
    deviceLabels: {
      X0: "1 号機 起動",
      X1: "2 号機 起動",
      X2: "停止",
      Y0: "1 号機",
      Y1: "2 号機",
    },
    solution: sequence,
    testCases: sequenceCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "1 号機を動かさないまま、2 号機の起動ボタン X1 を押して離しました。2 号機 Y1 は?",
          scenario: [{ type: "press", device: "X1" }],
          choices: ["動く", "動かない", "1 号機も一緒に動く"],
          answerIndex: 1,
          explanation:
            "2 号機の行には 1 号機 Y0 の a 接点が直列に入っています。1 号機が止まっていると、そこで道が切れるので起動できません。自己保持の枝も同じ接点の手前にあるので、保持もされません。",
        },
        {
          id: "q2",
          prompt: "1 号機を起動してから X1 を押して離すと、2 号機 Y1 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X1" },
          ],
          premiseSteps: 1,
          choices: ["押している間だけ動く", "動いたままになる", "やはり動かない"],
          answerIndex: 1,
          explanation:
            "1 号機の a 接点が通っているので起動でき、2 号機自身の a 接点で自己保持されます。なお 1 号機を止めると、直列の接点が切れて 2 号機も止まります。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "combo-write-3",
    title: "運転中だけ警告灯が点滅する回路",
    mode: "write",
    stage: "combo",
    difficulty: 5,
    tags: ["組み合わせ", "タイマ", "点滅", "自己保持"],
    spec: "起動ボタン X0 で運転出力 Y0 が入り、離しても運転を続ける。停止ボタン X1 で止まる。運転している間、警告灯 Y1 が 1 秒ごとに点滅する。止めたら警告灯も消え、次に起動したときは消灯から始まる。",
    deviceLabels: {
      X0: "起動",
      X1: "停止",
      Y0: "運転出力",
      Y1: "警告灯",
      T0: "消灯タイマ",
      T1: "点灯タイマ",
    },
    solution: runningFlicker,
    testCases: runningFlickerCases,
    write: {
      hint: "自己保持で運転を作り、その a 接点を点滅回路の先頭に置きます。点滅はタイマ 2 つで、消灯タイマの a 接点で警告灯と点灯タイマを動かし、点灯タイマの b 接点で消灯タイマを切ります。",
    },
  },
];

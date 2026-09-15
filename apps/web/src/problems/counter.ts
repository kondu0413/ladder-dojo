import {
  counter,
  ladder,
  no,
  out,
  type Problem,
  reset,
  SCHEMA_VERSION,
  wire,
} from "@ladder-dojo/core";

const LABELS = {
  X0: "カウント",
  X1: "リセット",
  X2: "強制完了",
  Y0: "完了ランプ",
  C0: "カウンタ",
} as const;

/** カウンタ単体。3 回で完了する */
const countOnly = ladder(3).row(no("X0"), wire, counter("C0", 3)).build();

const countOnlyCases = [
  {
    id: "initial",
    title: "最初は完了していない",
    steps: [{ type: "expect" as const, outputs: { C0: false } }],
  },
  {
    id: "two-presses",
    title: "2 回ではまだ完了しない",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { C0: false } },
    ],
  },
  {
    id: "three-presses",
    title: "3 回目で完了する",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { C0: true } },
    ],
  },
  {
    id: "keeps-done",
    title: "4 回目以降も完了のまま",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { C0: true }, note: "リセットするまで完了のまま" },
    ],
  },
];

/** X0 を 5 回押すと Y0 点灯、X1 でリセット */
const count5 = ladder(4)
  .row(no("X0"), counter("C0", 5))
  .row(no("X1"), reset("C0"))
  .row(no("C0"), out("Y0"))
  .build();

/** 5 回押すか、X2 を押している間は完了扱いにする */
const count5OrForce = ladder(4)
  .row(no("X0"), counter("C0", 5))
  .row(no("X1"), reset("C0"))
  .row(no("C0"), out("Y0"))
  .row(no("X2"))
  .v(2, 0)
  .build();

const pressX0 = (times: number) =>
  Array.from({ length: times }, () => ({ type: "press" as const, device: "X0" as const }));

const count5Cases = [
  {
    id: "initial",
    title: "最初は消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false, C0: false } }],
  },
  {
    id: "four",
    title: "4 回では点かない",
    steps: [...pressX0(4), { type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "five",
    title: "5 回で点く",
    steps: [...pressX0(5), { type: "expect" as const, outputs: { Y0: true, C0: true } }],
  },
  {
    id: "six",
    title: "6 回目を押しても変わらない",
    steps: [...pressX0(6), { type: "expect" as const, outputs: { Y0: true } }],
  },
  {
    id: "reset",
    title: "リセットで 0 に戻る",
    steps: [
      ...pressX0(5),
      { type: "expect" as const, outputs: { Y0: true } },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false, C0: false } },
    ],
  },
  {
    id: "hold",
    title: "押しっぱなしでは 1 回しか数えない",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 1000 },
      { type: "expect" as const, outputs: { Y0: false }, note: "数えるのは押した瞬間だけ" },
    ],
  },
  {
    id: "count-after-reset",
    title: "リセット後はまた 0 から数える",
    steps: [
      ...pressX0(5),
      { type: "press" as const, device: "X1" as const },
      ...pressX0(4),
      { type: "expect" as const, outputs: { Y0: false } },
      ...pressX0(1),
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
];

const forceCases = [
  {
    id: "five",
    title: "5 回押せば点く",
    steps: [...pressX0(5), { type: "expect" as const, outputs: { Y0: true } }],
  },
  {
    id: "force",
    title: "強制完了ボタンを押している間は点く",
    steps: [
      { type: "set" as const, inputs: { X2: true } },
      { type: "expect" as const, outputs: { Y0: true, C0: false } },
    ],
  },
  {
    id: "force-release",
    title: "強制完了を離すと消える(保持はしない)",
    steps: [
      { type: "set" as const, inputs: { X2: true } },
      { type: "expect" as const, outputs: { Y0: true } },
      { type: "set" as const, inputs: { X2: false } },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "two",
    title: "2 回では点かない",
    steps: [...pressX0(2), { type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "reset",
    title: "リセットも効く",
    steps: [
      ...pressX0(5),
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
];

export const counterProblems: Problem[] = [
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-read-0",
    title: "カウンタは何を数えている?",
    mode: "read",
    stage: "counter",
    difficulty: 1,
    tags: ["カウンタ"],
    spec: "押しボタン X0 でカウンタ C0(設定 3 回)を動かすだけの回路です。C0 そのものの動きを見てください。",
    deviceLabels: LABELS,
    solution: countOnly,
    testCases: countOnlyCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を 2 回押した時点で、C0 は完了していますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
          ],
          choices: ["完了している", "まだ完了していない", "1 回目で完了している"],
          answerIndex: 1,
          explanation:
            "カウンタは通電が OFF から ON に変わった回数を数えます。設定は 3 回なので、2 回ではまだ足りません。",
        },
        {
          id: "q2",
          prompt: "3 回押して完了したあと、さらに 4 回目を押すとどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
            { type: "press", device: "X0" },
          ],
          choices: ["完了が取り消される", "完了のまま変わらない", "0 に戻って数え直す"],
          answerIndex: 1,
          explanation:
            "カウンタは設定値に達したら、そこで止まって完了を保ちます。0 に戻すには RST(リセット)が要ります。タイマが通電を切るだけで 0 に戻るのとは違うところです。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-read-1",
    title: "押しっぱなしにするとどうなる?",
    mode: "read",
    stage: "counter",
    difficulty: 2,
    tags: ["カウンタ"],
    spec: "X0 を 5 回押すと完了ランプ Y0 が点灯し、X1 でリセットする回路です。",
    deviceLabels: LABELS,
    solution: count5,
    testCases: count5Cases.slice(0, 5),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を押したまま 1 秒間離さずにいました。カウンタはいくつ数えますか?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 1000 },
          ],
          choices: ["1 回だけ", "押している間ずっと数え続ける", "0 回"],
          answerIndex: 0,
          explanation:
            "カウンタが数えるのは「OFF から ON に変わった瞬間」だけです。押し続けても値は増えません。",
        },
        {
          id: "q2",
          prompt: "5 回押して Y0 が点いたあと、さらに 3 回押すとどうなりますか?",
          scenario: [...pressX0(8)],
          choices: ["点いたまま変わらない", "消える", "8 回目で異常になる"],
          answerIndex: 0,
          explanation:
            "設定値に達したカウンタはそれ以上数えません。リセットするまで完了状態のままです。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-read-2",
    title: "リセットしたあとは?",
    mode: "read",
    stage: "counter",
    difficulty: 2,
    tags: ["カウンタ", "リセット"],
    spec: "X0 を 5 回押すと完了ランプ Y0 が点灯し、X1 でリセットする回路です。",
    deviceLabels: LABELS,
    solution: count5,
    testCases: count5Cases.slice(0, 5),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "5 回押して点灯させたあと X1 を押し、続けて X0 を 4 回押しました。Y0 は?",
          scenario: [...pressX0(5), { type: "press", device: "X1" }, ...pressX0(4)],
          choices: ["点灯している(合計 9 回押したから)", "消えている(リセット後 4 回だから)"],
          answerIndex: 1,
          explanation:
            "リセットでカウンタの現在値は 0 に戻ります。そこから数え直すので、あと 1 回で点灯します。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-fix-1",
    title: "1 回早く点いてしまう",
    mode: "fix",
    stage: "counter",
    difficulty: 2,
    tags: ["カウンタ", "設定値"],
    spec: "X0 を 5 回押したときに完了ランプ Y0 が点灯し、X1 でリセットするはずです。いまは 4 回で点いてしまいます。直してください。",
    deviceLabels: LABELS,
    solution: count5,
    testCases: count5Cases,
    fix: {
      initial: ladder(4)
        .row(no("X0"), counter("C0", 4))
        .row(no("X1"), reset("C0"))
        .row(no("C0"), out("Y0"))
        .build(),
      bugCount: 1,
      hint: "カウンタの設定値を確かめてください。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-fix-2",
    title: "リセットできない",
    mode: "fix",
    stage: "counter",
    difficulty: 3,
    tags: ["カウンタ", "リセット"],
    spec: "X0 を 5 回押すと完了ランプ Y0 が点灯し、X1 を押すとカウンタが 0 に戻って Y0 も消えるはずです。いまはリセットボタンが効きません。直してください。",
    deviceLabels: LABELS,
    solution: count5,
    testCases: count5Cases,
    fix: {
      initial: ladder(4).row(no("X0"), counter("C0", 5)).row().row(no("C0"), out("Y0")).build(),
      bugCount: 1,
      hint: "リセット用のラングが足りません。X1 でカウンタの RST を動かします。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-write-1",
    title: "5 個数えたら知らせる回路",
    mode: "write",
    stage: "counter",
    difficulty: 2,
    tags: ["カウンタ"],
    spec: "センサ X0 が 5 回入力されると完了ランプ Y0 が点灯する。6 回目以降を入力しても変わらない。リセットボタン X1 を押すとカウンタが 0 に戻り、Y0 も消えて、また 0 から数え直す。",
    deviceLabels: LABELS,
    solution: count5,
    testCases: count5Cases,
    write: {
      hint: "X0 でカウンタのコイルを、X1 でカウンタの RST を動かし、カウンタの a 接点で Y0 を点けます。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "counter-write-2",
    title: "強制完了ボタンつきのカウンタ",
    mode: "write",
    stage: "counter",
    difficulty: 3,
    tags: ["カウンタ", "並列"],
    spec: "センサ X0 が 5 回入力されると完了ランプ Y0 が点灯する。X1 でカウンタをリセットする。さらに強制完了ボタン X2 を押している間も、カウント数に関わらず Y0 を点灯させる(離すと消える。カウンタの値は変わらない)。",
    deviceLabels: LABELS,
    solution: count5OrForce,
    testCases: forceCases,
    write: { hint: "カウンタの a 接点と X2 の a 接点を並列(縦線でつなぐ)にします。" },
  },
];

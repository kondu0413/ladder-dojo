import { ladder, nc, no, out, type Problem, SCHEMA_VERSION, timer, wire } from "@ladder-dojo/core";

const LABELS = { X0: "起動", X1: "停止", Y0: "ランプ", T0: "タイマ" } as const;

/** X0 を押すと点灯し、3 秒後に自動で消灯する */
const autoOff = ladder(5)
  .row(no("X0"), nc("T0"), out("Y0"))
  .row(no("Y0"))
  .row(no("Y0"), timer("T0", 3000))
  .v(0, 0)
  .build();

/** X0 を押し続けて 2 秒後に点灯する(オンディレイ) */
const onDelay = ladder(4).row(no("X0"), timer("T0", 2000)).row(no("T0"), out("Y0")).build();

/** タイマ単体。通電が続いた時間だけを見る */
const timerOnly = ladder(3).row(no("X0"), wire, timer("T0", 2000)).build();

const timerOnlyCases = [
  {
    id: "initial",
    title: "最初は完了していない",
    steps: [{ type: "expect" as const, outputs: { T0: false } }],
  },
  {
    id: "one-second",
    title: "1 秒ではまだ完了しない",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 1000 },
      { type: "expect" as const, outputs: { T0: false } },
    ],
  },
  {
    id: "two-seconds",
    title: "2 秒で完了する",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 2000 },
      { type: "expect" as const, outputs: { T0: true } },
    ],
  },
  {
    id: "reset-on-release",
    title: "離すと 0 に戻る",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 2000 },
      { type: "expect" as const, outputs: { T0: true } },
      { type: "set" as const, inputs: { X0: false } },
      { type: "expect" as const, outputs: { T0: false }, note: "通電が切れると現在値も 0 に戻る" },
    ],
  },
];

const autoOffCases = [
  {
    id: "initial",
    title: "電源投入直後は消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "start",
    title: "押すと点灯する",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "still-on",
    title: "2 秒後はまだ点いている",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 2000 },
      { type: "expect" as const, outputs: { Y0: true }, note: "3 秒経っていないので点いたまま" },
    ],
  },
  {
    id: "auto-off",
    title: "3 秒後に自動で消える",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 3100 },
      { type: "expect" as const, outputs: { Y0: false }, note: "タイマが働いて自動停止する" },
    ],
  },
  {
    id: "restart",
    title: "消えたあと、もう一度押せば点く",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "wait" as const, ms: 3100 },
      { type: "expect" as const, outputs: { Y0: false } },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
];

const onDelayCases = [
  {
    id: "too-short",
    title: "ちょっと押しただけでは点かない",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "not-yet",
    title: "1 秒ではまだ点かない",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 1000 },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "on",
    title: "2 秒押し続けると点く",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 2100 },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "release",
    title: "離すと消える",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 2100 },
      { type: "expect" as const, outputs: { Y0: true } },
      { type: "set" as const, inputs: { X0: false } },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "restart-count",
    title: "途中で離すと数え直しになる",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 1500 },
      { type: "set" as const, inputs: { X0: false } },
      { type: "set" as const, inputs: { X0: true } },
      { type: "wait" as const, ms: 1000 },
      {
        type: "expect" as const,
        outputs: { Y0: false },
        note: "0 からやり直すので合計 2.5 秒でも点かない",
      },
    ],
  },
];

export const timerProblems: Problem[] = [
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-read-0",
    title: "タイマは何を数えている?",
    mode: "read",
    stage: "timer",
    difficulty: 1,
    tags: ["タイマ"],
    spec: "押しボタン X0 でタイマ T0(設定 2 秒)を動かすだけの回路です。ランプはまだつないでいません。T0 そのものの動きを見てください。",
    deviceLabels: LABELS,
    solution: timerOnly,
    testCases: timerOnlyCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を押してから 1 秒たった時点で、T0 は完了していますか?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 1000 },
          ],
          choices: ["完了している", "まだ完了していない", "押した瞬間に完了している"],
          answerIndex: 1,
          explanation:
            "オンディレイタイマは、通電が続いた時間を数えます。設定は 2 秒なので、1 秒ではまだ足りません。",
        },
        {
          id: "q2",
          prompt: "2 秒たって T0 が完了したあと、X0 を離すとどうなりますか?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 2000 },
            { type: "set", inputs: { X0: false } },
          ],
          choices: [
            "完了したままになる",
            "完了が取り消され、現在値も 0 に戻る",
            "現在値は残るが完了だけ取り消される",
          ],
          answerIndex: 1,
          explanation:
            "タイマは通電が切れた瞬間にリセットされます。完了も現在値も 0 に戻るので、押し直すとまた 0 から数え始めます。ここが自己保持との大きな違いです。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-read-1",
    title: "3 秒後に何が起きる?",
    mode: "read",
    stage: "timer",
    difficulty: 2,
    tags: ["タイマ", "自己保持"],
    spec: "起動ボタン X0 でランプ Y0 を点け、タイマ T0 で自動停止する回路です。",
    deviceLabels: LABELS,
    solution: autoOff,
    testCases: autoOffCases.slice(0, 4),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を押して離し、そのまま 5 秒待ちました。ランプ Y0 はどうなっていますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "wait", ms: 5000 },
          ],
          choices: ["点いたまま", "消えている", "点いたり消えたりしている"],
          answerIndex: 1,
          explanation:
            "Y0 が点くとタイマ T0 が動き出します。3 秒で T0 が ON になると、直列に入った T0 の b 接点が開いて Y0 が消えます。",
        },
        {
          id: "q2",
          prompt: "Y0 が消えたあと、もう一度 X0 を押すとどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "wait", ms: 5000 },
            { type: "press", device: "X0" },
          ],
          choices: ["また 3 秒間点灯する", "もう点かない", "すぐ消える"],
          answerIndex: 0,
          explanation:
            "Y0 が消えるとタイマの通電も切れ、T0 の現在値は 0 に戻ります。次に押すとまた 0 から数え直します。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-read-2",
    title: "押し続けないと点かない回路",
    mode: "read",
    stage: "timer",
    difficulty: 2,
    tags: ["タイマ"],
    spec: "X0 を押し続けると 2 秒後にランプ Y0 が点灯する回路(オンディレイ)です。",
    deviceLabels: LABELS,
    solution: onDelay,
    testCases: onDelayCases.slice(0, 4),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を 1 秒だけ押して離しました。そのあと Y0 はどうなりますか?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 1000 },
            { type: "set", inputs: { X0: false } },
          ],
          choices: ["1 秒後に点灯する", "点灯しない", "すぐ点灯して消える"],
          answerIndex: 1,
          explanation:
            "オンディレイタイマは通電が切れると現在値が 0 に戻ります。2 秒に届かないまま離したので点灯しません。",
        },
        {
          id: "q2",
          prompt: "1 秒押して離し、すぐまた 1.5 秒押しました。合計 2.5 秒ですが Y0 は?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 1000 },
            { type: "set", inputs: { X0: false } },
            { type: "set", inputs: { X0: true } },
            { type: "wait", ms: 1500 },
          ],
          choices: ["点灯する(合計 2.5 秒だから)", "点灯しない(数え直しだから)"],
          answerIndex: 1,
          explanation: "タイマは積算されません。離した時点で 0 に戻り、押し直すと 0 から数えます。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-fix-1",
    title: "消えるのが遅すぎる",
    mode: "fix",
    stage: "timer",
    difficulty: 2,
    tags: ["タイマ", "設定値"],
    spec: "起動ボタン X0 を押すとランプ Y0 が点灯し、3 秒後に自動で消灯するはずです。いまは 3 秒経っても消えません。直してください。",
    deviceLabels: LABELS,
    solution: autoOff,
    testCases: autoOffCases,
    fix: {
      initial: ladder(5)
        .row(no("X0"), nc("T0"), out("Y0"))
        .row(no("Y0"))
        .row(no("Y0"), timer("T0", 6000))
        .v(0, 0)
        .build(),
      bugCount: 1,
      hint: "タイマの設定値を確かめてください。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-fix-2",
    title: "そもそも点灯しない",
    mode: "fix",
    stage: "timer",
    difficulty: 3,
    tags: ["タイマ", "a接点とb接点"],
    spec: "起動ボタン X0 を押すとランプ Y0 が点灯し、3 秒後に自動で消灯するはずです。いまは押しても点きません。直してください。",
    deviceLabels: LABELS,
    solution: autoOff,
    testCases: autoOffCases,
    fix: {
      initial: ladder(5)
        .row(no("X0"), no("T0"), out("Y0"))
        .row(no("Y0"))
        .row(no("Y0"), timer("T0", 3000))
        .v(0, 0)
        .build(),
      bugCount: 1,
      hint: "タイマの接点が「時間が来たら切る」向きになっているか確かめてください。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-write-1",
    title: "3 秒で自動停止する回路を作る",
    mode: "write",
    stage: "timer",
    difficulty: 3,
    tags: ["タイマ", "自己保持"],
    spec: "起動ボタン X0 を押すとランプ Y0 が点灯し、ボタンを離しても点いたままになる。点灯から 3 秒後に自動で消灯する。消えたあと、もう一度 X0 を押せばまた点灯する。",
    deviceLabels: LABELS,
    solution: autoOff,
    testCases: autoOffCases,
    write: {
      hint: "自己保持にタイマの b 接点を直列に入れます。タイマは Y0 で動かします。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "timer-write-2",
    title: "オンディレイ回路を作る",
    mode: "write",
    stage: "timer",
    difficulty: 2,
    tags: ["タイマ"],
    spec: "押しボタン X0 を 2 秒間押し続けると、ランプ Y0 が点灯する。ボタンを離すと Y0 は消灯し、タイマは 0 に戻る。",
    deviceLabels: LABELS,
    solution: onDelay,
    testCases: onDelayCases,
    write: { hint: "X0 でタイマを動かし、タイマの a 接点で Y0 を点けます。" },
  },
];

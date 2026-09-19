import {
  ladder,
  nc,
  no,
  out,
  type Problem,
  reset,
  SCHEMA_VERSION,
  set,
  wire,
} from "@ladder-dojo/core";

const LABELS = { X0: "起動", X1: "停止", X2: "非常停止", Y0: "ランプ" } as const;

/** X0 で起動、X1 で停止する基本の自己保持 */
const basic = ladder(5).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

/** 非常停止 X2 を直列に足した自己保持 */
const withEmergency = ladder(6)
  .row(no("X0"), nc("X1"), nc("X2"), out("Y0"))
  .row(no("Y0"))
  .v(0, 0)
  .build();

/** 自己保持の前段: 接点 1 つとコイル 1 つだけ。押している間しか点かない */
const direct = ladder(3).row(no("X0"), wire, out("Y0")).build();

const directCases = [
  {
    id: "initial",
    title: "何も押していなければ消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "while-pressed",
    title: "押している間は点く",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "released",
    title: "離すと消える",
    steps: [
      { type: "set" as const, inputs: { X0: true } },
      { type: "expect" as const, outputs: { Y0: true } },
      { type: "set" as const, inputs: { X0: false } },
      { type: "expect" as const, outputs: { Y0: false }, note: "保持する仕組みが無い" },
    ],
  },
];

const basicCases = [
  {
    id: "initial",
    title: "電源投入直後は消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "start",
    title: "起動ボタンを押して離しても点いたまま",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true }, note: "自己保持の枝で保持される" },
    ],
  },
  {
    id: "stop",
    title: "停止ボタンで消える",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "restart",
    title: "止めたあと、もう一度起動できる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "stop-priority",
    title: "停止ボタンを押している間は起動できない",
    steps: [
      { type: "set" as const, inputs: { X1: true } },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: false } },
      { type: "set" as const, inputs: { X1: false } },
      { type: "expect" as const, outputs: { Y0: false }, note: "離しても勝手に点いてはいけない" },
    ],
  },
];

const emergencyCases = [
  {
    id: "start",
    title: "起動して保持する",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
  {
    id: "emergency-stops",
    title: "運転中に非常停止を押すと止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "set" as const, inputs: { X2: true } },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "emergency-blocks",
    title: "非常停止を押している間は起動できない",
    steps: [
      { type: "set" as const, inputs: { X2: true } },
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "no-auto-restart",
    title: "非常停止を解除しても勝手に動き出さない",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "set" as const, inputs: { X2: true } },
      { type: "set" as const, inputs: { X2: false } },
      { type: "expect" as const, outputs: { Y0: false }, note: "復帰は起動ボタンの押し直しから" },
    ],
  },
  {
    id: "normal-stop",
    title: "通常の停止ボタンでも止まる",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
];

/** b 接点だけの回路。電源を入れた時点から通電していて、押すと切れる */
const alwaysOn = ladder(3).row(nc("X1"), out("Y0")).build();

const alwaysOnCases = [
  {
    id: "initial",
    title: "電源を入れた時点で点いている",
    steps: [
      { type: "expect" as const, outputs: { Y0: true }, note: "b 接点は押していないとき通す" },
    ],
  },
  {
    id: "pressed",
    title: "押している間は消える",
    steps: [
      { type: "set" as const, inputs: { X1: true } },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "released",
    title: "離すとまた点く",
    steps: [
      { type: "set" as const, inputs: { X1: true } },
      { type: "expect" as const, outputs: { Y0: false } },
      { type: "set" as const, inputs: { X1: false } },
      { type: "expect" as const, outputs: { Y0: true }, note: "覚えておく仕組みが無い" },
    ],
  },
];

/** SET / RST で保持する(S-044)。自己保持の接点を組まない書き方 */
const setReset = ladder(4).row(no("X0"), set("Y0")).row(no("X1"), reset("Y0")).build();

const setResetCases = [
  {
    id: "initial",
    title: "最初は消えている",
    steps: [{ type: "expect" as const, outputs: { Y0: false } }],
  },
  {
    id: "start",
    title: "起動ボタンを押して離しても点いたまま",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "expect" as const, outputs: { Y0: true } },
      { type: "wait" as const, ms: 500 },
      { type: "expect" as const, outputs: { Y0: true }, note: "覚えておく仕組みが無い" },
    ],
  },
  {
    id: "stop",
    title: "停止ボタンで消え、離しても消えたまま",
    steps: [
      { type: "press" as const, device: "X0" as const },
      { type: "press" as const, device: "X1" as const },
      { type: "expect" as const, outputs: { Y0: false } },
      { type: "wait" as const, ms: 300 },
      { type: "expect" as const, outputs: { Y0: false } },
    ],
  },
  {
    id: "both",
    title: "両方押している間は停止が勝つ",
    steps: [
      { type: "set" as const, inputs: { X0: true, X1: true } },
      { type: "expect" as const, outputs: { Y0: false }, note: "停止が優先" },
      { type: "set" as const, inputs: { X1: false } },
      { type: "expect" as const, outputs: { Y0: true }, note: "起動を押したままなら点く" },
      { type: "set" as const, inputs: { X0: false } },
      { type: "expect" as const, outputs: { Y0: true } },
    ],
  },
];

export const selfholdProblems: Problem[] = [
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-read-0",
    title: "接点とコイルだけの回路",
    mode: "read",
    stage: "selfhold",
    difficulty: 1,
    tags: ["接点とコイル"],
    spec: "いちばん簡単な回路です。押しボタン X0 の a 接点が 1 つと、ランプ Y0 のコイルが 1 つだけつながっています。",
    deviceLabels: LABELS,
    solution: direct,
    testCases: directCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "押しボタン X0 を押している間、ランプ Y0 はどうなりますか?",
          scenario: [{ type: "set", inputs: { X0: true } }],
          choices: ["点灯する", "消えたまま", "点いたり消えたりする"],
          answerIndex: 0,
          explanation:
            "a 接点は、そのデバイスが ON のときだけ電気を通します。X0 を押している間は左の母線から右の母線まで道がつながるので、Y0 のコイルに電気が流れて点灯します。",
        },
        {
          id: "q2",
          prompt: "そのあと X0 を離すと、Y0 はどうなりますか?",
          scenario: [
            { type: "set", inputs: { X0: true } },
            { type: "set", inputs: { X0: false } },
          ],
          premiseSteps: 1,
          choices: ["点灯したままになる", "消える", "しばらくしてから消える"],
          answerIndex: 1,
          explanation:
            "離すと a 接点が開いて道が切れるので、すぐ消えます。コイルは「いま電気が流れているか」をそのまま映すだけで、覚えておく力はありません。押したあとも点いたままにしたいなら、次の問題で出てくる自己保持が要ります。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-read-1",
    title: "押しボタンを離したらどうなる?",
    mode: "read",
    stage: "selfhold",
    difficulty: 1,
    tags: ["自己保持"],
    spec: "起動ボタン X0 と停止ボタン X1 でランプ Y0 を制御する回路です。動きを予測してください。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases.slice(0, 3),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "起動ボタン X0 を押して、すぐに離しました。ランプ Y0 はどうなりますか?",
          scenario: [{ type: "press", device: "X0" as const }],
          choices: ["押している間だけ点灯し、離すと消える", "点灯したままになる", "何も起きない"],
          answerIndex: 1,
          explanation:
            "Y0 が点くと、X0 と並列につないだ Y0 の a 接点が閉じます。X0 を離してもこの枝から電気が流れ続けるので、点灯が保持されます。",
        },
        {
          id: "q2",
          prompt: "Y0 が点灯している状態で、停止ボタン X1 を押すとどうなりますか?",
          scenario: [
            { type: "press", device: "X0" as const },
            { type: "press", device: "X1" as const },
          ],
          premiseSteps: 1,
          choices: ["消灯する", "点灯したまま変わらない", "一瞬消えてまた点く"],
          answerIndex: 0,
          explanation:
            "X1 は b 接点なので、押すと回路が切れます。Y0 が消えると自己保持の枝も切れるため、離しても消えたままです。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-read-2",
    title: "非常停止を押すとどうなる?",
    mode: "read",
    stage: "selfhold",
    difficulty: 2,
    tags: ["自己保持", "非常停止"],
    spec: "起動 X0・停止 X1 に加えて、非常停止 X2 を持つ回路です。",
    deviceLabels: LABELS,
    solution: withEmergency,
    testCases: emergencyCases.slice(0, 3),
    read: {
      questions: [
        {
          id: "q1",
          prompt: "運転中(Y0 点灯中)に非常停止 X2 を押し続けると、Y0 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" as const },
            { type: "set", inputs: { X2: true } },
          ],
          premiseSteps: 1,
          choices: ["消灯する", "点灯したまま", "点滅する"],
          answerIndex: 0,
          explanation: "X2 は b 接点で直列に入っているため、押すと回路が切れて消灯します。",
        },
        {
          id: "q2",
          prompt: "非常停止 X2 を離すと、Y0 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" as const },
            { type: "set", inputs: { X2: true } },
            { type: "set", inputs: { X2: false } },
          ],
          premiseSteps: 2,
          choices: [
            "自動で点灯し、運転が再開される",
            "消えたまま。起動ボタンを押し直す必要がある",
            "エラーで動かなくなる",
          ],
          answerIndex: 1,
          explanation:
            "一度 Y0 が消えると自己保持の枝も切れます。非常停止を解除しても勝手に再起動しないのが安全上の要件です。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-fix-1",
    title: "ボタンを離すと消えてしまう",
    mode: "fix",
    stage: "selfhold",
    difficulty: 1,
    tags: ["自己保持"],
    spec: "起動ボタン X0 を押すとランプ Y0 が点灯し、離しても点いたままになるはずです。停止ボタン X1 で消灯します。いまは押している間しか点きません。直してください。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases,
    fix: {
      initial: ladder(5).row(no("X0"), nc("X1"), out("Y0")).row().build(),
      bugCount: 1,
      hint: "Y0 を点けたままにするには、X0 と並列にもう 1 本の道が要ります。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-fix-2",
    title: "停止ボタンを押さないと起動しない",
    mode: "fix",
    stage: "selfhold",
    difficulty: 2,
    tags: ["自己保持", "a接点とb接点"],
    spec: "起動ボタン X0 でランプ Y0 が点灯・保持され、停止ボタン X1 で消灯するはずです。いまは停止ボタンを押していないと起動しません。直してください。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases,
    fix: {
      initial: ladder(5).row(no("X0"), no("X1"), out("Y0")).row(no("Y0")).v(0, 0).build(),
      bugCount: 1,
      hint: "停止ボタンは「押していないときに通す」接点でなければなりません。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-write-1",
    title: "自己保持回路を作る",
    mode: "write",
    stage: "selfhold",
    difficulty: 2,
    tags: ["自己保持"],
    spec: "起動ボタン X0 を押すとランプ Y0 が点灯し、ボタンを離しても点いたままになる。停止ボタン X1 を押すと消灯する。停止ボタンを押している間は起動できない。",
    deviceLabels: LABELS,
    solution: basic,
    testCases: basicCases,
    write: { hint: "X0 と並列に Y0 の a 接点を置くと、自分の出力で自分を保持できます。" },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-write-2",
    title: "非常停止つきの自己保持",
    mode: "write",
    stage: "selfhold",
    difficulty: 3,
    tags: ["自己保持", "非常停止"],
    spec: "起動ボタン X0 でランプ Y0 が点灯・保持され、停止ボタン X1 で消灯する。さらに非常停止 X2 が押されている間は起動できず、運転中なら直ちに消灯する。非常停止を解除しても自動では再起動しない。",
    deviceLabels: LABELS,
    solution: withEmergency,
    testCases: emergencyCases,
    write: { hint: "非常停止も「押していないときに通す」接点として直列に入れます。" },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-read-3",
    title: "押していないのに点いている?",
    mode: "read",
    stage: "selfhold",
    difficulty: 1,
    tags: ["a接点とb接点"],
    spec: "停止ボタン X1 の b 接点 1 つでランプ Y0 を動かす回路です。電源を入れた時点から点いています。",
    deviceLabels: LABELS,
    solution: alwaysOn,
    testCases: alwaysOnCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "停止ボタン X1 を押している間、ランプ Y0 はどうなりますか?",
          scenario: [{ type: "set", inputs: { X1: true } }],
          choices: ["消える", "点いたまま", "点いたり消えたりする"],
          answerIndex: 0,
          explanation:
            "b 接点は、そのデバイスが OFF のときに通し、ON になると切れます。a 接点とちょうど逆です。押していないときに通っているので、電源を入れただけで点いていました。",
        },
        {
          id: "q2",
          prompt: "そのあと X1 を離すと、ランプ Y0 はどうなりますか?",
          scenario: [
            { type: "set", inputs: { X1: true } },
            { type: "set", inputs: { X1: false } },
          ],
          premiseSteps: 1,
          choices: ["消えたまま", "また点く", "しばらくしてから点く"],
          answerIndex: 1,
          explanation:
            "離すと b 接点がまた通すので、すぐ点きます。コイルは「いま電気が流れているか」をそのまま映すだけで、覚えておく力はありません。押したことを覚えさせたいなら自己保持が要ります。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-fix-3",
    title: "起動ボタンを押しても動かない",
    mode: "fix",
    stage: "selfhold",
    difficulty: 2,
    tags: ["非常停止", "a接点とb接点"],
    spec: "起動 X0・停止 X1 で自己保持し、非常停止 X2 でも止まるはずの回路です。いまは起動ボタンを押しても動きません。直してください。",
    deviceLabels: LABELS,
    solution: withEmergency,
    testCases: emergencyCases,
    fix: {
      initial: ladder(6).row(no("X0"), nc("X1"), no("X2"), out("Y0")).row(no("Y0")).v(0, 0).build(),
      bugCount: 1,
      hint: "非常停止は「押したときに切れる」ものです。いまの接点は、押していないときに通っているか確かめてください。",
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-read-4",
    title: "SET と RST で覚える",
    mode: "read",
    stage: "selfhold",
    difficulty: 2,
    tags: ["自己保持", "SET/RST"],
    spec: "起動ボタン X0 でランプ Y0 を点け、停止ボタン X1 で消す回路です。自己保持の接点は無く、代わりに SET コイルと RST コイルを使っています。",
    deviceLabels: LABELS,
    solution: setReset,
    testCases: setResetCases,
    read: {
      questions: [
        {
          id: "q1",
          prompt: "X0 を押して離すと、Y0 はどうなりますか?",
          scenario: [{ type: "press", device: "X0" as const }],
          choices: ["点いたままになる", "押している間だけ点く", "点かない"],
          answerIndex: 0,
          explanation:
            "SET コイルは通電した瞬間に Y0 を ON にし、通電が切れても ON のまま保ちます。自己保持の接点を組まなくても覚えていられます。",
        },
        {
          id: "q2",
          prompt: "そのあと X1 を押して離すと、Y0 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" as const },
            { type: "press", device: "X1" as const },
          ],
          premiseSteps: 1,
          choices: ["消える", "点いたまま", "点滅する"],
          answerIndex: 0,
          explanation:
            "RST コイルに通電すると Y0 は OFF に戻ります。離しても OFF のままです。SET で覚えたものは RST でしか消えません。",
        },
        {
          id: "q3",
          prompt: "X0 と X1 を両方押したままにしている間、Y0 はどうなりますか?",
          scenario: [{ type: "set", inputs: { X0: true, X1: true } }],
          choices: [
            "消えている(あとに実行される 2 行目の RST の結果が残る)",
            "点いている(1 行目の SET の結果が残る)",
            "点いたり消えたりする",
          ],
          answerIndex: 0,
          explanation:
            "1 スキャンの中で SET と RST の両方に通電すると、PLC は上から順に実行するので、あとに実行される 2 行目(RST)の結果が残ります。1 行目で ON にした直後に 2 行目で OFF に戻る、と考えてください。RST を下に置くと「停止が優先」になります。",
        },
      ],
    },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    id: "selfhold-write-3",
    title: "SET と RST で自己保持を作る",
    mode: "write",
    stage: "selfhold",
    difficulty: 2,
    tags: ["自己保持", "SET/RST"],
    spec: "起動ボタン X0 を押すとランプ Y0 が点灯し、離しても点いたまま。停止ボタン X1 で消灯する。両方押している間は消えていること。自己保持の接点を使わず、SET コイルと RST コイルで作ってみてください(接点は 2 つで足ります)。",
    deviceLabels: LABELS,
    solution: setReset,
    testCases: setResetCases,
    write: {
      hint: "X0 の a 接点で Y0 の SET を、X1 の a 接点で Y0 の RST を動かします。RST のラングを下に置くと、両方押したとき停止が勝ちます。",
    },
  },
];

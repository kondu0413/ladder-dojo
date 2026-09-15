import { ladder, nc, no, out, type Problem, SCHEMA_VERSION } from "@ladder-dojo/core";

const LABELS = { X0: "起動", X1: "停止", X2: "非常停止", Y0: "ランプ" } as const;

/** X0 で起動、X1 で停止する基本の自己保持 */
const basic = ladder(5).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

/** 非常停止 X2 を直列に足した自己保持 */
const withEmergency = ladder(6)
  .row(no("X0"), nc("X1"), nc("X2"), out("Y0"))
  .row(no("Y0"))
  .v(0, 0)
  .build();

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

export const selfholdProblems: Problem[] = [
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
          scenario: [{ type: "press", device: "X0" }],
          choices: ["押している間だけ点灯し、離すと消える", "点灯したままになる", "何も起きない"],
          answerIndex: 1,
          explanation:
            "Y0 が点くと、X0 と並列につないだ Y0 の a 接点が閉じます。X0 を離してもこの枝から電気が流れ続けるので、点灯が保持されます。",
        },
        {
          id: "q2",
          prompt: "Y0 が点灯している状態で、停止ボタン X1 を押すとどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "press", device: "X1" },
          ],
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
            { type: "press", device: "X0" },
            { type: "set", inputs: { X2: true } },
          ],
          choices: ["消灯する", "点灯したまま", "点滅する"],
          answerIndex: 0,
          explanation: "X2 は b 接点で直列に入っているため、押すと回路が切れて消灯します。",
        },
        {
          id: "q2",
          prompt: "非常停止 X2 を離すと、Y0 はどうなりますか?",
          scenario: [
            { type: "press", device: "X0" },
            { type: "set", inputs: { X2: true } },
            { type: "set", inputs: { X2: false } },
          ],
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
];

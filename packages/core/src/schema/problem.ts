import { z } from "zod";
import { circuitSchema, SCHEMA_VERSION } from "./circuit.js";
import { deviceIdSchema } from "./device.js";
import { stepSchema, testCasesSchema } from "./testcase.js";

/** 学習モード(SPEC.md §3.2) */
export const PROBLEM_MODES = ["read", "fix", "write"] as const;
export type ProblemMode = (typeof PROBLEM_MODES)[number];

/** 公式問題の段階(SPEC.md §3.3) */
export const PROBLEM_STAGES = ["selfhold", "timer", "counter", "interlock", "combo"] as const;
export type ProblemStage = (typeof PROBLEM_STAGES)[number];

/** 「読む」モードの予測問題 */
export const readQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  /** 例: 「X0 を押して離すと Y0 はどうなる?」 */
  prompt: z.string().min(1).max(300),
  /** 答え合わせでシミュレータに流す操作列(expect は含めなくてよい) */
  scenario: z.array(stepSchema).min(1).max(50),
  /**
   * scenario の先頭 premiseSteps 個は、設問の時点で**すでに済んでいる操作**(S-048)。
   * 「そのあと X1 を押すと」の「そのあと」= 先頭の X0 の操作。図はその操作を流した
   * あとの状態(点いているランプなど)を設問のスタート時点として見せ、再生もそこから
   * 始める。省略時は 0(何も操作していない状態がスタート)
   */
  premiseSteps: z.number().int().min(0).optional(),
  choices: z.array(z.string().min(1).max(100)).min(2).max(5),
  answerIndex: z.number().int().min(0),
  explanation: z.string().max(500).optional(),
});
export type ReadQuestion = z.infer<typeof readQuestionSchema>;

export const problemSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(64),
    title: z.string().min(1).max(100),
    mode: z.enum(PROBLEM_MODES),
    stage: z.enum(PROBLEM_STAGES),
    /** 5 段階(SPEC.md §5 暫定) */
    difficulty: z.number().int().min(1).max(5),
    tags: z.array(z.string().min(1).max(30)).max(10),
    /** 仕様文(問題文)。改行可 */
    spec: z.string().min(1).max(2000),
    /** デバイスの説明(例: X0 → 起動ボタン) */
    deviceLabels: z.record(deviceIdSchema, z.string().min(1).max(40)).optional(),
    /** 模範解答(最適解)。投稿問題も必須(§3.6) */
    solution: circuitSchema,
    /** 振る舞い判定のテストケース */
    testCases: testCasesSchema,
    /** 「読む」: 表示する回路は solution。予測問題を持つ */
    read: z.object({ questions: z.array(readQuestionSchema).min(1).max(10) }).optional(),
    /** 「直す」: バグ入りの初期回路。テストケースに落ちること */
    fix: z
      .object({
        initial: circuitSchema,
        /**
         * **不具合の個数**(1〜2、§3.2)。ヒント表示用。
         *
         * 直すマスの数ではない。1 つの不具合を直すのに複数のマスを触ることがある
         * (例: 自己保持の枝が無い → 接点と縦線の 2 マス)。画面で「か所」と
         * 言わないこと(S-025)
         */
        bugCount: z.number().int().min(1).max(2),
        hint: z.string().max(300).optional(),
      })
      .optional(),
    /** 「書く」: 白紙から。初期回路(空のグリッド)を指定できる */
    write: z
      .object({
        initial: circuitSchema.optional(),
        hint: z.string().max(300).optional(),
      })
      .optional(),
  })
  .superRefine((p, ctx) => {
    if (p.mode === "read" && !p.read) {
      ctx.addIssue({ code: "custom", path: ["read"], message: "mode=read には read が必要" });
    }
    if (p.mode === "fix" && !p.fix) {
      ctx.addIssue({ code: "custom", path: ["fix"], message: "mode=fix には fix が必要" });
    }
    if (p.read) {
      p.read.questions.forEach((q, i) => {
        if (q.answerIndex >= q.choices.length) {
          ctx.addIssue({
            code: "custom",
            path: ["read", "questions", i, "answerIndex"],
            message: "answerIndex が choices の範囲外",
          });
        }
        if (q.premiseSteps !== undefined && q.premiseSteps >= q.scenario.length) {
          ctx.addIssue({
            code: "custom",
            path: ["read", "questions", i, "premiseSteps"],
            message: "premiseSteps は scenario より短くする(設問で問う操作が残るように)",
          });
        }
      });
    }
  });
export type Problem = z.infer<typeof problemSchema>;

export function parseProblem(input: unknown): Problem {
  return problemSchema.parse(input);
}

import { z } from "zod";
import { inputDeviceSchema, observableDeviceSchema } from "./device.js";

/** 1 テストケースあたりの待ち時間合計の上限(ms)。CPU 時間を抑えるため(COST.md §1.1) */
export const MAX_TOTAL_WAIT_MS = 120_000;
export const MAX_STEPS_PER_CASE = 200;

/**
 * テストケースのステップ(SPEC.md §3.3「入力操作のシーケンス → 期待される出力状態」)。
 * - set:    入力(X)を設定し、回路が安定するまでスキャンする(時間は進まない)
 * - press:  入力を ON → holdMs 待つ → OFF。ボタン押下の省略形
 * - wait:   ms だけ時間を進める(タイマが進む)。その後、安定するまでスキャン
 * - expect: 出力(Y / M / T / C)の状態を検証する
 */
export const setStepSchema = z.object({
  type: z.literal("set"),
  inputs: z.record(inputDeviceSchema, z.boolean()),
});
export const pressStepSchema = z.object({
  type: z.literal("press"),
  device: inputDeviceSchema,
  holdMs: z.number().int().min(0).max(MAX_TOTAL_WAIT_MS).optional(),
});
export const waitStepSchema = z.object({
  type: z.literal("wait"),
  ms: z.number().int().min(1).max(MAX_TOTAL_WAIT_MS),
});
export const expectStepSchema = z.object({
  type: z.literal("expect"),
  outputs: z.record(observableDeviceSchema, z.boolean()),
  /** 不正解時に表示する補足(例: 「3 秒経ったので消灯しているはず」) */
  note: z.string().max(200).optional(),
});

export const stepSchema = z.discriminatedUnion("type", [
  setStepSchema,
  pressStepSchema,
  waitStepSchema,
  expectStepSchema,
]);
export type Step = z.infer<typeof stepSchema>;

export const testCaseSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(100),
    steps: z.array(stepSchema).min(1).max(MAX_STEPS_PER_CASE),
  })
  .superRefine((tc, ctx) => {
    let total = 0;
    for (const s of tc.steps) {
      if (s.type === "wait") total += s.ms;
      if (s.type === "press") total += s.holdMs ?? DEFAULT_HOLD_MS;
    }
    if (total > MAX_TOTAL_WAIT_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: `待ち時間の合計が上限 ${MAX_TOTAL_WAIT_MS} ms を超えています`,
      });
    }
    if (!tc.steps.some((s) => s.type === "expect")) {
      ctx.addIssue({ code: "custom", path: ["steps"], message: "expect ステップが 1 つも無い" });
    }
  });
export type TestCase = z.infer<typeof testCaseSchema>;

/** press の既定の押下時間 */
export const DEFAULT_HOLD_MS = 100;

export const testCasesSchema = z.array(testCaseSchema).min(1).max(50);

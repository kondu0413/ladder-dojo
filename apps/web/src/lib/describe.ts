/**
 * テストケースの 1 ステップの説明は core の describeStep を使う(S-052)。
 * 以前はここに別の実装があり、判定結果では「X0 を ON」、再生では「X0 を押したまま」と
 * 同じ操作の言い方が食い違っていた
 */
export { describeStep } from "@ladder-dojo/core";

/** 期待と実際が食い違ったデバイスだけを取り出す */
export function diffOutputs(
  expected: Record<string, boolean>,
  actual: Record<string, boolean>,
): Array<{ device: string; expected: boolean; actual: boolean }> {
  return Object.entries(expected)
    .filter(([device, want]) => actual[device] !== want)
    .map(([device, want]) => ({ device, expected: want, actual: actual[device] ?? false }));
}

export function onOff(value: boolean): string {
  return value ? "ON" : "OFF";
}

/**
 * `deviceLabels` は zod のおかげでキーが `X0` などのテンプレート型になっている。
 * 任意の文字列で引けるよう、素のマップに広げる(キャストなしで済ませる)。
 */
export function labelMap(labels?: Partial<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels ?? {})) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

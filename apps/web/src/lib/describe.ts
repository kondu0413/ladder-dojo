import {
  DEFAULT_HOLD_MS,
  type DeviceId,
  formatDevice,
  type Notation,
  type Step,
} from "@ladder-dojo/core";

/** テストケースの 1 ステップを日本語で説明する(不正解時の差分表示用、SPEC.md §3.3) */
export function describeStep(
  step: Step,
  labels?: Record<string, string>,
  notation: Notation = "standard",
): string {
  const name = (device: string) => {
    const shown = formatDevice(device as DeviceId, notation);
    return labels?.[device] ? `${shown}(${labels[device]})` : shown;
  };
  switch (step.type) {
    case "set": {
      const parts = Object.entries(step.inputs).map(
        ([device, on]) => `${name(device)} を ${on ? "ON" : "OFF"}`,
      );
      return parts.join("、") || "入力を変えない";
    }
    case "press": {
      const hold = step.holdMs ?? DEFAULT_HOLD_MS;
      return hold >= 1000
        ? `${name(step.device)} を ${(hold / 1000).toFixed(1)} 秒押して離す`
        : `${name(step.device)} を押して離す`;
    }
    case "wait":
      return `${(step.ms / 1000).toFixed(1)} 秒待つ`;
    case "expect":
      return "出力を確認する";
  }
}

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

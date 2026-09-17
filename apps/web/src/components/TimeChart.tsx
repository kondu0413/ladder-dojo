import type { Timeline } from "@ladder-dojo/core";
import { useMemo } from "react";
import { describeStep } from "../lib/describe.js";
import { useNotation } from "../lib/notation-context.jsx";

export type TimeChartProps = {
  timeline: Timeline;
  deviceLabels?: Record<string, string> | undefined;
  /** 食い違ったデバイス。行を赤くして目立たせる */
  mismatched?: readonly string[] | undefined;
};

/** 1 行の高さ(px) */
const ROW_H = 26;
/** 波の高さ。ROW_H より小さくして行間を空ける */
const WAVE_H = 14;
/** デバイス名を出す左側の幅 */
const LABEL_W = 56;
/** 右端の余白。最後の変化が見切れないように */
const PAD_R = 8;
/** 波形部分の幅。実時間ではなく一定幅にして、スマホでも読めるようにする */
const PLOT_W = 320;
/** 目印の文字を置く上の帯 */
const HEAD_H = 18;

/**
 * タイムチャート(改善候補 4)。
 *
 * 判定の波形を時間軸で描く。表で「どのステップで何が違ったか」を読むより、
 * 「押した瞬間に上がって、離したら落ちた」が一目で分かる。
 *
 * 横軸は仮想時間をそのまま比例で割り当てる。待ち時間が長いケースだと
 * 押した瞬間の変化が潰れるので、変化が起きた時刻には必ず目盛りを出す。
 */
export function TimeChart({ timeline, deviceLabels, mismatched }: TimeChartProps) {
  const notation = useNotation();
  const { devices, samples, markers, durationMs } = timeline;
  const bad = useMemo(() => new Set(mismatched ?? []), [mismatched]);

  // 幅ゼロの波形を描いても読めないので、最低でも 1 ms の幅を持たせる
  const span = Math.max(durationMs, 1);
  const x = (t: number) => LABEL_W + (t / span) * PLOT_W;
  const width = LABEL_W + PLOT_W + PAD_R;
  const height = HEAD_H + devices.length * ROW_H + 16;

  if (devices.length === 0 || samples.length === 0) return null;

  return (
    <div className="overflow-x-auto" data-testid="time-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", minWidth: 300 }}
        role="img"
        aria-label="タイムチャート"
      >
        <title>タイムチャート</title>

        {/* 目印(ここで押した、ここで待った)の縦線 */}
        {markers.map((m) => (
          <line
            key={`marker-${m.stepIndex}`}
            x1={x(m.t)}
            y1={HEAD_H - 4}
            x2={x(m.t)}
            y2={height - 12}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        {devices.map((device, i) => {
          const y = HEAD_H + i * ROW_H;
          const isBad = bad.has(device);
          return (
            <g
              key={device}
              data-testid={`chart-row-${device}`}
              data-mismatched={isBad || undefined}
            >
              <text
                x={0}
                y={y + WAVE_H}
                fontSize={11}
                fill={isBad ? "#b91c1c" : "#475569"}
                fontWeight={isBad ? 700 : 400}
              >
                {notation.device(device)}
              </text>
              {deviceLabels?.[device] && (
                <title>{`${notation.device(device)} ${deviceLabels[device]}`}</title>
              )}
              <path
                d={wavePath(samples, device, x, y, span)}
                fill="none"
                stroke={isBad ? "#dc2626" : "#0f766e"}
                strokeWidth={2}
                strokeLinejoin="miter"
              />
            </g>
          );
        })}

        {/* 目盛り: 変化が起きた時刻 */}
        <text x={LABEL_W} y={height - 2} fontSize={9} fill="#94a3b8">
          0
        </text>
        <text x={LABEL_W + PLOT_W} y={height - 2} fontSize={9} fill="#94a3b8" textAnchor="end">
          {formatMs(durationMs)}
        </text>
      </svg>

      <ol className="mt-1 flex flex-col gap-0.5">
        {markers.map((m) => (
          <li key={`step-${m.stepIndex}`} className="text-xs text-slate-500">
            {formatMs(m.t)}: {describeStep(m.step, deviceLabels, notation.notation)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * 1 デバイスの矩形波。ON を上、OFF を下に描く。
 * 値が変わった時刻で垂直に立ち上げ / 立ち下げる。
 */
function wavePath(
  samples: Timeline["samples"],
  device: string,
  x: (t: number) => number,
  top: number,
  span: number,
): string {
  const yOn = top + 2;
  const yOff = top + 2 + WAVE_H;
  const yOf = (on: boolean) => (on ? yOn : yOff);

  let prev = samples[0]?.values[device] ?? false;
  const parts = [`M ${x(0)} ${yOf(prev)}`];
  for (const s of samples) {
    const cur = s.values[device] ?? false;
    if (cur === prev) continue;
    parts.push(`L ${x(s.t)} ${yOf(prev)}`);
    parts.push(`L ${x(s.t)} ${yOf(cur)}`);
    prev = cur;
  }
  parts.push(`L ${x(span)} ${yOf(prev)}`);
  return parts.join(" ");
}

function formatMs(ms: number): string {
  if (ms === 0) return "0";
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  return Number.isInteger(sec) ? `${sec} 秒` : `${sec.toFixed(1)} 秒`;
}

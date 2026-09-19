import { type CoilConflict, describeCoilConflict } from "@ladder-dojo/core";
import { useNotation } from "../lib/notation-context.jsx";
import { Button, Icon } from "./ui.js";

/**
 * 同じデバイスに複数のコイルが書いているときの「なぜ」(S-049)。
 *
 * SET と RST の両方に通電すると、図では両方のコイルが通電して見えるのに Y0 は OFF。
 * 「下の RST が勝つ」と言われても、なぜ下なのかは図に無い。PLC が上から順に実行し、
 * あとの結果が残ることを、行番号つきの一言で出す。再生では「1 行ずつ見る」で
 * スキャンの中(1 行目のあとに ON、2 行目のあとに OFF)まで見せられる。
 */
export function CoilConflictNote({
  conflicts,
  deviceLabels,
  onTrace,
}: {
  conflicts: readonly CoilConflict[];
  deviceLabels?: Record<string, string> | undefined;
  /** 「1 行ずつ見る」を押したとき。無ければボタンを出さない */
  onTrace?: (() => void) | undefined;
}) {
  const { notation } = useNotation();
  if (conflicts.length === 0) return null;
  return (
    <div
      data-testid="coil-conflict"
      className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950"
    >
      {conflicts.map((c) => (
        <p key={c.device} className="flex items-start gap-2">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span>{describeCoilConflict(c, deviceLabels, notation)}</span>
        </p>
      ))}
      {onTrace && (
        <div>
          <Button
            tone="secondary"
            size="sm"
            icon="layers"
            data-testid="trace-open"
            onClick={onTrace}
          >
            1 行ずつ見る
          </Button>
        </div>
      )}
    </div>
  );
}

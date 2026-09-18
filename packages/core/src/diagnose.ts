import { type JudgeResult, runTestCase } from "./judge/judge.js";
import type { Cell, Circuit, ContactKind, Element } from "./schema/circuit.js";
import { cellKey, MAX_TIMER_PRESET_MS } from "./schema/circuit.js";
import type { DeviceId } from "./schema/device.js";
import { DEFAULT_HOLD_MS, type TestCase } from "./schema/testcase.js";
import { splitRungs } from "./sim/simulator.js";

/**
 * つまずき診断(改善候補 1)。
 *
 * 不正解だった回路を見て「たぶんここが原因」を日本語で返す。判定そのものは変えない。
 *
 * 方針は 2 段構え:
 * 1. 構造チェック — 回路の形だけで分かる明らかな抜け(コイルが無い、二重コイル、
 *    期待されているデバイスを出力していない)。判定を走らせずに分かる
 * 2. 最小修正の探索 — ユーザーの回路に「1 手だけ」の修正を当てて判定し直し、通ったら
 *    その 1 手が原因だと分かる。判定用の別実装を作らず、既存の judge をそのまま使う(SPEC.md §6)
 *
 * 答えそのものは言わない。「どこを」「どの方向に」見直すかまでを出し、直すのは本人に任せる。
 */

/**
 * 診断の種類。画面・API・集計で共有する語彙なので、ここが唯一の定義。
 *
 * 値は DB に入り、「みんながつまずくところ」の集計キーになる。
 * 一度出したものは**消さない・意味を変えない**(過去の集計が読めなくなる)。
 * 新しい診断を足すときは末尾に追加する。
 */
export const DIAGNOSIS_IDS = [
  "no-coil",
  "missing-output",
  "double-coil",
  "no-self-hold",
  "unstable",
  "timer-preset",
  "counter-preset",
  "contact-kind",
  "device-mixup",
  "missing-condition",
  "extra-condition",
  "vline-missing",
  "vline-extra",
] as const;

export type DiagnosisId = (typeof DIAGNOSIS_IDS)[number];

export function isDiagnosisId(value: unknown): value is DiagnosisId {
  return typeof value === "string" && (DIAGNOSIS_IDS as readonly string[]).includes(value);
}

/**
 * 集計して並べるときの見出し。回路ごとの事情を含まない一般的な言い方にする
 * (個別の診断の `title` は「X1 の接点が…」のように回路に依存するので、集計には使えない)。
 */
export const DIAGNOSIS_LABELS: Record<DiagnosisId, string> = {
  "no-coil": "出力コイルを置いていない",
  "missing-output": "問題が求めているデバイスを出力していない",
  "double-coil": "同じデバイスのコイルを 2 つ以上置いている(二重コイル)",
  "no-self-hold": "自己保持の接点が足りず、離すと消えてしまう",
  unstable: "回路が発振して落ち着かない",
  "timer-preset": "タイマの設定時間が違う",
  "counter-preset": "カウンタの設定回数が違う",
  "contact-kind": "a 接点と b 接点を取り違えている",
  "device-mixup": "接点やコイルが見ているデバイスが違う",
  "missing-condition": "直列に入れるべき条件が足りない",
  "extra-condition": "余分な条件が入っていて通らない",
  "vline-missing": "並列にすべきところが直列になっている",
  "vline-extra": "直列にすべきところが並列になっている",
};

export type Diagnosis = {
  /** 診断の種類。UI のテストや重複排除、集計に使う */
  id: DiagnosisId;
  /**
   * cells の意味。
   * - "repair": そのセルを直せばテストが通る。「ここが間違っている」と言い切れる
   * - "structure": 話題にしているセル(このコイルが保持できていない、など)。
   *   間違っているセルとは限らないので、画面でも「原因」として赤く指さない
   */
  kind: "repair" | "structure";
  /** 一言でいうと何が起きているか */
  title: string;
  /** どこをどう見直すか。答えは書かない */
  detail: string;
  /** 該当するセル。画面で強調する */
  cells: Array<{ row: number; col: number }>;
};

export type DiagnoseOptions = {
  /** 最小修正の探索を行う上限手数(CPU 保護)。既定 1500 */
  maxCandidates?: number;
  /** 返す診断の最大件数。既定 3 */
  maxResults?: number;
};

const DEFAULTS = { maxCandidates: 1500, maxResults: 3 };

/**
 * 不正解の回路を診断する。正解している回路には何も返さない。
 * 該当が無ければ空配列(「分からない」を無理に埋めない)。
 */
export function diagnose(
  circuit: Circuit,
  testCases: readonly TestCase[],
  result: JudgeResult,
  options: DiagnoseOptions = {},
): Diagnosis[] {
  if (result.passed) return [];
  const opt = { ...DEFAULTS, ...options };
  const found: Diagnosis[] = [];

  const structural = diagnoseStructure(circuit, testCases, result);
  found.push(...structural);

  // コイルが無い・必要な出力が無いと分かっているなら、1 手では直らないことが確定しているので
  // 探索しない。それ以外(自己保持の抜け・二重コイル・発振)は、1 手の修正が見つかると
  // 「どのセルか」まで絞れるので、構造の指摘に足して出す
  const hopeless = found.some((d) => d.id === "no-coil" || d.id === "missing-output");
  if (!hopeless) {
    const repair = findSingleEditRepair(circuit, testCases, result, opt.maxCandidates);
    if (repair) found.push(repair);
  }

  return found.slice(0, opt.maxResults);
}

// ---------------------------------------------------------------------------
// 1. 構造チェック
// ---------------------------------------------------------------------------

function diagnoseStructure(
  circuit: Circuit,
  testCases: readonly TestCase[],
  result: JudgeResult,
): Diagnosis[] {
  const out: Diagnosis[] = [];
  const coils = circuit.cells.filter((c) => c.element?.type === "coil");

  if (coils.length === 0) {
    out.push({
      id: "no-coil",
      kind: "structure",
      title: "出力コイルがありません",
      detail:
        "この回路はまだ何も出力していません。一番右の列にコイルを置いて、何を ON にしたいかを決めてください。",
      cells: [],
    });
    return out;
  }

  // 期待されている出力デバイスのコイルが無い
  const expected = expectedOutputDevices(testCases);
  const driven = new Set<DeviceId>();
  for (const c of coils) {
    const el = c.element;
    if (el?.type === "coil") driven.add(el.device);
  }
  const missing = [...expected].filter((d) => !driven.has(d));
  if (missing.length > 0) {
    out.push({
      id: "missing-output",
      kind: "structure",
      title: `${missing.join(" / ")} を出力していません`,
      detail: `テストは ${missing.join(" / ")} の ON / OFF を見ていますが、回路のどこにも ${missing.join(" / ")} のコイルがありません。一番右の列に足してください。`,
      cells: [],
    });
  }

  // 二重コイル: 同じデバイスのコイルが 2 つ以上ある。実機でも後のラングが勝つ事故のもと
  const byDevice = new Map<DeviceId, Cell[]>();
  for (const c of coils) {
    const el = c.element;
    if (el?.type !== "coil") continue;
    // RST / SET は同じデバイスを複数のラングから触ってよいので二重コイルに数えない
    if (el.kind === "reset" || el.kind === "set") continue;
    const list = byDevice.get(el.device) ?? [];
    list.push(c);
    byDevice.set(el.device, list);
  }
  for (const [device, list] of byDevice) {
    if (list.length < 2) continue;
    out.push({
      id: "double-coil",
      kind: "structure",
      title: `${device} のコイルが ${list.length} つあります(二重コイル)`,
      detail: `同じデバイスのコイルを複数のラングに置くと、下のラングの結果だけが残ります。${device} を ON にする条件は 1 つのラングにまとめてください。`,
      cells: list.map((c) => ({ row: c.row, col: c.col })),
    });
  }

  // 自己保持の抜け: 「押して離したあとも ON のまま」を期待されているのに、
  // そのコイルのデバイスを自分のラングで読んでいない
  for (const device of selfHoldExpectedDevices(testCases)) {
    const coil = coils.find((c) => c.element?.type === "coil" && c.element.device === device);
    if (!coil) continue;
    // SET で保持しているなら、自分の接点は要らない(S-044)
    if (coil.element?.type === "coil" && coil.element.kind === "set") continue;
    const rung = splitRungs(circuit).find((r) => r.rows.includes(coil.row));
    if (!rung) continue;
    const readsItself = circuit.cells.some(
      (c) =>
        rung.rows.includes(c.row) && c.element?.type === "contact" && c.element.device === device,
    );
    if (!readsItself) {
      out.push({
        id: "no-self-hold",
        kind: "structure",
        title: `${device} がボタンを離すと消えます`,
        detail: `押している間しか通電していません。${device} を ON のまま保つには、${device} 自身の接点を押しボタンと並列に入れて、自分で自分を保持させます。`,
        cells: [{ row: coil.row, col: coil.col }],
      });
    }
  }

  // 発振: 判定が unstable で終わっている
  if (result.cases.some((c) => c.failure?.kind === "unstable")) {
    out.push({
      id: "unstable",
      kind: "structure",
      title: "回路が発振しています",
      detail:
        "ON と OFF を繰り返して落ち着きません。自分自身を b 接点で打ち消しているラングがないか確かめてください。",
      cells: [],
    });
  }

  return out;
}

/** テストケースが ON / OFF を検査しているデバイス */
function expectedOutputDevices(testCases: readonly TestCase[]): Set<DeviceId> {
  const set = new Set<DeviceId>();
  for (const tc of testCases) {
    for (const step of tc.steps) {
      if (step.type !== "expect") continue;
      for (const dev of Object.keys(step.outputs)) set.add(dev as DeviceId);
    }
  }
  return set;
}

/**
 * 「押して離したあとも ON のまま」を期待されているデバイス。
 * press の直後(間に入力操作をはさまない)の expect で true なら自己保持が要る。
 */
function selfHoldExpectedDevices(testCases: readonly TestCase[]): Set<DeviceId> {
  const set = new Set<DeviceId>();
  for (const tc of testCases) {
    let pressed = false;
    for (const step of tc.steps) {
      if (step.type === "press") {
        pressed = true;
        continue;
      }
      if (step.type === "set") {
        pressed = false;
        continue;
      }
      if (step.type === "expect" && pressed) {
        for (const [dev, want] of Object.entries(step.outputs)) {
          // T / C は自分で保持するので対象外。Y / M のみ
          if (want && (dev.startsWith("Y") || dev.startsWith("M"))) set.add(dev as DeviceId);
        }
      }
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// 2. 最小修正の探索
// ---------------------------------------------------------------------------

type Candidate = {
  circuit: Circuit;
  diagnosis: Diagnosis;
};

/**
 * 1 手だけの修正でテストが全部通るものを探す。見つかればそれが原因。
 * 候補は「まちがえやすい順」に並べ、上限手数で打ち切る。
 *
 * 速さの工夫: 候補のほとんどは外れなので、まず「いま落ちているテストケース 1 件」だけを
 * 流して落ちるものを捨て、通ったものにだけ全ケースを流す。
 * これは判定を緩めるものではない。最後に必ず全ケースで確かめてから採用する。
 * 組み合わせ問題(横線 7 列 × デバイス 8 個)で 2.7 秒かかっていたのが 0.2 秒台になる
 */
function findSingleEditRepair(
  circuit: Circuit,
  testCases: readonly TestCase[],
  result: JudgeResult,
  maxCandidates: number,
): Diagnosis | undefined {
  const screen = screeningCase(testCases, result);
  const ordered = orderedForSearch(testCases, result);
  let tried = 0;
  for (const candidate of singleEditCandidates(circuit, testCases)) {
    if (tried >= maxCandidates) break;
    tried++;
    // 1 段目: いま落ちているケースを落ちたステップまでで切り詰めたもの。いちばん安い
    if (screen && !runTestCase(candidate.circuit, screen).passed) continue;
    // 2 段目: 全ケース。落ちているケースから先に流して、1 件でも落ちたら即やめる
    if (passesAll(candidate.circuit, ordered)) return candidate.diagnosis;
  }
  return undefined;
}

/** 1 件でも落ちたら即やめる。judge() は必ず全ケースを流すので、探索ではこちらを使う */
function passesAll(circuit: Circuit, cases: readonly TestCase[]): boolean {
  for (const tc of cases) {
    if (!runTestCase(circuit, tc).passed) return false;
  }
  return true;
}

/**
 * 探索で流す順番。いま落ちているケースを先に、そのなかでも仮想時間の短いものから。
 * 直っていない候補はたいてい「いま落ちているケース」で落ちるので、そこで打ち切れる
 */
function orderedForSearch(testCases: readonly TestCase[], result: JudgeResult): TestCase[] {
  const failing = new Set(result.cases.filter((c) => !c.passed).map((c) => c.caseId));
  return [...testCases].sort((a, b) => {
    const fa = failing.has(a.id) ? 0 : 1;
    const fb = failing.has(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return virtualDuration(a) - virtualDuration(b);
  });
}

/**
 * ふるいに使うテストケースを選ぶ。
 *
 * 落ちているケースを、落ちたステップまでで切り詰めたもの。切り詰めて構わないのは、
 * 切り詰めた側が落ちるなら元のケースも必ず落ちるから(前半が同じなので)。
 * そのうち仮想時間がいちばん短いものを選ぶ。3 秒待つケースより 0.1 秒のケースの方が速い。
 */
function screeningCase(testCases: readonly TestCase[], result: JudgeResult): TestCase | undefined {
  const truncated: TestCase[] = [];
  for (const c of result.cases) {
    if (c.passed) continue;
    const tc = testCases.find((t) => t.id === c.caseId);
    if (!tc) continue;
    const at = c.failure?.stepIndex;
    const steps =
      at !== undefined && at >= 0 && at < tc.steps.length ? tc.steps.slice(0, at + 1) : tc.steps;
    if (steps.length === 0) continue;
    truncated.push({ ...tc, steps });
  }
  return truncated.sort((a, b) => virtualDuration(a) - virtualDuration(b))[0];
}

/** テストケースを流すのにかかる仮想時間(ms)のおおよそ。ふるいの選択に使う */
function virtualDuration(testCase: TestCase): number {
  let ms = 0;
  for (const step of testCase.steps) {
    if (step.type === "wait") ms += step.ms;
    if (step.type === "press") ms += step.holdMs ?? DEFAULT_HOLD_MS;
  }
  return ms;
}

/**
 * 1 手の修正候補。
 *
 * 順番が結果を決める。テストが弱いと「設定値を直す」と「接点を反転する」の両方が通って
 * しまうことがあるので、回路の論理を変えない修正(設定値)を先に試し、
 * 論理を変える修正(接点の種類・デバイス・並列)を後に回す。
 */
function* singleEditCandidates(
  circuit: Circuit,
  testCases: readonly TestCase[],
): Generator<Candidate> {
  const devices = candidateDevices(circuit, testCases);
  const waits = waitDurations(testCases);

  // (0) タイマ・カウンタの設定値。回路の形は変わらないので最初に試す
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el?.type !== "coil") continue;
    if (el.kind === "timer" || el.kind === "offdelay") {
      for (const presetMs of timerPresetGuesses(el.presetMs, waits)) {
        yield {
          circuit: replaceElement(circuit, cell, { ...el, presetMs }),
          diagnosis: {
            id: "timer-preset",
            kind: "repair",
            title: `${el.device} の設定時間が合っていません`,
            detail: `いまは ${formatMs(el.presetMs)} です。問題文が指している秒数をもう一度読んでみてください。`,
            cells: [{ row: cell.row, col: cell.col }],
          },
        };
      }
    }
    if (el.kind === "counter") {
      for (const preset of counterPresetGuesses(el.preset)) {
        yield {
          circuit: replaceElement(circuit, cell, { ...el, preset }),
          diagnosis: {
            id: "counter-preset",
            kind: "repair",
            title: `${el.device} の設定回数が合っていません`,
            detail: `いまは ${el.preset} 回です。何回目で ON にしたいのかを問題文で確かめてください。`,
            cells: [{ row: cell.row, col: cell.col }],
          },
        };
      }
    }
  }

  // (1) 接点の種類(a / b / 立ち上がり)の取り違え
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el?.type !== "contact") continue;
    for (const kind of ["no", "nc", "rise", "fall"] as const) {
      if (kind === el.kind) continue;
      yield {
        circuit: replaceElement(circuit, cell, { ...el, kind }),
        diagnosis: {
          id: "contact-kind",
          kind: "repair",
          title: `${el.device} の接点の種類が合っていません`,
          detail: `${cellLabel(cell)} の ${el.device} は ${contactLabel(el.kind)} になっています。${el.device} が ON のときに通したいのか、OFF のときに通したいのかを考え直してみてください。`,
          cells: [{ row: cell.row, col: cell.col }],
        },
      };
    }
  }

  // (1.5) 条件の入れ忘れ / 入れすぎ。
  // 「相手の b 接点を直列に入れ忘れた」はインターロックで最もよくある間違いなので、
  // 横線を接点に変える手も試す。逆に、余分な接点を横線に戻す手も見る。
  // 立ち上がり接点は「入れ忘れ」の形で出てくることがほぼ無いので候補に入れない(組み合わせ爆発を避ける)
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el?.type !== "wire") continue;
    for (const device of devices) {
      for (const kind of ["nc", "no"] as const) {
        yield {
          circuit: replaceElement(circuit, cell, { type: "contact", kind, device }),
          diagnosis: {
            id: "missing-condition",
            kind: "repair",
            title: `${cellLabel(cell)} に条件が足りません`,
            detail: `ここはいま素通しの横線です。この行が通ってよい条件が、ほかにもないか考えてみてください。似た働きをする別のラングと見比べると気づきやすいです。`,
            cells: [{ row: cell.row, col: cell.col }],
          },
        };
      }
    }
  }
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el?.type !== "contact") continue;
    yield {
      circuit: replaceElement(circuit, cell, { type: "wire" }),
      diagnosis: {
        id: "extra-condition",
        kind: "repair",
        title: `${cellLabel(cell)} の ${el.device} は余分です`,
        detail: `この条件があるせいで、通ってほしい場面で通らなくなっています。${el.device} をここで見る必要が本当にあるか確かめてください。`,
        cells: [{ row: cell.row, col: cell.col }],
      },
    };
  }

  // (2) 接点・コイルのデバイス番号の取り違え
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (!el || el.type === "wire") continue;
    for (const device of devices) {
      if (device === el.device) continue;
      const swapped = withDevice(el, device);
      if (!swapped) continue;
      yield {
        circuit: replaceElement(circuit, cell, swapped),
        diagnosis: {
          id: "device-mixup",
          kind: "repair",
          title: `${cellLabel(cell)} が見ているデバイスが違うようです`,
          detail: `いまは ${el.device} を使っています。この位置で読みたい(出したい)のが本当に ${el.device} かどうか、問題文と照らして確かめてください。`,
          cells: [{ row: cell.row, col: cell.col }],
        },
      };
    }
  }

  // (3) 並列(縦線)の付け外し。自己保持や OR の作り忘れ・付けすぎ
  for (let row = 0; row < circuit.rows - 1; row++) {
    for (let col = 0; col < circuit.cols - 1; col++) {
      const on = hasVlineAt(circuit, row, col);
      const next = setVlineAt(circuit, row, col, !on);
      if (!next) continue;
      yield {
        circuit: next,
        diagnosis: {
          id: (on ? "vline-extra" : "vline-missing") satisfies DiagnosisId,
          kind: "repair",
          title: on
            ? `${row + 1} 行目と ${row + 2} 行目のつながりが余分です`
            : `${row + 1} 行目と ${row + 2} 行目がつながっていません`,
          detail: on
            ? "この縦線があるせいで、本来は別々に効くはずの条件が並列(どちらかが成り立てば通る)になっています。"
            : "この 2 行を縦線でつなぐと並列(どちらかが成り立てば通る)になります。直列(両方必要)と並列のどちらが要るか考えてみてください。",
          cells: [{ row, col }],
        },
      };
    }
  }
}

/**
 * 差し替え候補にするデバイス。
 * 回路が使っているものに加えて、テストケースが触れているものも入れる
 * (問題が求めているデバイスをまだ 1 度も置いていない、という間違いを拾うため)。
 */
function candidateDevices(circuit: Circuit, testCases: readonly TestCase[]): DeviceId[] {
  const set = new Set<DeviceId>();
  for (const cell of circuit.cells) {
    const el = cell.element;
    if (el && el.type !== "wire") set.add(el.device);
  }
  for (const tc of testCases) {
    for (const step of tc.steps) {
      if (step.type === "set") for (const d of Object.keys(step.inputs)) set.add(d as DeviceId);
      if (step.type === "press") set.add(step.device);
      if (step.type === "expect") for (const d of Object.keys(step.outputs)) set.add(d as DeviceId);
    }
  }
  return [...set];
}

/**
 * デバイスを差し替えた要素。差し替えられない組み合わせなら undefined。
 *
 * 接点はどのデバイスでも読めるので種別を縛らない(保持用の接点に X を使ってしまう、が
 * まさによくある間違いなので、ここを縛ると肝心の診断ができない)。
 * コイルは置けるデバイスが決まっているので、種別が合うものだけ。
 */
function withDevice(element: Element, device: DeviceId): Element | undefined {
  if (element.type === "wire") return undefined;
  if (element.type === "contact") return { ...element, device };
  const from = element.device[0];
  const to = device[0];
  if (from !== to) return undefined;
  switch (element.kind) {
    case "out":
    case "pulse":
    case "set":
      return device.startsWith("Y") || device.startsWith("M") ? { ...element, device } : undefined;
    case "timer":
    case "offdelay":
      return device.startsWith("T") ? { ...element, device } : undefined;
    case "counter":
      return device.startsWith("C") ? { ...element, device } : undefined;
    case "reset":
      return /^[YMC]/.test(device) ? { ...element, device } : undefined;
  }
}

/**
 * タイマ設定値の推測。
 *
 * 1. 桁・単位の取り違え(秒とミリ秒、10 倍、2 倍・半分)
 * 2. テストケースが待っている時間から作った丸い値。
 *    「2 秒待って点いたまま / 3.1 秒待って消える」なら、正解はその間の 3 秒あたりにある。
 *    倍率だけでは 6000 → 3000 のような「2 倍にしてしまった」を外すことがあるので、
 *    待ち時間からも候補を作る
 */
function timerPresetGuesses(current: number, waits: readonly number[]): number[] {
  const scaled = [
    current * 1000,
    current / 1000,
    current * 10,
    current / 10,
    current * 2,
    current / 2,
  ];
  const fromWaits = waits.flatMap((w) => [w, roundTo(w, 100), roundTo(w, 500), roundTo(w, 1000)]);
  return [...scaled, ...fromWaits]
    .map((n) => Math.round(n))
    .filter((n) => n >= 1 && n <= MAX_TIMER_PRESET_MS && n !== current)
    .filter((n, i, a) => a.indexOf(n) === i);
}

function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

/** テストケースに出てくる待ち時間(ms) */
function waitDurations(testCases: readonly TestCase[]): number[] {
  const set = new Set<number>();
  for (const tc of testCases) {
    for (const step of tc.steps) if (step.type === "wait") set.add(step.ms);
  }
  return [...set];
}

function counterPresetGuesses(current: number): number[] {
  return [current - 1, current + 1, current - 2, current + 2]
    .filter((n) => n >= 1 && n <= 9_999 && n !== current)
    .filter((n, i, a) => a.indexOf(n) === i);
}

// ---------------------------------------------------------------------------
// 回路のちいさな書き換え(edit.ts は UI 用の検証つき。ここは探索用に軽く作る)
// ---------------------------------------------------------------------------

function replaceElement(circuit: Circuit, target: Cell, element: Element): Circuit {
  const cells = circuit.cells.map((c) =>
    c.row === target.row && c.col === target.col ? { ...c, element } : c,
  );
  return { ...circuit, cells };
}

function hasVlineAt(circuit: Circuit, row: number, col: number): boolean {
  return circuit.cells.some((c) => c.row === row && c.col === col && c.vline === true);
}

/** 縦線を付け外しした回路。置けない位置なら undefined */
function setVlineAt(circuit: Circuit, row: number, col: number, on: boolean): Circuit | undefined {
  if (row >= circuit.rows - 1) return undefined;
  if (col >= circuit.cols - 1) return undefined;
  const key = cellKey(row, col);
  const existing = circuit.cells.find((c) => cellKey(c.row, c.col) === key);
  if (!existing) {
    if (!on) return undefined;
    return { ...circuit, cells: [...circuit.cells, { row, col, vline: true }] };
  }
  const cells = circuit.cells.map((c) => {
    if (cellKey(c.row, c.col) !== key) return c;
    if (on) return { ...c, vline: true };
    const { vline: _drop, ...rest } = c;
    return rest;
  });
  return { ...circuit, cells };
}

// ---------------------------------------------------------------------------
// 表示用の文字列
// ---------------------------------------------------------------------------

function cellLabel(cell: Cell): string {
  return `${cell.row + 1} 行目 ${cell.col + 1} 列目`;
}

function contactLabel(kind: ContactKind): string {
  switch (kind) {
    case "no":
      return "a 接点(ON のとき通る)";
    case "nc":
      return "b 接点(OFF のとき通る)";
    case "rise":
      return "立ち上がり接点(OFF → ON の一瞬だけ通る)";
    case "fall":
      return "立ち下がり接点(ON → OFF の一瞬だけ通る)";
  }
}

function formatMs(ms: number): string {
  if (ms % 1000 === 0) return `${ms / 1000} 秒`;
  return `${ms} ミリ秒`;
}

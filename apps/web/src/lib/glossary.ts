import { type Circuit, counter, ladder, nc, no, out, reset, rise, timer } from "@ladder-dojo/core";

/**
 * 用語集(S-041)。SPEC.md §7 の用語に、問題文とヒントに出てくる言葉を足したもの。
 *
 * 問題文の中の用語は `GlossaryText` がここを引いてリンクにする。
 * 説明は「その回路を動かして見られる」ことを優先し、文章は短く。
 */
export type GlossaryEntry = {
  id: string;
  /** 見出し語 */
  term: string;
  /** 本文中で拾う別の書き方(見出し語も拾う) */
  aliases?: string[];
  /** 1 文の説明。リンクのツールチップと一覧に使う */
  short: string;
  /** 詳しい説明 */
  body: string;
  /** 動かして見られる小さな回路 */
  circuit?: Circuit;
  deviceLabels?: Record<string, string>;
  /** 関連する用語の id */
  related?: string[];
};

const selfhold = ladder(5).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "rung",
    term: "ラング",
    aliases: ["ラング"],
    short: "ラダー図の 1 行。左母線から右母線まで。",
    body: "左の母線から右の母線までを 1 本の道と見て、その道が通じたときにいちばん右のコイルが ON になります。PLC は上のラングから順に 1 行ずつ評価します。",
    circuit: ladder(4).row(no("X0"), nc("X1"), out("Y0")).build(),
    deviceLabels: { X0: "起動", X1: "停止", Y0: "ランプ" },
    related: ["rail", "scan", "coil"],
  },
  {
    id: "rail",
    term: "母線",
    aliases: ["母線"],
    short: "ラダー図の左右にある太い縦線。左が電源側、右が戻り側。",
    body: "左母線に電気が来ていて、接点を通って右母線まで道がつながるとコイルに電流が流れる、と読みます。各行の左端は必ず左母線につながっています。",
    related: ["rung"],
  },
  {
    id: "contact-a",
    term: "a 接点(常開接点)",
    aliases: ["a 接点", "a接点", "常開接点"],
    short: "デバイスが ON のときに通す接点。押している間だけ道がつながる。",
    body: "何もしないと開いていて(常開)、対応するデバイスが ON になると閉じます。押しボタンなら「押している間だけ通す」接点です。",
    circuit: ladder(3).row(no("X0"), out("Y0")).build(),
    deviceLabels: { X0: "ボタン", Y0: "ランプ" },
    related: ["contact-b", "device"],
  },
  {
    id: "contact-b",
    term: "b 接点(常閉接点)",
    aliases: ["b 接点", "b接点", "常閉接点"],
    short: "デバイスが OFF のときに通す接点。押すと道が切れる。",
    body: "何もしないと閉じていて(常閉)、対応するデバイスが ON になると開きます。停止ボタンや非常停止に使うと「押していないときだけ通す」道になります。",
    circuit: ladder(3).row(nc("X0"), out("Y0")).build(),
    deviceLabels: { X0: "停止", Y0: "ランプ" },
    related: ["contact-a", "interlock"],
  },
  {
    id: "coil",
    term: "コイル(出力)",
    aliases: ["出力コイル", "コイル"],
    short: "ラングの右端に置く出力。通電しているあいだ、そのデバイスを ON にする。",
    body: "コイルは必ず右母線の直前(いちばん右の列)に置きます。Y は外に出る出力、M は内部だけで使うリレーです。コイルが ON になると、同じ名前の接点も ON になります。",
    circuit: ladder(4).row(no("X0"), out("M0")).row(no("M0"), out("Y0")).build(),
    deviceLabels: { X0: "ボタン", M0: "内部リレー", Y0: "ランプ" },
    related: ["relay-m", "rung"],
  },
  {
    id: "device",
    term: "デバイス(X / Y / M / T / C)",
    aliases: ["デバイス"],
    short: "接点やコイルが参照する名前。X 入力・Y 出力・M 内部リレー・T タイマ・C カウンタ。",
    body: "X は押しボタンやセンサなどの入力、Y はランプやモータなどの出力、M は PLC の中だけで使う内部リレー、T はタイマ、C はカウンタです。番号を付けて X0、Y12 のように呼びます。表記は「表記の切り替え」で変えられます。",
    related: ["contact-a", "coil", "timer", "counter"],
  },
  {
    id: "relay-m",
    term: "内部リレー(M)",
    aliases: ["内部リレー", "補助リレー"],
    short: "外には出ない、PLC の中だけの出力。途中の状態を覚えておくのに使う。",
    body: "「運転中」「準備完了」のような状態を M に持たせておくと、あとのラングでその接点を使えます。オルタネート回路や順序起動で欠かせません。",
    related: ["coil", "alternate"],
  },
  {
    id: "selfhold",
    term: "自己保持",
    aliases: ["自己保持"],
    short: "出力コイルの状態を、自分の接点で保ち続ける回路。押しボタンを離しても動き続ける。",
    body: "起動ボタンの a 接点と並列に、出力自身の a 接点を置きます。一度 ON になると自分の接点で道が通じたままになり、停止ボタン(b 接点)を押すまで保持されます。ラダー図でいちばん基本の形です。",
    circuit: selfhold,
    deviceLabels: { X0: "起動", X1: "停止", Y0: "ランプ" },
    related: ["parallel", "contact-b", "interlock"],
  },
  {
    id: "interlock",
    term: "インターロック",
    aliases: ["インターロック"],
    short: "相反する出力が同時に ON にならないようにする回路。相手の b 接点を直列に入れる。",
    body: "正転と逆転のように同時に入ってはいけない出力の組では、それぞれのラングに相手の出力の b 接点を直列に入れます。片側だけでなく、お互いに掛け合うのが決まりです。",
    circuit: ladder(6)
      .row(no("X0"), nc("Y1"), nc("X2"), out("Y0"))
      .row(no("Y0"))
      .v(0, 0)
      .row(no("X1"), nc("Y0"), nc("X2"), out("Y1"))
      .row(no("Y1"))
      .v(2, 0)
      .build(),
    deviceLabels: { X0: "正転", X1: "逆転", X2: "停止", Y0: "正転出力", Y1: "逆転出力" },
    related: ["contact-b", "series", "selfhold"],
  },
  {
    id: "series",
    term: "直列",
    aliases: ["直列"],
    short: "接点を横に並べる。両方が通じたときだけ道がつながる(AND)。",
    body: "横に並べた接点は、すべてが閉じていないと電流が流れません。「起動ボタンを押していて、かつ停止ボタンを押していない」のような条件になります。",
    circuit: ladder(4).row(no("X0"), no("X1"), out("Y0")).build(),
    deviceLabels: { X0: "左ボタン", X1: "右ボタン", Y0: "プレス" },
    related: ["parallel", "interlock"],
  },
  {
    id: "parallel",
    term: "並列",
    aliases: ["並列"],
    short: "縦線で枝を作って接点を縦に並べる。どちらかが通じれば道がつながる(OR)。",
    body: "縦線で枝分かれと合流を作ると、いずれかの枝が通じれば電流が流れます。自己保持は「起動ボタン または 自分の出力」の並列です。エディタでは「下へ縦線」で枝をつなぎます。",
    circuit: ladder(4).row(no("X0"), out("Y0")).row(no("X1")).v(0, 0).build(),
    deviceLabels: { X0: "ボタン 1", X1: "ボタン 2", Y0: "ランプ" },
    related: ["series", "selfhold"],
  },
  {
    id: "timer",
    term: "タイマ(オンディレイ)",
    aliases: ["オンディレイタイマ", "オンディレイ", "タイマ"],
    short: "通電が設定時間つづくと ON になる。通電が切れると 0 に戻る。",
    body: "タイマのコイルに電流が流れているあいだ時間を数え、設定値に達すると T の接点が ON になります。途中で電流が切れると数えた時間は 0 に戻ります。「押してから 3 秒後に」「運転が 5 秒続いたら」に使います。",
    circuit: ladder(4).row(no("X0"), timer("T0", 2000)).row(no("T0"), out("Y0")).build(),
    deviceLabels: { X0: "ボタン", T0: "2 秒", Y0: "ランプ" },
    related: ["flicker", "counter"],
  },
  {
    id: "counter",
    term: "カウンタ",
    aliases: ["カウンタ"],
    short: "通電の立ち上がりを数え、設定回数に達すると ON になる。RST で 0 に戻す。",
    body: "カウンタのコイルは電流が流れ始めた回数を数えます(押し続けても 1 回)。設定回数に達すると C の接点が ON になり、RST に通電するまで保ちます。",
    circuit: ladder(4)
      .row(no("X0"), counter("C0", 3))
      .row(no("X1"), reset("C0"))
      .row(no("C0"), out("Y0"))
      .build(),
    deviceLabels: { X0: "カウント", X1: "リセット", Y0: "完了ランプ" },
    related: ["reset", "rise"],
  },
  {
    id: "reset",
    term: "リセット(RST)",
    aliases: ["リセット", "RST"],
    short: "通電しているあいだ、カウンタの現在値と完了を 0 に戻す。",
    body: "RST は「通電している間ずっと」効きます。押しボタンの a 接点で動かせば、押したときに 0 に戻ります。b 接点で動かすと、押していない間ずっとリセットされ続けて数えられません。",
    circuit: ladder(4)
      .row(no("X0"), counter("C0", 3))
      .row(no("X1"), reset("C0"))
      .row(no("C0"), out("Y0"))
      .build(),
    deviceLabels: { X0: "カウント", X1: "リセット", Y0: "完了ランプ" },
    related: ["counter"],
  },
  {
    id: "rise",
    term: "立ち上がり(微分)",
    aliases: ["立ち上がり微分", "立ち上がり接点", "立ち上がり", "立上り", "PLS"],
    short: "OFF から ON に変わった瞬間の 1 スキャンだけ通す。押し続けても 1 回。",
    body: "立ち上がり接点は、デバイスが OFF → ON になったスキャンだけ閉じます。PLS(パルス)コイルは通電の立ち上がりで対象を 1 スキャンだけ ON にします。「押すたびに 1 回」を作るときに使い、オルタネート回路の要です。",
    circuit: ladder(4).row(rise("X0"), out("M0")).row(no("M0"), out("Y0")).build(),
    deviceLabels: { X0: "ボタン", M0: "パルス", Y0: "出力" },
    related: ["scan", "alternate", "counter"],
  },
  {
    id: "scan",
    term: "スキャン",
    aliases: ["スキャン"],
    short: "PLC が全ラングを上から順に 1 回評価する周期。",
    body: "PLC は入力を読み、ラングを上から順に評価し、出力を書く、を繰り返します。この 1 周がスキャンです。このアプリでは 10 ms を 1 スキャンとして動かし、一時停止中は「1 スキャン」ボタンで 1 周ずつ進められます。ラングの並び順で結果が変わるのは、この順序評価のためです。",
    related: ["rung", "rise"],
  },
  {
    id: "energized",
    term: "通電",
    aliases: ["通電"],
    short: "左母線からその場所まで道がつながって、電気が来ている状態。",
    body: "ラダー図では、電流が流れている線を橙の太線、電圧は来ているがその要素を流れていない線を薄い橙の破線、無電圧を灰色で描いています。コイルは通電しているあいだ ON です。",
    related: ["rail", "coil"],
  },
  {
    id: "flicker",
    term: "点滅(フリッカ)",
    aliases: ["フリッカ", "点滅"],
    short: "タイマ 2 つで、一定の間隔で ON と OFF を繰り返す回路。",
    body: "消灯タイマが時間になったら点灯タイマを動かし、点灯タイマが時間になったら消灯タイマを切ります。すると両方が 0 に戻って最初からやり直すので、点いたり消えたりを繰り返します。",
    circuit: ladder(5)
      .row(no("X0"), nc("T1"), timer("T0", 1000))
      .row(no("T0"), timer("T1", 1000))
      .row(no("T0"), out("Y0"))
      .build(),
    deviceLabels: { X0: "運転", T0: "消灯 1 秒", T1: "点灯 1 秒", Y0: "警告灯" },
    related: ["timer"],
  },
  {
    id: "alternate",
    term: "オルタネート",
    aliases: ["オルタネート"],
    short: "同じボタンを押すたびに、出力が入 → 切 → 入 と交互に切り替わる回路。",
    body: "押した瞬間だけ通す立ち上がり接点で「押した」を 1 スキャンのパルスにし、出力が OFF ならセット、ON ならリセットするラングを組みます。押し続けても 1 回しか切り替わらないのがポイントです。",
    related: ["rise", "relay-m", "selfhold"],
  },
  {
    id: "sequence",
    term: "順序起動",
    aliases: ["順序起動"],
    short: "前の装置が動いていないと次を起動できないようにする回路。",
    body: "2 号機のラングに 1 号機の出力の a 接点を直列に入れると、1 号機が動いているときだけ 2 号機を起動できます。コンベアの下流から順に動かすときの定番です。",
    related: ["series", "selfhold"],
  },
  {
    id: "limit",
    term: "リミットスイッチ",
    aliases: ["リミットスイッチ", "リミット"],
    short: "装置が端まで来たことを知らせる入力。それ以上進まないよう b 接点で止める。",
    body: "上限に当たったら上昇を止め、下限に当たったら下降を止めます。止めたい方向のラングにだけ b 接点を入れるのが決まりで、両方に入れると端から逃げられなくなります。",
    related: ["contact-b", "interlock"],
  },
  {
    id: "behavior-judge",
    term: "振る舞い判定",
    aliases: ["振る舞い判定"],
    short: "回路の形ではなく、入力に対する出力の一致で正誤を決める方式。",
    body: "このアプリの答え合わせは、模範解答と同じ形かどうかは見ません。テストケースの操作をあなたの回路に流し、期待どおりの出力になれば正解です。だから模範解答と違う組み方でも正解になります。",
    related: ["scan"],
  },
];

export function findGlossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// 本文の中の用語を見つける
// ---------------------------------------------------------------------------

export type TextToken =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "term"; text: string; entry: GlossaryEntry };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 英数字だけの語(PLS / RST)は、別の語の一部には当てない */
function aliasPattern(alias: string): string {
  const escaped = escapeRegExp(alias);
  const ascii = /^[A-Za-z0-9 ]+$/.test(alias);
  return ascii ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])` : escaped;
}

function buildMatcher(entries: GlossaryEntry[]): {
  re: RegExp;
  byAlias: Map<string, GlossaryEntry>;
} {
  const byAlias = new Map<string, GlossaryEntry>();
  for (const entry of entries) {
    for (const alias of [entry.term, ...(entry.aliases ?? [])]) {
      if (!byAlias.has(alias)) byAlias.set(alias, entry);
    }
  }
  // 長い語を先に(「オンディレイタイマ」を「タイマ」より先に当てる)
  const aliases = [...byAlias.keys()].sort((a, b) => b.length - a.length);
  return { re: new RegExp(aliases.map(aliasPattern).join("|"), "g"), byAlias };
}

let cached: { entries: GlossaryEntry[]; matcher: ReturnType<typeof buildMatcher> } | undefined;

function matcherFor(entries: GlossaryEntry[]) {
  if (!cached || cached.entries !== entries) cached = { entries, matcher: buildMatcher(entries) };
  return cached.matcher;
}

/**
 * 本文を「地の文 / 強調 / 用語」に分ける。
 *
 * - `**...**` は強調(ヒントで使っている)
 * - 用語は 1 つの本文につき**最初の 1 回だけ**リンクにする。毎回リンクだと読みにくい
 */
export function tokenizeGlossary(text: string, entries: GlossaryEntry[] = GLOSSARY): TextToken[] {
  const tokens: TextToken[] = [];
  const linked = new Set<string>();
  const { re, byAlias } = matcherFor(entries);

  const pushTerms = (plain: string) => {
    let last = 0;
    re.lastIndex = 0;
    for (const m of plain.matchAll(re)) {
      const entry = byAlias.get(m[0]);
      const index = m.index ?? 0;
      if (!entry || linked.has(entry.id)) continue;
      if (index > last) tokens.push({ kind: "text", text: plain.slice(last, index) });
      tokens.push({ kind: "term", text: m[0], entry });
      linked.add(entry.id);
      last = index + m[0].length;
    }
    if (last < plain.length) tokens.push({ kind: "text", text: plain.slice(last) });
  };

  const strong = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(strong)) {
    const index = m.index ?? 0;
    if (index > last) pushTerms(text.slice(last, index));
    tokens.push({ kind: "strong", text: m[1] ?? "" });
    last = index + m[0].length;
  }
  if (last < text.length) pushTerms(text.slice(last));
  return tokens;
}

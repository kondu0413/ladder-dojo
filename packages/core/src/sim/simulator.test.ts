import { describe, expect, it } from "vitest";
import {
  counter,
  fall,
  ladder,
  nc,
  no,
  out,
  pulse,
  reset,
  rise,
  set,
  timer,
  tof,
} from "../builder.js";
import type { Circuit } from "../schema/circuit.js";
import type { DeviceId } from "../schema/device.js";
import { devicePresets, Simulator, splitRungs } from "./simulator.js";

/** 入力を与えて n スキャン回す(時間は進めない) */
function scans(sim: Simulator, n: number): void {
  for (let i = 0; i < n; i++) sim.scan(0);
}

/** 状態が変わらなくなるまでスキャン(最大 20) */
function settle(sim: Simulator): void {
  let prev = JSON.stringify(sim.snapshot());
  for (let i = 0; i < 20; i++) {
    sim.scan(0);
    const cur = JSON.stringify(sim.snapshot());
    if (cur === prev) return;
    prev = cur;
  }
  throw new Error("収束しませんでした(発振)");
}

function press(sim: Simulator, device: DeviceId): void {
  sim.setInput(device, true);
  settle(sim);
  sim.setInput(device, false);
  settle(sim);
}

describe("a接点 / b接点", () => {
  const aContact: Circuit = ladder(3).row(no("X0"), out("Y0")).build();
  const bContact: Circuit = ladder(3).row(nc("X0"), out("Y0")).build();

  it("a接点は入力 ON で通電する", () => {
    const sim = new Simulator(aContact);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
    sim.setInput("X0", false);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
  });

  it("b接点は入力 OFF で通電する", () => {
    const sim = new Simulator(bContact);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
  });

  it("入力はスキャン開始時に取り込まれる", () => {
    const sim = new Simulator(aContact);
    sim.setInput("X0", true);
    // setInput しただけではデバイス像は更新されず、スキャンして初めてコイルに伝わる
    expect(sim.snapshot().bits.Y0).toBe(false);
    sim.scan(0);
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("直列(AND)と並列(OR)", () => {
  const andCircuit = ladder(4).row(no("X0"), no("X1"), out("Y0")).build();
  const orCircuit = ladder(3).row(no("X0"), out("Y0")).row(no("X1")).v(0, 0).build();

  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])("直列: X0=%s X1=%s → Y0=%s", (x0, x1, y0) => {
    const sim = new Simulator(andCircuit);
    sim.setInput("X0", x0);
    sim.setInput("X1", x1);
    settle(sim);
    expect(sim.read("Y0")).toBe(y0);
  });

  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])("並列: X0=%s X1=%s → Y0=%s", (x0, x1, y0) => {
    const sim = new Simulator(orCircuit);
    sim.setInput("X0", x0);
    sim.setInput("X1", x1);
    settle(sim);
    expect(sim.read("Y0")).toBe(y0);
  });

  it("並列の枝をまたいだ合流でも通電する(3 枝)", () => {
    const circuit = ladder(3)
      .row(no("X0"), out("Y0"))
      .row(no("X1"))
      .row(no("X2"))
      .v(0, 0)
      .v(1, 0)
      .build();
    const sim = new Simulator(circuit);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
    sim.setInput("X2", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("自己保持", () => {
  // (X0 または Y0) かつ X1 でない → Y0
  const circuit = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();

  it("起動ボタンを離しても保持され、停止ボタンで解除される", () => {
    const sim = new Simulator(circuit);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);

    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true); // 離しても保持

    press(sim, "X1");
    expect(sim.read("Y0")).toBe(false); // 停止で解除

    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true);
  });

  it("停止ボタンを押している間は起動できない", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X1", true);
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
  });
});

describe("内部リレー(M)", () => {
  it("M を経由して出力に伝わる", () => {
    const circuit = ladder(3).row(no("X0"), out("M0")).row(no("M0"), out("Y0")).build();
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("M0")).toBe(true);
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("スキャン順(S-004)", () => {
  it("上のラングの結果は同じスキャンの下のラングから見える", () => {
    const circuit = ladder(3).row(no("X0"), out("M0")).row(no("M0"), out("Y0")).build();
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    sim.scan(0); // 1 スキャンだけ
    expect(sim.read("M0")).toBe(true);
    expect(sim.read("Y0")).toBe(true);
  });

  it("下のラングの結果は次のスキャンまで上のラングに届かない", () => {
    const circuit = ladder(3)
      .row(no("M0"), out("Y0")) // 先に Y0 を決める
      .row(no("X0"), out("M0")) // 後から M0 を立てる
      .build();
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("M0")).toBe(true);
    expect(sim.read("Y0")).toBe(false); // 1 スキャン遅れる
    sim.scan(0);
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("オンディレイタイマ", () => {
  const circuit = ladder(3).row(no("X0"), timer("T0", 3000)).row(no("T0"), out("Y0")).build();

  it("設定値に達したら ON になる", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("T0")).toBe(false);

    for (let t = 0; t < 2990; t += 10) sim.scan(10);
    expect(sim.timer("T0")?.elapsedMs).toBe(2990);
    expect(sim.read("T0")).toBe(false);

    sim.scan(10);
    expect(sim.timer("T0")?.elapsedMs).toBe(3000);
    expect(sim.read("T0")).toBe(true);
    sim.scan(0);
    expect(sim.read("Y0")).toBe(true);
  });

  it("通電が切れると現在値がリセットされる", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    for (let t = 0; t < 2000; t += 10) sim.scan(10);
    expect(sim.timer("T0")?.elapsedMs).toBe(2000);

    sim.setInput("X0", false);
    sim.scan(10);
    expect(sim.timer("T0")).toEqual({ elapsedMs: 0, done: false });

    sim.setInput("X0", true);
    for (let t = 0; t < 2000; t += 10) sim.scan(10);
    expect(sim.read("T0")).toBe(false); // 1 からやり直し
  });

  it("設定値を超えても現在値は設定値で止まる", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    for (let t = 0; t < 5000; t += 100) sim.scan(100);
    expect(sim.timer("T0")).toEqual({ elapsedMs: 3000, done: true });
  });

  it("instant モードでは通電した瞬間に到達する", () => {
    const sim = new Simulator(circuit, { timerMode: "instant" });
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("T0")).toBe(true);
  });
});

describe("アップカウンタ", () => {
  const circuit = ladder(3)
    .row(no("X0"), counter("C0", 3))
    .row(no("X1"), reset("C0"))
    .row(no("C0"), out("Y0"))
    .build();

  it("立ち上がりを数え、設定値で ON になる", () => {
    const sim = new Simulator(circuit);
    settle(sim);
    expect(sim.counter("C0")).toEqual({ count: 0, done: false });

    press(sim, "X0");
    expect(sim.counter("C0")?.count).toBe(1);
    press(sim, "X0");
    expect(sim.counter("C0")?.count).toBe(2);
    expect(sim.read("Y0")).toBe(false);

    press(sim, "X0");
    expect(sim.counter("C0")).toEqual({ count: 3, done: true });
    expect(sim.read("Y0")).toBe(true);
  });

  it("押しっぱなしでは 1 回しか数えない", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    scans(sim, 10);
    expect(sim.counter("C0")?.count).toBe(1);
  });

  it("設定値を超えて数えない", () => {
    const sim = new Simulator(circuit);
    for (let i = 0; i < 6; i++) press(sim, "X0");
    expect(sim.counter("C0")).toEqual({ count: 3, done: true });
  });

  it("リセットで現在値と done が 0 に戻る", () => {
    const sim = new Simulator(circuit);
    for (let i = 0; i < 3; i++) press(sim, "X0");
    expect(sim.read("C0")).toBe(true);

    press(sim, "X1");
    expect(sim.counter("C0")).toEqual({ count: 0, done: false });
    expect(sim.read("Y0")).toBe(false);
  });
});

describe("立ち上がり微分", () => {
  it("立ち上がり接点は 1 スキャンだけ導通する", () => {
    const circuit = ladder(3).row(rise("X0"), out("Y0")).build();
    const sim = new Simulator(circuit);
    settle(sim);

    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("Y0")).toBe(true);
    sim.scan(0);
    expect(sim.read("Y0")).toBe(false); // 押し続けても 2 スキャン目は OFF

    sim.setInput("X0", false);
    scans(sim, 2);
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("Y0")).toBe(true); // もう一度押せばまた 1 スキャン
  });

  it("立ち上がりコイル(PLS)は 1 スキャンだけ対象を ON にする", () => {
    const circuit = ladder(3).row(no("X0"), pulse("M0")).row(no("M0"), out("Y0")).build();
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("M0")).toBe(true);
    expect(sim.read("Y0")).toBe(true);
    sim.scan(0);
    expect(sim.read("M0")).toBe(false);
    expect(sim.read("Y0")).toBe(false);
  });

  it("立ち上がりで自己保持すると、押しっぱなしでも保持される", () => {
    const circuit = ladder(4).row(rise("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    scans(sim, 5);
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("インターロック", () => {
  const circuit = ladder(5)
    .row(no("X0"), nc("Y1"), out("Y0"))
    .row(no("X1"), nc("Y0"), out("Y1"))
    .build();

  it("先に押した方だけが ON になる", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
    expect(sim.read("Y1")).toBe(false);

    sim.setInput("X1", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
    expect(sim.read("Y1")).toBe(false); // Y0 が ON の間は Y1 は入らない
  });

  it("同時に押すと上のラング(Y0)が優先される", () => {
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    sim.setInput("X1", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
    expect(sim.read("Y1")).toBe(false);
  });
});

describe("通電状態(強調表示用)", () => {
  it("導通している接点と励磁中のコイルが true になる", () => {
    const circuit = ladder(3).row(no("X0"), out("Y0")).build();
    const sim = new Simulator(circuit);
    sim.setInput("X0", true);
    const power = sim.scan(0);
    expect(power.cells[0]?.[0]).toBe(true); // 接点 X0
    expect(power.cells[0]?.[1]).toBe(true); // 横線
    expect(power.cells[0]?.[2]).toBe(true); // コイル Y0
    expect(power.nodes[0]?.[0]).toBe(true); // 左母線

    sim.setInput("X0", false);
    const off = sim.scan(0);
    expect(off.cells[0]?.[0]).toBe(false);
    expect(off.cells[0]?.[2]).toBe(false);
    expect(off.nodes[0]?.[0]).toBe(true); // 左母線は常に通電
  });

  it("並列枝で右側だけ通電している開いた接点は「流れていない」", () => {
    // 自己保持: Y0 が ON のとき、X0 は離していても右側のノードは通電している
    const circuit = ladder(4).row(no("X0"), nc("X1"), out("Y0")).row(no("Y0")).v(0, 0).build();
    const sim = new Simulator(circuit);
    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true);

    const p = sim.power;
    // X0 の左右のノードはどちらも通電している(並列枝が右を押し上げている)
    expect(p.nodes[0]?.[0]).toBe(true);
    expect(p.nodes[0]?.[1]).toBe(true);
    // しかし X0 自身は開いているので、電流は流れていないし導通もしていない
    expect(p.cells[0]?.[0]).toBe(false);
    expect(p.conducts[0]?.[0]).toBe(false);
    // 自己保持の枝(Y0 接点)は流れている
    expect(p.cells[1]?.[0]).toBe(true);
    expect(p.conducts[1]?.[0]).toBe(true);
    // b 接点 X1 とコイルも流れている
    expect(p.cells[0]?.[1]).toBe(true);
    expect(p.cells[0]?.[3]).toBe(true);
  });

  it("通電していなくても閉じている接点は conducts が true", () => {
    // X0 を押さずに X1(b接点)だけを見る。左母線からは X0 で切れている
    const circuit = ladder(4).row(no("X0"), nc("X1"), out("Y0")).build();
    const sim = new Simulator(circuit);
    settle(sim);
    expect(sim.power.conducts[0]?.[1]).toBe(true); // b 接点は閉じている
    expect(sim.power.cells[0]?.[1]).toBe(false); // でも電流は来ていない
  });
});

describe("reset と scans", () => {
  it("reset で全デバイスが初期化される", () => {
    const circuit = ladder(3)
      .row(no("X0"), counter("C0", 2))
      .row(no("X1"), timer("T0", 100))
      .build();
    const sim = new Simulator(circuit);
    press(sim, "X0");
    sim.setInput("X1", true);
    sim.scan(50);
    expect(sim.counter("C0")?.count).toBe(1);
    expect(sim.timer("T0")?.elapsedMs).toBe(50);
    expect(sim.scans).toBeGreaterThan(0);

    sim.reset();
    expect(sim.counter("C0")).toEqual({ count: 0, done: false });
    expect(sim.timer("T0")).toEqual({ elapsedMs: 0, done: false });
    expect(sim.read("X0")).toBe(false);
    expect(sim.scans).toBe(0);
  });
});

describe("splitRungs", () => {
  it("縦線でつながった行を 1 ラングにまとめる", () => {
    const circuit = ladder(3)
      .row(no("X0"), out("Y0"))
      .row(no("X1"))
      .row(no("X2"), out("Y1"))
      .v(0, 0)
      .build();
    expect(splitRungs(circuit)).toEqual([{ rows: [0, 1] }, { rows: [2] }]);
  });
});

describe("入力デバイスの検証", () => {
  it("X 以外に setInput すると例外", () => {
    const sim = new Simulator(ladder(3).row(no("X0"), out("Y0")).build());
    expect(() => sim.setInput("Y0", true)).toThrow(/入力デバイスではありません/);
  });
});

describe("devicePresets", () => {
  it("タイマとカウンタの設定値を集める", () => {
    const circuit = ladder(4)
      .row(no("X0"), counter("C0", 5))
      .row(no("X1"), timer("T0", 3000))
      .row(no("C0"), out("Y0"))
      .build();
    expect(devicePresets(circuit)).toEqual({ timers: { T0: 3000 }, counters: { C0: 5 } });
  });

  it("設定値を持たない回路では空", () => {
    expect(devicePresets(ladder(3).row(no("X0"), out("Y0")).build())).toEqual({
      timers: {},
      counters: {},
    });
  });

  it("RST コイルは設定値を持たないので入らない", () => {
    const circuit = ladder(3).row(no("X0"), counter("C0", 2)).row(no("X1"), reset("C0")).build();
    expect(devicePresets(circuit).counters).toEqual({ C0: 2 });
  });
});

describe("タイマの進め方の切り替え(S-029)", () => {
  const circuit = () => ladder(3).row(no("X0"), timer("T0", 3000)).build();

  it("切り替えてもデバイスの状態は消えない", () => {
    const sim = new Simulator(circuit());
    sim.setInput("X0", true);
    scans(sim, 3);
    sim.scan(1000);
    expect(sim.timer("T0")?.elapsedMs).toBe(1000);

    // 速度を変えても、数えた分は残る
    sim.setTimerMode("instant");
    expect(sim.timer("T0")?.elapsedMs).toBe(1000);
  });

  it("instant にすると、次のスキャンで設定値に達する", () => {
    const sim = new Simulator(circuit());
    sim.setInput("X0", true);
    sim.scan(0);
    expect(sim.read("T0")).toBe(false);

    sim.setTimerMode("instant");
    sim.scan(0);
    expect(sim.read("T0")).toBe(true);
  });

  it("realtime に戻せば、また実時間で進む", () => {
    const sim = new Simulator(circuit(), { timerMode: "instant" });
    sim.setTimerMode("realtime");
    sim.setInput("X0", true);
    sim.scan(0);
    sim.scan(500);
    expect(sim.timer("T0")).toEqual({ elapsedMs: 500, done: false });
  });
});

describe("SET / RST(ビット、S-044)", () => {
  const latch: Circuit = ladder(4).row(no("X0"), set("Y0")).row(no("X1"), reset("Y0")).build();

  it("SET は通電した瞬間に ON にして、切れても保つ", () => {
    const sim = new Simulator(latch);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true);
    scans(sim, 5);
    expect(sim.read("Y0")).toBe(true);
  });

  it("RST で OFF に戻り、離しても OFF のまま", () => {
    const sim = new Simulator(latch);
    press(sim, "X0");
    press(sim, "X1");
    expect(sim.read("Y0")).toBe(false);
    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true);
  });

  it("両方通電しているときは下のラング(RST)が勝つ", () => {
    const sim = new Simulator(latch);
    sim.setInput("X0", true);
    sim.setInput("X1", true);
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
    sim.setInput("X1", false);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
  });

  it("RST でカウンタも従来どおり戻せる", () => {
    const c: Circuit = ladder(4)
      .row(no("X0"), counter("C0", 2))
      .row(no("X1"), reset("C0"))
      .row(no("C0"), out("Y0"))
      .build();
    const sim = new Simulator(c);
    press(sim, "X0");
    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true);
    press(sim, "X1");
    expect(sim.read("Y0")).toBe(false);
    expect(sim.counter("C0")?.count).toBe(0);
  });
});

describe("立ち下がり接点(S-044)", () => {
  it("ON → OFF になったスキャンだけ導通する", () => {
    const c: Circuit = ladder(3).row(fall("X0"), out("Y0")).build();
    const sim = new Simulator(c);
    sim.setInput("X0", true);
    sim.scan();
    sim.scan();
    expect(sim.read("Y0")).toBe(false); // 押しただけでは通らない
    sim.setInput("X0", false);
    sim.scan();
    expect(sim.read("Y0")).toBe(true); // 離した瞬間の 1 スキャン
    sim.scan();
    expect(sim.read("Y0")).toBe(false);
  });

  it("離した回数を数えられる", () => {
    const c: Circuit = ladder(4).row(fall("X0"), counter("C0", 2)).row(no("C0"), out("Y0")).build();
    const sim = new Simulator(c);
    press(sim, "X0");
    expect(sim.counter("C0")?.count).toBe(1);
    press(sim, "X0");
    expect(sim.read("Y0")).toBe(true);
  });
});

describe("オフディレイタイマ(S-044)", () => {
  const c: Circuit = ladder(4).row(no("X0"), tof("T0", 1000)).row(no("T0"), out("Y0")).build();

  it("電源投入直後は OFF、通電した瞬間に ON", () => {
    const sim = new Simulator(c);
    settle(sim);
    expect(sim.read("T0")).toBe(false);
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("T0")).toBe(true);
    expect(sim.read("Y0")).toBe(true);
  });

  it("通電が切れてから設定時間のあいだ ON を保ち、そのあと OFF", () => {
    const sim = new Simulator(c);
    sim.setInput("X0", true);
    settle(sim);
    sim.setInput("X0", false);
    settle(sim);
    expect(sim.read("Y0")).toBe(true);
    for (let i = 0; i < 9; i++) sim.scan(100); // 0.9 秒
    expect(sim.read("Y0")).toBe(true);
    sim.scan(100); // 1.0 秒
    settle(sim);
    expect(sim.read("Y0")).toBe(false);
  });

  it("切れている途中で通電し直すと、また最初から数える", () => {
    const sim = new Simulator(c);
    sim.setInput("X0", true);
    settle(sim);
    sim.setInput("X0", false);
    settle(sim);
    for (let i = 0; i < 8; i++) sim.scan(100);
    sim.setInput("X0", true);
    settle(sim);
    sim.setInput("X0", false);
    settle(sim);
    for (let i = 0; i < 8; i++) sim.scan(100);
    expect(sim.read("Y0")).toBe(true);
    for (let i = 0; i < 3; i++) sim.scan(100);
    expect(sim.read("Y0")).toBe(false);
  });

  it("instant モードでは切れた瞬間に OFF", () => {
    const sim = new Simulator(c, { timerMode: "instant" });
    sim.setInput("X0", true);
    settle(sim);
    expect(sim.read("T0")).toBe(true);
    sim.setInput("X0", false);
    settle(sim);
    expect(sim.read("T0")).toBe(false);
  });

  it("設定値の一覧にオフディレイも入る", () => {
    expect(devicePresets(c).timers).toEqual({ T0: 1000 });
  });
});

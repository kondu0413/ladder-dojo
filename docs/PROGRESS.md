# PROGRESS.md — 進捗

最終更新: 2026-09-15

## 現在のフェーズ: フェーズ1(一人で学べる)— 着手順 3〜4「回路スキーマ + シミュレータコア」まで完了

### 2026-09-15 の作業(着手順 1〜2)
外部サービスの準備完了を受けて実装を開始した。人間の指示に合わせて GitHub Secrets を 3 つ(`CLOUDFLARE_API_TOKEN` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)に減らし、アカウント ID・D1 作成・`BETTER_AUTH_SECRET` 生成を CI に寄せた(DECISIONS.md D-012 追記、SETUP.md 書き直し)。

### 2026-09-15 の作業(着手順 3〜4)
回路 JSON スキーマ(zod)とシミュレータコア、振る舞い判定を `packages/core` に実装した。UI より先にロジックを固める方針(人間の指示)に従い、`apps/web` は空のままにしてある。

### 完了
- [x] 着手順 1: `README.md` と本ファイルの雛形
- [x] 着手順 2: モノレポの骨組み(pnpm workspace、`packages/core`、`apps/web`、`apps/api`)
  - core: 骨組みのみ(`SCHEMA_VERSION`)+ Vitest
  - web: React 19 + Vite 8 + Tailwind v4 + React Router 7。空のトップページ「ラダー図トレーニング」
  - api: Hono on Workers、`GET /api/health`、D1 バインディング、`env.e2e`(`E2E_AUTH_BYPASS`)。vitest-pool-workers(workerd + ローカル D1)で API テスト 4 件
  - E2E: Playwright(Pixel 7 / Desktop Chrome)が `wrangler dev --env e2e` に接続。スモーク 3 件 × 2 プロファイル
  - Biome(lint/format、core の DOM/Node import 禁止、web の drizzle/api 実行時 import 禁止)
  - CI: `ci.yml`(lint → typecheck → unit → API → build → E2E、シークレット不要)/ `deploy.yml`(main、CI 通過後に D1 作成・マイグレーション・deploy・シークレット同期)/ `backup.yml`(週次 D1 export)
  - `.github/actions/cloudflare-setup`(アカウント ID を `wrangler whoami` から、D1 を無ければ作成、`database_id` を実行時に反映)
- [x] `docs/SETUP.md` を Secrets 3 つの手順に書き直し、D1 手動作成とアカウント ID の記述を削除
- [x] `docs/DECISIONS.md` D-012 に追記、`docs/COST.md` を public リポジトリ前提に修正
- [x] 着手順 3: 回路 JSON スキーマ(zod、`packages/core/src/schema/`)
  - `device.ts`: `X0` / `Y0` / `M0` / `T0` / `C0` 形式の検証、用途別(入力・コイル対象・観測対象)のスキーマ
  - `circuit.ts`: グリッド表現(セル = 要素 + 縦線フラグ)。コイルは最右列のみ、セル重複・範囲外・最終行からの縦線を拒否
  - `testcase.ts`: `set` / `press` / `wait` / `expect` の 4 ステップ。待ち時間合計 120 秒・200 ステップの上限つき
  - `problem.ts`: 仕様文・模範解答・テストケース・モード別(読む = 選択式設問、直す = バグ入り初期回路、書く = 白紙)
- [x] 着手順 4: シミュレータコア(`packages/core/src/sim/simulator.ts`)+ ユニットテスト 104 件
  - a/b 接点、立ち上がり接点、出力コイル、立ち上がりコイル(PLS)、オンディレイタイマ、アップカウンタ、カウンタリセット、内部リレー、直列(AND)・並列(OR)の任意の組み合わせ
  - スキャンは「入力取り込み → ラングを上から評価 → コイル即時書き込み」。通電状態(`PowerMap`)を返すので UI の強調表示にそのまま使える
  - 振る舞い判定(`judge/judge.ts`)は同じシミュレータを使う。判定用の別実装は無い(SPEC.md §6)
  - 指標(`metrics.ts`): ラング数・接点数・コイル数・セル数。模範解答との比較表示用で正誤には使わない
  - 回路記述用のビルダー(`builder.ts`)。テストと今後の公式問題を簡潔に書く

### 動作確認(この環境で実行、2026-09-15 着手順 3〜4 時点)
- `pnpm lint` / `pnpm typecheck`: 通過
- `pnpm test`: core 104 件 + API 4 件 通過。core のカバレッジは 文 98.4% / 分岐 91.7% / 関数 100% / 行 100%(D-011 の 90% 目標を満たす。閾値を vitest 設定に入れて CI で強制)
- `pnpm build` → `pnpm e2e`: 6 件通過
- 特に確認した挙動:
  - 自己保持(起動ボタンを離しても保持、停止ボタンで解除、停止を押している間は起動できない)
  - タイマ(2990 ms では OFF、3000 ms で ON、通電が切れると現在値 0 に戻る、設定値で頭打ち)
  - カウンタ(押しっぱなしでは 1 回しか数えない、設定値超で数えない、リセットで 0)
  - 立ち上がり微分(押し続けても 1 スキャンだけ導通)
  - インターロック(同時押しでは上のラングが優先、片方 ON の間はもう片方が入らない)
  - スキャン順(上のラングの結果は同じスキャンの下のラングから見える / 下のラングの結果は次スキャンまで届かない、S-004)
  - 判定(模範解答と形が違う別解でも振る舞いが同じなら正解、バグ回路はどのステップで期待と違ったかを返す、発振回路は unstable)

### 動作確認(着手順 1〜2 時点)
- `pnpm lint` / `pnpm typecheck`: 通過
- `pnpm --filter @ladder-dojo/core test`: 1 件通過
- `pnpm --filter @ladder-dojo/api test`: 4 件通過(workerd 上、ローカル D1 で `select 1`、本番設定に `E2E_AUTH_BYPASS` が無いことを確認)
- `pnpm build` → `pnpm e2e`: 6 件通過(トップ表示、SPA フォールバック、`/api/health` が `env: "e2e"` を返す)
- 初回デプロイ(PR #3 → main、Deploy run [34974133824](https://github.com/kondu0413/ladder-dojo/actions/runs/34974133824)): 成功
  - `wrangler whoami` からアカウント ID を取得(ログはマスク)
  - D1 `ladder-dojo` を CI が作成(ID `8a5c01e6-b1b1-4c6c-843e-1868083c0102`、以後 wrangler.jsonc にも記載)
  - `wrangler deploy` → https://ladder-dojo.mojya.workers.dev(静的アセット 3 ファイル、Worker 起動 4 ms)
  - シークレット `BETTER_AUTH_SECRET`(CI が生成)/ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を登録(3 件 created)
  - この開発環境からは workers.dev への HTTP アクセスがプロキシで拒否されるため、URL の目視確認は人間に依頼(下記)

### 仮置きした点(着手順 3〜4)
- スキャン内の評価順は実機と同じ「コイルは即時反映」(DECISIONS.md S-004)。SPEC.md §3.1 の「出力は次スキャンに反映」は物理出力の書き出しタイミングと解釈した
- 判定は仮想時間(1 スキャン = 10 ms)。UI のシミュレータは実時間で動かす(S-005)
- 回路はグリッド表現。最大 16 列 × 64 行、コイルは最右列のみ(S-006)
- 発振する回路(50 スキャンで収束しない)は `unstable` として不正解にする
- タイマの設定値は 1 ms〜10 分、カウンタは 1〜9999
- `apps/web` のバンドルが zod を含んで gzip 109 KB になった。静的アセットは無料・無制限(COST.md §1.1)なので当面問題ないが、回路エディタ実装後に再確認する

### 仮置きした点(着手順 1〜2)
- `compatibility_date` は `2026-08-01`(vitest-pool-workers 0.22.0 同梱の workerd が 2026-08-22 までしか対応しないため。wrangler 本体はより新しい日付も可)
- vitest は 4.1 系に固定(vitest-pool-workers の peer 要件。vitest 5 は未対応)
- `deploy.yml` の Environment 名 `production`(保護ルール無し。URL 表示のためだけ)
- E2E の Playwright は Chromium のみ(モバイル = Pixel 7 エミュレーション、デスクトップ = Desktop Chrome)
- D1 のロケーションヒントは `apac`

### 人間への依頼
- https://ladder-dojo.mojya.workers.dev を開き「ラダー図トレーニング」の空ページが出ること、https://ladder-dojo.mojya.workers.dev/api/health が `{"ok":true,"env":"production","core":{"schemaVersion":1}}` を返すことを確認してほしい(Claude Code の環境からは workers.dev に到達できない)

### 次にやること(Claude Code)
1. 着手順 5: `apps/api` の骨組み(Better Auth の Google 設定、Drizzle スキーマ、最初のマイグレーション、`requireUser`、権限テスト、`env.e2e` の E2E 専用ログイン)
2. ラダー図の SVG 描画と操作 UI(スマホ対応)
3. 公式問題 30 問以上(自己保持 / タイマ / カウンタ / インターロック / 組み合わせ × 読む / 直す / 書く)
4. 以降 §4 フェーズ1 の DoD を順に潰す

## フェーズ1 DoD(SPEC.md §4)
- [x] シミュレータが §3.1 の全命令を正しく評価し、ユニットテストで網羅されている(core 104 件、カバレッジ 98%)
- [ ] スマホのブラウザで回路の閲覧・操作・編集ができる
- [ ] 公式問題 30 問以上
- [~] 振る舞い判定(core 実装済み・テスト済み)。不正解時の差分表示は UI 未実装
- [~] 指標の算出(core 実装済み)。比較表示は UI 未実装
- [ ] サンドボックスで回路+テストケースを保存できる
- [ ] アカウント登録・ログイン・進捗同期(Google ログインのみ)
- [x] コスト0円でデプロイされ、URL で触れる(骨組みを 2026-09-15 にデプロイ。フェーズ1 完了時に再確認)
- [ ] README・PROGRESS・DECISIONS・COST が最新

## デプロイ URL
- 本番: https://ladder-dojo.mojya.workers.dev(2026-09-15 初回デプロイ済み。空のトップページ + `/api/health`)
- ヘルスチェック: https://ladder-dojo.mojya.workers.dev/api/health

## マージ待ち
なし

## コスト確認
| 日付 | Workers req/日 | D1 読み取り行/日 | D1 書き込み行/日 | D1 サイズ | Actions 分 | 備考 |
|---|---|---|---|---|---|---|
| 2026-09-05 | — | — | — | — | — | 全サービス未作成、0円 |
| 2026-09-14 | — | — | — | — | — | Cloudflare 一本化に変更。全サービス未作成、0円 |
| 2026-09-15 | — | — | — | — | 無制限(public) | 初回デプロイ。0円 |

# PROGRESS.md — 進捗

最終更新: 2026-09-15

## 現在のフェーズ: フェーズ1(一人で学べる)— 着手順 2「モノレポ骨組み・CI・初回デプロイ」

### 2026-09-15 の作業(着手順 1〜2)
外部サービスの準備完了を受けて実装を開始した。人間の指示に合わせて GitHub Secrets を 3 つ(`CLOUDFLARE_API_TOKEN` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)に減らし、アカウント ID・D1 作成・`BETTER_AUTH_SECRET` 生成を CI に寄せた(DECISIONS.md D-012 追記、SETUP.md 書き直し)。

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

### 動作確認(この環境で実行)
- `pnpm lint` / `pnpm typecheck`: 通過
- `pnpm --filter @ladder-dojo/core test`: 1 件通過
- `pnpm --filter @ladder-dojo/api test`: 4 件通過(workerd 上、ローカル D1 で `select 1`、本番設定に `E2E_AUTH_BYPASS` が無いことを確認)
- `pnpm build` → `pnpm e2e`: 6 件通過(トップ表示、SPA フォールバック、`/api/health` が `env: "e2e"` を返す)
- 初回デプロイ: **main マージ後の `deploy.yml` の結果をここに追記する**

### 仮置きした点
- `compatibility_date` は `2026-08-01`(vitest-pool-workers 0.22.0 同梱の workerd が 2026-08-22 までしか対応しないため。wrangler 本体はより新しい日付も可)
- vitest は 4.1 系に固定(vitest-pool-workers の peer 要件。vitest 5 は未対応)
- `deploy.yml` の Environment 名 `production`(保護ルール無し。URL 表示のためだけ)
- E2E の Playwright は Chromium のみ(モバイル = Pixel 7 エミュレーション、デスクトップ = Desktop Chrome)
- D1 のロケーションヒントは `apac`

### 人間への依頼
- (今のところなし)初回デプロイの結果を待って追記する

### 次にやること(Claude Code)
1. 初回デプロイの確認(URL で空のページと `/api/health` が見えること)→ 本ファイルに記録して報告
2. 着手順 3: 回路 JSON スキーマ(zod)— `Circuit` / `TestCase` / `Problem`、`schemaVersion`
3. 着手順 4: シミュレータのコア(§3.1)+ ユニットテスト
4. 着手順 5: `apps/api` の骨組み(Better Auth の Google 設定、Drizzle スキーマ、最初のマイグレーション、`requireUser`、権限テスト、`env.e2e` の E2E 専用ログイン)
5. 以降 §4 フェーズ1 の DoD を順に潰す

## フェーズ1 DoD(SPEC.md §4)
- [ ] シミュレータが §3.1 の全命令を正しく評価し、ユニットテストで網羅されている
- [ ] スマホのブラウザで回路の閲覧・操作・編集ができる
- [ ] 公式問題 30 問以上
- [ ] 振る舞い判定と不正解時の差分表示
- [ ] 模範解答と指標の比較表示
- [ ] サンドボックスで回路+テストケースを保存できる
- [ ] アカウント登録・ログイン・進捗同期(Google ログインのみ)
- [ ] コスト0円でデプロイされ、URL で触れる(骨組みは着手順 2 でデプロイ)
- [ ] README・PROGRESS・DECISIONS・COST が最新

## デプロイ URL
- 本番: https://ladder-dojo.mojya.workers.dev(初回デプロイの結果を下に追記)
- ヘルスチェック: https://ladder-dojo.mojya.workers.dev/api/health

## マージ待ち
なし

## コスト確認
| 日付 | Workers req/日 | D1 読み取り行/日 | D1 書き込み行/日 | D1 サイズ | Actions 分 | 備考 |
|---|---|---|---|---|---|---|
| 2026-09-05 | — | — | — | — | — | 全サービス未作成、0円 |
| 2026-09-14 | — | — | — | — | — | Cloudflare 一本化に変更。全サービス未作成、0円 |
| 2026-09-15 | — | — | — | — | 無制限(public) | 初回デプロイ。0円 |

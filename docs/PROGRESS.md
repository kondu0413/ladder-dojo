# PROGRESS.md — 進捗

最終更新: 2026-09-14

## 現在のフェーズ: フェーズ0(技術選定・環境準備)

### 2026-09-14 の変更: D-006 差し戻し → Cloudflare 一本化
人間の指示により Supabase を廃止し、Workers(Static Assets)+ Hono + D1 + Drizzle + Better Auth に変更した(`docs/DECISIONS.md` D-006 / D-017 / D-018、変更履歴の表)。認証は Google ログインのみ(メール/パスワードと SMTP は保留、D-007 / D-008)。**実装はまだ着手していない**。

### 完了
- [x] 技術スタック選定と理由の記録(`docs/DECISIONS.md`)— 2026-09-14 に Cloudflare 一本化へ改訂
- [x] 無料枠上限と縮退方針の記録(`docs/COST.md`)— Workers / D1 の無料枠に書き直し
- [x] 外部サービスのセットアップ手順(`docs/SETUP.md`)— 人間の作業を Cloudflare・Google Cloud・GitHub Secrets の 3 つに縮小
- [x] `.env.example` / `.gitignore` — Supabase / Brevo の項目を削除、Better Auth / Google の項目に置換
- [x] SPEC.md §2.4 に「API 層の権限判定はテスト必須」を追記(人間の指示)
- [x] D-017 に「一覧取得は JOIN またはバッチ、ループ内クエリ禁止」の方針 7 を追加し、COST.md に D1 Free の「1 リクエストあたりクエリ 50 回」制限を追記(人間の指示、マージ後)

### 人間にお願いしたいこと(今の時点)
- `docs/DECISIONS.md` の改訂内容(特に D-014 の「E2E 専用ログイン」= E2E 環境でのみ Better Auth のメール/パスワードを有効化する方式、D-012 の「本番マイグレーションに手動承認を置かない」)に異論がないか確認。異論があれば差し戻す
- `docs/COST.md` の無料枠の数値のうち、特に **D1 の 1 データベース上限(Free 500 MB)** と **Time Travel(Free 7 日)** を Cloudflare の制限ページで確認して「確認日」を埋める。人間の指示にあった「D1 5 GB」はアカウント合計で、1 DB あたりは 500 MB と把握している(要確認)
- **今すぐ外部サービスの作業をする必要はない**。フェーズ1 のデプロイ時点で SETUP.md §1〜§3 をお願いする旨をここに書く。先にやっても問題ない

### 次にやること(Claude Code)
1. モノレポ初期化(pnpm workspace、`packages/core`、`apps/web`、`apps/api`、Biome、Vitest、vitest-pool-workers、Playwright、GitHub Actions の `ci.yml`)
2. 回路 JSON スキーマ(zod)の定義
3. シミュレータコア(スキャン、a/b接点、コイル、内部リレー、タイマ、カウンタ、立ち上がり微分)+ ユニットテスト
4. `apps/api` の骨組み(Hono、Better Auth の Google 設定、Drizzle スキーマ、最初のマイグレーション、`requireUser` ミドルウェアと権限テスト、`env.e2e` の E2E 専用ログイン)

## フェーズ1 DoD(SPEC.md §4)
- [ ] シミュレータが §3.1 の全命令を正しく評価し、ユニットテストで網羅されている
- [ ] スマホのブラウザで回路の閲覧・操作・編集ができる
- [ ] 公式問題 30 問以上
- [ ] 振る舞い判定と不正解時の差分表示
- [ ] 模範解答と指標の比較表示
- [ ] サンドボックスで回路+テストケースを保存できる
- [ ] アカウント登録・ログイン・進捗同期(Google ログインのみ)
- [ ] コスト0円でデプロイされ、URL で触れる
- [ ] README・PROGRESS・DECISIONS・COST が最新

## デプロイ URL
未デプロイ。予定: `https://ladder-dojo.<workers.dev サブドメイン>.workers.dev`

## コスト確認
| 日付 | Workers req/日 | D1 読み取り行/日 | D1 書き込み行/日 | D1 サイズ | Actions 分 | 備考 |
|---|---|---|---|---|---|---|
| 2026-09-05 | — | — | — | — | — | 全サービス未作成、0円 |
| 2026-09-14 | — | — | — | — | — | Cloudflare 一本化に変更。全サービス未作成、0円 |

# SETUP.md — 外部サービスのセットアップ手順(人間用)

この手順は **人間が行う作業** だけを書いている。コードの実装・CI 設定ファイル(`.github/workflows/*.yml`、`apps/api/wrangler.jsonc`)の作成、Worker へのシークレット設定、D1 マイグレーションの適用は Claude Code が行う。
所要時間の目安: 全部で 30〜40 分。すべて無料プランで、クレジットカードは不要。

> 2026-09-14 改訂: Supabase と Brevo は使わない(DECISIONS.md D-006 / D-008)。人間の作業は **Cloudflare・Google Cloud・GitHub Secrets の 3 つだけ**。

## 0. 全体像と「いつ必要か」

| 時点 | 必要になる作業 | 理由 |
|---|---|---|
| **A. ローカル開発〜認証実装**(今〜フェーズ1 中盤) | **なし** | シミュレータ・公式問題・サンドボックスはサーバー不要。認証・保存の実装とテストも Wrangler のローカル D1 と E2E 専用ログインで完結する(D-014) |
| **B. デプロイ時点**(フェーズ1 終盤) | §1 Cloudflare、§2 Google Cloud、§3 GitHub Secrets | 公開 URL と Google ログイン |
| **C. フェーズ2 / 3** | (追加作業なし) | 同じ Worker と D1 を使い続ける |

**進め方**: Claude Code が `docs/PROGRESS.md` に「B の準備をお願いします」と書いた時点で §1 → §2 → §3 の順に行う。先にまとめてやっても問題ない(A の間は何もしなくてよい)。

### 用意するもの
- Google アカウント(Cloudflare / Google Cloud のサインインに使う)
- パスワードマネージャ(取得したキーの保管先。**キーを Slack や Issue に貼らない**)
- 手元で動かす場合のみ Node.js 22 LTS と pnpm(`corepack enable && corepack prepare pnpm@latest --activate`)。必須ではない

### 作業が終わったら Claude Code に伝える値(秘密ではないもの)
以下の 3 つは秘密ではないので、PR コメントや `docs/PROGRESS.md` に書いて伝えてよい。Claude Code が `apps/api/wrangler.jsonc` に反映する。

| 値 | どこで分かるか |
|---|---|
| Cloudflare の **workers.dev サブドメイン**(例: `example.workers.dev` の `example`) | §1.2 |
| **D1 データベース ID**(UUID) | §1.3 |
| Worker 名を `ladder-dojo` 以外にした場合、その名前 | §1.2 |

秘密の値(API トークン、Google のクライアントシークレット、`BETTER_AUTH_SECRET`)は **GitHub Secrets にだけ**入れる(§3)。Claude Code には「登録した」とだけ伝える。

---

## 1. Cloudflare(ホスティング・API・DB)— B 時点

### 1.1 アカウント
1. https://dash.cloudflare.com/sign-up でアカウント作成(メール + パスワード。カード不要。プランは Free)。既にアカウントがあればログイン
2. 左メニュー「Workers & Pages」を開く。初回は **`<なにか>.workers.dev` のサブドメイン名**を決めるよう促される。任意でよい(例: 自分のハンドル名)。本番 URL は `https://ladder-dojo.<このサブドメイン>.workers.dev` になる

### 1.2 workers.dev サブドメインとアカウント ID を控える
「Workers & Pages」→ 概要ページの右側に以下がある。両方コピーする。
- **Subdomain**: `xxxx.workers.dev` の `xxxx` 部分 → Claude Code に伝える(秘密ではない)。もし表示されない場合は「Change」から設定する
- **Account ID** → `CLOUDFLARE_ACCOUNT_ID`(§3 で GitHub Secrets に入れる。ダッシュボードの URL `https://dash.cloudflare.com/<ここ>/...` と同じ)

Worker(`ladder-dojo`)自体は **作らなくてよい**。最初の `wrangler deploy`(CI)が自動で作る。

### 1.3 D1 データベースの作成
1. 左メニュー「Storage & Databases」→「D1 SQL Database」→「Create Database」
2. 以下で作成
   | 項目 | 値 |
   |---|---|
   | Database name | `ladder-dojo` |
   | Location(表示される場合) | `Asia Pacific (APAC)`。表示されなければ自動でよい |
3. 作成後のデータベース画面(または一覧)に表示される **Database ID**(UUID)をコピー → Claude Code に伝える(秘密ではない)
4. テーブルは作らない。マイグレーションは CI の `wrangler d1 migrations apply` が行う

### 1.4 API トークン(CI がデプロイ・マイグレーション・シークレット設定に使う)
1. 右上アバター →「My Profile」→「API Tokens」→「Create Token」
2. テンプレート「**Edit Cloudflare Workers**」の「Use template」を選び、**権限に D1 を追加**する:
   | Permissions | 値 |
   |---|---|
   | (テンプレート既定)Account → Workers Scripts | Edit |
   | (テンプレート既定)Account → Account Settings | Read |
   | (テンプレート既定)User → User Details | Read |
   | **追加** Account → D1 | **Edit** |
   | Account Resources | Include → 自分のアカウント |
   - テンプレートに含まれる Workers KV / R2 / Routes などの権限はそのままでよい(使わないだけ)。最小にしたい場合は「Create Custom Token」で上の 4 行だけを付ける
3. 「Continue to summary」→「Create Token」→ 表示されたトークンを保存 → `CLOUDFLARE_API_TOKEN`(**この画面を閉じると再表示できない**)

### 1.5 Worker のシークレット・環境変数について(人間の作業なし)
`BETTER_AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は、CI(`deploy.yml`)が GitHub Secrets から `wrangler secret` で Worker に流し込む。Cloudflare のダッシュボードで手入力する必要はない。

---

## 2. Google Cloud(Google ログイン用 OAuth クライアント)— B 時点

課金アカウントは不要。無料。**既存の OAuth クライアント(`ladder-dojo-web`)のリダイレクト URI を Supabase 用から Worker 用に差し替える**作業が中心。

### 2.1 リダイレクト URI と生成元の差し替え
1. https://console.cloud.google.com/ にログインし、プロジェクト `ladder-dojo` を選択
2. 「API とサービス」→「認証情報」→ OAuth 2.0 クライアント ID `ladder-dojo-web` を開く
3. 以下のように編集して保存(`<サブドメイン>` は §1.2 の値)
   | 項目 | 削除する値 | 設定する値 |
   |---|---|---|
   | 承認済みの JavaScript 生成元 | (Supabase 関連があれば削除) | `https://ladder-dojo.<サブドメイン>.workers.dev`、`http://localhost:5173`(手元で動かす場合) |
   | 承認済みのリダイレクト URI | `https://<ref>.supabase.co/auth/v1/callback` | `https://ladder-dojo.<サブドメイン>.workers.dev/api/auth/callback/google`、`http://localhost:5173/api/auth/callback/google`(手元で動かす場合) |
4. 反映まで数分〜かかることがある

> **OAuth クライアントをまだ作っていない場合**: 「API とサービス」→「OAuth 同意画面」(新UIでは「Google Auth Platform」→「ブランディング」)で対象 **外部**、アプリ名 `ラダー図トレーニング`、サポートメール・連絡先に自分のメール、スコープは追加不要(既定の `email` `profile` `openid`)で作成 → 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」→ 種類「ウェブ アプリケーション」、名前 `ladder-dojo-web`、生成元とリダイレクト URI は上の表の「設定する値」

### 2.2 クライアント ID とシークレットを控える
同じクライアントの画面で:
- **クライアント ID**(`....apps.googleusercontent.com`)→ `GOOGLE_CLIENT_ID`
- **クライアント シークレット** → `GOOGLE_CLIENT_SECRET`。作成時に保存していない場合は「クライアント シークレットを追加」(または「シークレットをリセット」)で新しいものを発行し、古いものを無効化する

以前は Supabase のダッシュボードに貼っていたが、今回は **§3 で GitHub Secrets に入れる**(アプリのコードや `.env` には入れない)。

### 2.3 公開ステータス(公開前に必ず)
「OAuth 同意画面」→ 公開ステータスを「テスト」から「**本番環境**」に切り替える(テスト中は 100 ユーザーまでしかログインできない)。`email/profile` のみなら Google の審査は不要。

---

## 3. GitHub リポジトリの設定 — B 時点

### 3.1 `BETTER_AUTH_SECRET` を生成する
セッション Cookie の署名に使うランダム文字列。ターミナルで生成し、パスワードマネージャに保存する:
```
openssl rand -base64 32
```
(ターミナルがない場合は https://generate-secret.vercel.app/32 のような生成サービスでも可。32 バイト以上ならよい)

### 3.2 Actions Secrets
リポジトリ → Settings → Secrets and variables → Actions →「New repository secret」で以下の **5 つ**を登録する。

| Secret 名 | 値の出どころ | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | §1.4 | Worker のデプロイ・D1 マイグレーション・シークレット設定 |
| `CLOUDFLARE_ACCOUNT_ID` | §1.2 | 同上 |
| `BETTER_AUTH_SECRET` | §3.1 | セッション Cookie の署名(CI が Worker に設定) |
| `GOOGLE_CLIENT_ID` | §2.2 | Google ログイン(CI が Worker に設定) |
| `GOOGLE_CLIENT_SECRET` | §2.2 | 同上 |

PR の CI(lint / テスト / E2E)はこれらを使わない。使うのは `main` へのマージ後の `deploy.yml` と週次の `backup.yml` だけ。

### 3.3 Actions の有効化確認
Settings → Actions → General → 「Allow all actions and reusable workflows」であることを確認。

GitHub Environments(手動承認)は **作らなくてよい**(D-012: 本番マイグレーションは 2 段階の追加専用変更 + Time Travel で担保する)。

---

## 4. GitHub と Cloudflare の連携のしくみ(参考)

```
git push (feature branch / PR)
   └─ GitHub Actions: ci.yml(シークレット不要)
        lint → typecheck → unit(core) → API テスト(ローカル D1)
        → build → E2E(wrangler dev + ローカル D1 + E2E 専用ログイン)

git push (main)
   └─ ci.yml 成功時のみ deploy.yml
        wrangler d1 migrations apply ladder-dojo --remote
        wrangler deploy                      … Worker(静的アセット + API)を更新
        wrangler secret bulk                 … GitHub Secrets → Worker のシークレット
          └─ https://ladder-dojo.<サブドメイン>.workers.dev が更新される

毎週
   └─ backup.yml: wrangler d1 export → Actions アーティファクト(4 世代)
```

- 人間が行うのは §1〜§3 のみ。ワークフローファイルと `apps/api/wrangler.jsonc` は Claude Code が作る
- Cloudflare 側で GitHub 連携(Workers Builds の「Connect to Git」)は **設定しない**。設定すると CI と二重にデプロイされ、テスト失敗時もデプロイされてしまう
- プレビューデプロイは行わない(D-012)。PR の動作確認はローカル E2E の結果と、必要なら手元での `pnpm dev`
- デプロイ先 URL は `docs/PROGRESS.md` に Claude Code が記載する

---

## 5. 手元で動かす場合(任意)

Claude Code の開発・テストは手元の環境を必要としない。人間が触って確認したい場合のみ:

1. `pnpm install`
2. `cp .env.example .env.local` して、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`(§2.2)と `BETTER_AUTH_SECRET`(何でもよい。`openssl rand -base64 32`)を記入
3. `pnpm dev` … Vite(`http://localhost:5173`)と `wrangler dev`(ローカル D1、`http://localhost:8787`)が同時に起動し、`/api` は Vite からプロキシされる。初回はローカル D1 にマイグレーションが自動適用される
4. Google ログインを試すには §2.1 の `http://localhost:5173/...` の 2 行が登録されている必要がある。試さないなら不要
5. `.env.local` は `.gitignore` 済み。コミットされないことを `git status` で確認

---

## 6. 環境変数 一覧(まとめ)

「置き場所」の凡例: **local** = リポジトリ直下 `.env.local`(手元で動かす場合のみ)/ **GH** = GitHub Actions Secrets / **CF** = Worker のシークレット(CI が GH から自動設定。人間は触らない)/ **wrangler.jsonc** = リポジトリにコミットする設定(秘密でない値)

| 変数名 | いつから必要 | 置き場所 | 用途 | 取得場所 |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | B デプロイ時点 | GH(local は手動デプロイ時のみ) | wrangler によるデプロイ・D1 操作 | Cloudflare → My Profile → API Tokens(§1.4) |
| `CLOUDFLARE_ACCOUNT_ID` | B デプロイ時点 | GH(local は手動デプロイ時のみ) | 同上 | Cloudflare → Workers & Pages → Account ID(§1.2) |
| `BETTER_AUTH_SECRET` | B デプロイ時点(local は認証を試すとき) | GH → CF、local | セッション Cookie の署名鍵 | 自分で生成(§3.1) |
| `GOOGLE_CLIENT_ID` | B デプロイ時点(local は認証を試すとき) | GH → CF、local | Google ログイン | Google Cloud → 認証情報(§2.2) |
| `GOOGLE_CLIENT_SECRET` | B デプロイ時点(local は認証を試すとき) | GH → CF、local | 同上 | 同上 |
| `BETTER_AUTH_URL` | — | wrangler.jsonc の `vars`(本番 URL)/ ローカルは既定値 `http://localhost:5173` | Better Auth が OAuth のコールバック URL を組み立てる基準 | 秘密でない。Claude Code が設定 |
| D1 の `database_id` | B デプロイ時点 | wrangler.jsonc の `d1_databases` | Worker と D1 の紐付け | Cloudflare → D1(§1.3)。秘密でない |
| `E2E_AUTH_BYPASS` | — | wrangler.jsonc の `env.e2e.vars` のみ | E2E 専用ログインの有効化。**本番には存在しない** | Claude Code が設定 |
| `E2E_BASE_URL` | — | local / GH(任意) | Playwright の接続先。未設定なら `wrangler dev` を自動起動 | 通常は設定不要 |

**アプリの環境変数に入れないもの**: なし。以前 Supabase・Brevo のダッシュボードに設定していた値は、すべて GitHub Secrets 経由に置き換わった。

---

## 7. トラブル時

| 症状 | 対処 |
|---|---|
| Google ログインで `redirect_uri_mismatch` | §2.1 のリダイレクト URI が `https://ladder-dojo.<サブドメイン>.workers.dev/api/auth/callback/google` と一字一句一致しているか確認(末尾のスラッシュ・`http`/`https`)。保存後 5 分ほど待つ |
| Google ログインで「このアプリは確認されていません」 | `email/profile` のみなら「詳細」→「(安全ではないページ)に移動」で通る。公開ステータスを「本番環境」にしていれば通常表示されない |
| Google ログインで 100 ユーザー上限エラー | §2.3 の公開ステータス切替を行う |
| ログイン後すぐログアウトされる / セッションが保持されない | Worker のシークレット `BETTER_AUTH_SECRET` が未設定か、デプロイごとに変わっている。GitHub Secrets の値を確認し、Claude Code に `deploy.yml` の再実行を依頼 |
| GitHub Actions のデプロイが 403 / `Authentication error` | API トークンの権限に Workers Scripts: Edit と **D1: Edit** が含まれているか確認。トークンを作り直して Secret を更新 |
| `wrangler d1 migrations apply` が失敗 | Database ID が `wrangler.jsonc` と一致しているか確認。データを壊した疑いがあれば D1 の Time Travel(7 日以内)で復元できる。Claude Code に「Time Travel で <日時> に戻して」と依頼 |
| Cloudflare のダッシュボードで「Free plan limit」の警告 | `docs/COST.md` §1.1 / §1.2 の縮退方針に従う。Claude Code に該当項目を伝える |
| GitHub Actions のスケジュール(backup)が動かない | 60 日間活動がないと停止する。Actions タブで該当ワークフローを開き「Enable workflow」 |

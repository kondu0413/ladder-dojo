# SETUP.md — 外部サービスのセットアップ手順(人間用)

この手順は **人間が行う作業** だけを書いている。それ以外(CI 設定、`apps/api/wrangler.jsonc`、D1 データベースの作成、マイグレーション、Worker へのシークレット設定、デプロイ)はすべて Claude Code と CI が行う。
所要時間の目安: 20〜30 分。すべて無料プランで、クレジットカードは不要。

> 2026-09-15 改訂: 人間が GitHub Secrets に入れる値は **`CLOUDFLARE_API_TOKEN` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` の 3 つだけ**。
> Cloudflare のアカウント ID は CI が `wrangler whoami` で取得し、D1 データベースは CI が無ければ作成し、`BETTER_AUTH_SECRET` は CI が初回に生成して Worker に登録する(DECISIONS.md D-012)。
> 開発はクラウドの Claude Code + GitHub のみ。ローカル PC・`.env.local` は前提にしない。

## 0. 全体像

| 時点 | 必要になる作業 | 理由 |
|---|---|---|
| **A. デプロイ前** | **なし** | シミュレータ・公式問題・サンドボックスはサーバー不要。認証・保存の実装とテストも Wrangler のローカル D1 と E2E 専用ログインで完結する(D-014) |
| **B. 初回デプロイ** | §1 Cloudflare、§2 Google Cloud、§3 GitHub Secrets | 公開 URL と Google ログイン |
| **C. フェーズ2 / 3** | (追加作業なし) | 同じ Worker と D1 を使い続ける |

### 用意するもの
- Google アカウント(Cloudflare / Google Cloud のサインインに使う)
- パスワードマネージャ(取得したキーの保管先。**キーを Slack や Issue に貼らない**)

### Claude Code に伝える値(秘密ではないもの)

| 値 | どこで分かるか |
|---|---|
| Cloudflare の **workers.dev サブドメイン**(例: `example.workers.dev` の `example`) | §1.2 |

本番 URL は `https://ladder-dojo.<サブドメイン>.workers.dev` になる。Claude Code が `apps/api/wrangler.jsonc` の `BETTER_AUTH_URL` に反映する。現在の値は `mojya`(URL: https://ladder-dojo.mojya.workers.dev)。

秘密の値(API トークン、Google のクライアントシークレット)は **GitHub Secrets にだけ**入れる(§3)。Claude Code には「登録した」とだけ伝える。

---

## 1. Cloudflare(ホスティング・API・DB)

### 1.1 アカウント
1. https://dash.cloudflare.com/sign-up でアカウント作成(メール + パスワード。カード不要。プランは Free)。既にアカウントがあればログイン
2. 左メニュー「Workers & Pages」を開く。初回は **`<なにか>.workers.dev` のサブドメイン名**を決めるよう促される。任意でよい

### 1.2 workers.dev サブドメインを控える
「Workers & Pages」→ 概要ページの右側「Subdomain」の `xxxx.workers.dev` の `xxxx` 部分 → Claude Code に伝える(秘密ではない)。表示されない場合は「Change」から設定する。

Worker(`ladder-dojo`)と D1 データベース(`ladder-dojo`)は **作らなくてよい**。初回の `deploy.yml`(CI)が自動で作る。アカウント ID も控える必要はない(CI が `wrangler whoami` で取得する)。

### 1.3 API トークン(CI がデプロイ・D1 作成/マイグレーション・シークレット設定に使う)
1. 右上アバター →「My Profile」→「API Tokens」→「Create Token」
2. テンプレート「**Edit Cloudflare Workers**」の「Use template」を選び、**権限に D1 を追加**する:
   | Permissions | 値 |
   |---|---|
   | (テンプレート既定)Account → Workers Scripts | Edit |
   | (テンプレート既定)Account → Account Settings | Read |
   | (テンプレート既定)User → User Details | Read |
   | **追加** Account → D1 | **Edit** |
   | Account Resources | Include → 自分のアカウント |
   - `Account Settings: Read` と `User Details: Read` は `wrangler whoami` でアカウント ID を取得するために必要。外さないこと
   - テンプレートに含まれる Workers KV / R2 / Routes などの権限はそのままでよい(使わないだけ)
3. 「Continue to summary」→「Create Token」→ 表示されたトークンを保存 → `CLOUDFLARE_API_TOKEN`(**この画面を閉じると再表示できない**)

### 1.4 Worker のシークレットについて(人間の作業なし)
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は CI(`deploy.yml`)が GitHub Secrets から `wrangler secret bulk` で Worker に流し込む。`BETTER_AUTH_SECRET` は CI が Worker に未登録のときだけ `openssl rand -base64 32` で生成して登録する(値は誰も見ない・保管しない。作り直したいときは Cloudflare ダッシュボードで Worker のシークレットを削除して `deploy.yml` を再実行する)。

---

## 2. Google Cloud(Google ログイン用 OAuth クライアント)

課金アカウントは不要。無料。

### 2.1 OAuth クライアント
1. https://console.cloud.google.com/ にログインし、プロジェクト `ladder-dojo` を選択(無ければ作成)
2. 「API とサービス」→「OAuth 同意画面」(新 UI では「Google Auth Platform」→「ブランディング」)で対象 **外部**、アプリ名 `ラダー図トレーニング`、サポートメール・連絡先に自分のメール、スコープは追加不要(既定の `email` `profile` `openid`)
3. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」→ 種類「ウェブ アプリケーション」、名前 `ladder-dojo-web`
   | 項目 | 値(`<サブドメイン>` は §1.2) |
   |---|---|
   | 承認済みの JavaScript 生成元 | `https://ladder-dojo.<サブドメイン>.workers.dev` |
   | 承認済みのリダイレクト URI | `https://ladder-dojo.<サブドメイン>.workers.dev/api/auth/callback/google` |
4. 反映まで数分〜かかることがある

### 2.2 クライアント ID とシークレットを控える
- **クライアント ID**(`....apps.googleusercontent.com`)→ `GOOGLE_CLIENT_ID`
- **クライアント シークレット** → `GOOGLE_CLIENT_SECRET`。保存していない場合は「クライアント シークレットを追加」で新しいものを発行し、古いものを無効化する

### 2.3 公開ステータス
「OAuth 同意画面」→ 公開ステータスを「テスト」から「**本番環境**」に切り替える(テスト中は 100 ユーザーまで)。`email/profile` のみなら Google の審査は不要。

---

## 3. GitHub リポジトリの設定

### 3.1 Actions Secrets
リポジトリ → Settings → Secrets and variables → Actions →「New repository secret」で以下の **3 つ**を登録する。

| Secret 名 | 値の出どころ | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | §1.3 | Worker のデプロイ・D1 作成/マイグレーション/バックアップ・シークレット設定 |
| `GOOGLE_CLIENT_ID` | §2.2 | Google ログイン(CI が Worker に設定) |
| `GOOGLE_CLIENT_SECRET` | §2.2 | 同上 |

PR の CI(lint / テスト / E2E)はこれらを使わない。使うのは `main` へのマージ後の `deploy.yml` と週次の `backup.yml` だけ。

### 3.2 Actions の有効化確認
Settings → Actions → General → 「Allow all actions and reusable workflows」であることを確認。

GitHub Environments(手動承認)は **作らなくてよい**。`deploy.yml` は `production` という Environment 名を使うが、保護ルール無しで自動作成される。

### 3.3 リポジトリの公開設定
リポジトリは public。Actions の実行時間に上限はない(COST.md §1.4)。

---

## 4. GitHub と Cloudflare の連携のしくみ(参考)

```
git push (feature branch / PR)
   └─ GitHub Actions: ci.yml(シークレット不要)
        lint → typecheck → unit(core) → API テスト(ローカル D1)
        → build → E2E(wrangler dev --env e2e + ローカル D1)

git push (main)
   └─ deploy.yml: ci.yml を呼び出し → 成功時のみ
        wrangler whoami                      … アカウント ID を取得
        wrangler d1 list / create            … D1 `ladder-dojo` が無ければ作成、ID を wrangler.jsonc に反映
        wrangler d1 migrations apply --remote
        wrangler deploy                      … Worker(静的アセット + API)を更新
        wrangler secret bulk                 … GOOGLE_* を同期、BETTER_AUTH_SECRET は初回のみ生成
          └─ https://ladder-dojo.<サブドメイン>.workers.dev が更新される

毎週月曜 03:00 JST
   └─ backup.yml: wrangler d1 export → Actions アーティファクト(28 日保持 = 4 世代)
```

- Cloudflare 側で GitHub 連携(Workers Builds の「Connect to Git」)は **設定しない**。設定すると CI と二重にデプロイされ、テスト失敗時もデプロイされてしまう
- プレビューデプロイは行わない(D-012)。PR の動作確認はローカル E2E の結果で行う

---

## 5. 手元で動かす場合(任意・非推奨)

開発は Claude Code(クラウド)のみで行う前提だが、人間が手元で触りたい場合:

1. Node.js 22 と pnpm(`corepack enable && corepack prepare pnpm@10.33.0 --activate`)
2. `pnpm install` → `pnpm dev`(Vite `http://localhost:5173` + `wrangler dev` ローカル D1 `http://localhost:8787`)
3. Google ログインを試す場合は `.env.example` を `.env.local` にコピーして `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `BETTER_AUTH_SECRET`(任意の文字列)を入れ、Google Cloud のクライアントに `http://localhost:5173` と `http://localhost:5173/api/auth/callback/google` を追加する
4. `.env.local` は `.gitignore` 済み

---

## 6. 環境変数 一覧(まとめ)

「置き場所」の凡例: **GH** = GitHub Actions Secrets / **CF** = Worker のシークレット(CI が設定。人間は触らない)/ **wrangler.jsonc** = リポジトリにコミットする設定(秘密でない値)

| 変数名 | 置き場所 | 用途 | 出どころ |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GH | wrangler によるデプロイ・D1 操作 | Cloudflare → My Profile → API Tokens(§1.3) |
| `GOOGLE_CLIENT_ID` | GH → CF | Google ログイン | Google Cloud → 認証情報(§2.2) |
| `GOOGLE_CLIENT_SECRET` | GH → CF | 同上 | 同上 |
| `CLOUDFLARE_ACCOUNT_ID` | (CI が実行時に `wrangler whoami` で取得。どこにも保存しない) | 同上 | — |
| `BETTER_AUTH_SECRET` | CF(CI が初回に生成) | セッション Cookie の署名鍵 | — |
| `BETTER_AUTH_URL` | wrangler.jsonc の `vars` | Better Auth のコールバック URL の基準 | Claude Code が設定 |
| `APP_ENV` | wrangler.jsonc の `vars` | `production` / `e2e` の識別 | Claude Code が設定 |
| D1 の `database_id` | wrangler.jsonc(CI が実行時に上書き) | Worker と D1 の紐付け | CI が `wrangler d1 list` で取得 |
| `E2E_AUTH_BYPASS` | wrangler.jsonc の `env.e2e.vars` のみ | E2E 専用ログインの有効化。**本番には存在しない** | Claude Code が設定 |
| `E2E_BASE_URL` | 任意 | Playwright の接続先。未設定なら `wrangler dev` を自動起動 | 通常は設定不要 |

---

## 7. トラブル時

| 症状 | 対処 |
|---|---|
| Google ログインで `redirect_uri_mismatch` | §2.1 のリダイレクト URI が `https://ladder-dojo.<サブドメイン>.workers.dev/api/auth/callback/google` と一字一句一致しているか確認(末尾のスラッシュ・`http`/`https`)。保存後 5 分ほど待つ |
| Google ログインで「このアプリは確認されていません」 | `email/profile` のみなら「詳細」→「(安全ではないページ)に移動」で通る。公開ステータスを「本番環境」にしていれば通常表示されない |
| Google ログインで 100 ユーザー上限エラー | §2.3 の公開ステータス切替を行う |
| ログイン後すぐログアウトされる / セッションが保持されない | Worker のシークレット `BETTER_AUTH_SECRET` が無い可能性。Cloudflare → Workers & Pages → `ladder-dojo` → Settings → Variables and Secrets を確認し、無ければ `deploy.yml` を手動実行(Actions → Deploy → Run workflow) |
| `deploy.yml` の「Cloudflare setup」で `wrangler whoami からアカウント ID を取得できませんでした` | トークンに `Account Settings: Read` / `User Details: Read` が付いているか確認。トークンを作り直して Secret を更新 |
| GitHub Actions のデプロイが 403 / `Authentication error` | API トークンの権限に Workers Scripts: Edit と **D1: Edit** が含まれているか確認 |
| `wrangler d1 migrations apply` が失敗 | Actions のログで `database_id` の反映を確認。データを壊した疑いがあれば D1 の Time Travel(7 日以内)で復元できる。Claude Code に「Time Travel で <日時> に戻して」と依頼 |
| Cloudflare のダッシュボードで「Free plan limit」の警告 | `docs/COST.md` §1.1 / §1.2 の縮退方針に従う。Claude Code に該当項目を伝える |
| GitHub Actions のスケジュール(backup)が動かない | 60 日間活動がないと停止する。Actions タブで該当ワークフローを開き「Enable workflow」 |

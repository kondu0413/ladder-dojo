# SETUP.md — 外部サービスのアカウント作成〜キー取得手順(人間用)

この手順は **人間が行う作業** だけを書いている。コードの実装・CI 設定ファイルの作成は Claude Code が行う。
所要時間の目安: 全部で 60〜90 分。すべて無料プランで、クレジットカードは不要。

## 0. 全体像と「いつ必要か」

| 時点 | 必要になるサービス | 理由 |
|---|---|---|
| **A. ローカル開発時点**(今すぐ) | GitHub のみ(既にある) | シミュレータ・公式問題・サンドボックス(未ログイン)はサーバー不要 |
| **B. 認証実装時点**(フェーズ1 中盤) | Supabase(dev)、Google Cloud、Brevo | ログイン・進捗保存・回路保存 |
| **C. デプロイ時点**(フェーズ1 終盤) | Cloudflare、Supabase(prod) | 公開 URL |
| **D. フェーズ2** | (追加サービスなし) | Cloudflare Pages Functions に secret key を設定するだけ |

**進め方**: A の間は何もしなくてよい。Claude Code が `docs/PROGRESS.md` に「B の準備をお願いします」と書いた時点で §1〜§4 を、「C の準備をお願いします」と書いた時点で §5〜§7 を行う。先にまとめてやっても問題ない。

### 用意するもの
- Google アカウント(Supabase / Cloudflare / Google Cloud のサインインに使う)
- パスワードマネージャ(取得したキーの保管先。**キーを Slack や Issue に貼らない**)
- ローカルで動かすなら Node.js 22 LTS と pnpm(`corepack enable && corepack prepare pnpm@latest --activate`)

---

## 1. Supabase(dev プロジェクト)— B 時点

### 1.1 登録とプロジェクト作成
1. https://supabase.com/dashboard を開き「Sign in with GitHub」でログイン(GitHub アカウントを使う)
2. 初回は組織(Organization)の作成を求められる。名前は任意(例: `ladder-dojo`)、プラン **Free** を選ぶ
3. 「New project」を押し、以下で作成
   | 項目 | 値 |
   |---|---|
   | Name | `ladder-dojo-dev` |
   | Database Password | 「Generate a password」で生成し、**パスワードマネージャに保存**(後で `SUPABASE_DB_PASSWORD` として使う) |
   | Region | `Northeast Asia (Tokyo)` |
   | Pricing plan | Free |
4. 作成完了まで 1〜2 分待つ

### 1.2 取得するキー(Project Settings → API / API Keys)
左メニュー下部の歯車「Project Settings」→「API」(新UIでは「API Keys」タブ)を開く。

| 画面上の名前 | 環境変数 | 備考 |
|---|---|---|
| Project URL(`https://xxxxxxxx.supabase.co`) | `VITE_SUPABASE_URL` | |
| **Publishable key**(`sb_publishable_...`)。旧UIでは `anon` `public` と表示される JWT | `VITE_SUPABASE_PUBLISHABLE_KEY` | ブラウザに埋め込んでよい鍵 |
| **Secret key**(`sb_secret_...`)。旧UIでは `service_role` | `SUPABASE_SECRET_KEY` | **絶対にブラウザ・リポジトリに入れない**。CI と Cloudflare の環境変数にだけ置く |
| Project ref(URL の `https://supabase.com/dashboard/project/<ここ>` の部分。Project Settings → General の「Reference ID」でも確認可) | `SUPABASE_PROJECT_REF` | |

### 1.3 アクセストークン(CLI / CI からマイグレーションを流すため)
1. 右上のアバター → 「Account preferences」→ 「Access Tokens」(直接: https://supabase.com/dashboard/account/tokens)
2. 「Generate new token」、名前 `ladder-dojo-ci` → 表示されたトークンを保存 → `SUPABASE_ACCESS_TOKEN`

### 1.4 認証の設定(Authentication)
1. 左メニュー「Authentication」→「Sign In / Providers」(旧: Providers)
   - **Email**: 有効のまま。「Confirm email」は **B 時点では OFF でもよい**(SMTP 設定前)。§4 の SMTP 設定後に ON にする
   - **Google**: 有効化する。「Client ID」「Client Secret」は §2 で取得する値を貼る。画面に表示される **Callback URL(`https://<ref>.supabase.co/auth/v1/callback`)をコピー**しておく(§2 で使う)
2. 「Authentication」→「URL Configuration」
   - Site URL: `http://localhost:5173`(dev プロジェクト)
   - Redirect URLs に追加: `http://localhost:5173/**`
   - C 時点で Cloudflare の URL(`https://ladder-dojo.pages.dev/**` と `https://*.ladder-dojo.pages.dev/**`)を追加する

---

## 2. Google Cloud(Google ログイン用 OAuth クライアント)— B 時点

課金アカウントは不要。無料。

1. https://console.cloud.google.com/ にログイン
2. 上部のプロジェクト選択 →「新しいプロジェクト」→ 名前 `ladder-dojo` → 作成し、そのプロジェクトを選択
3. 左メニュー「API とサービス」→「OAuth 同意画面」(新UIでは「Google Auth Platform」→「ブランディング」)
   | 項目 | 値 |
   |---|---|
   | User Type / 対象 | **外部** |
   | アプリ名 | `ラダー図トレーニング` |
   | ユーザーサポートメール | 自分のメール |
   | デベロッパーの連絡先 | 自分のメール |
   | スコープ | 追加不要(既定の `email` `profile` `openid` のみ) |
4. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
   | 項目 | 値 |
   |---|---|
   | アプリケーションの種類 | ウェブ アプリケーション |
   | 名前 | `ladder-dojo-web` |
   | 承認済みの JavaScript 生成元 | `http://localhost:5173`(C 時点で `https://ladder-dojo.pages.dev` を追加) |
   | 承認済みのリダイレクト URI | §1.4 でコピーした Supabase の Callback URL(`https://<ref>.supabase.co/auth/v1/callback`)。**prod プロジェクト作成後にその Callback URL も追加する** |
5. 表示された **クライアント ID** と **クライアント シークレット** を、Supabase の Authentication → Providers → Google に貼って保存(アプリの環境変数には入れない)
6. **公開前(C 時点)に必ず**: 「OAuth 同意画面」→ 公開ステータスを「テスト」から「**本番環境**」に切り替える(テスト中は 100 ユーザーまでしかログインできない)。`email/profile` のみなら Google の審査は不要

---

## 3. Brevo(認証メールの SMTP)— B 時点(Confirm email を ON にする前)

1. https://www.brevo.com/ で無料登録(会社名を聞かれるが個人名でよい)。メール認証と電話番号認証がある
2. 右上アバター →「Senders, Domains & Dedicated IPs」→「Senders」→「Add a sender」で **自分のメールアドレス**を登録し、届いた確認メールで検証する(独自ドメインは不要)
3. 右上アバター →「SMTP & API」→「SMTP」タブ →「Generate a new SMTP key」→ 名前 `supabase` → 表示されたキーを保存
   - 同じ画面の「SMTP Server」(`smtp-relay.brevo.com`)、「Port」(`587`)、「Login」(Brevo のログインメール)を控える
4. Supabase Dashboard → Authentication →「SMTP Settings」(Project Settings → Auth 内)→「Enable Custom SMTP」を ON
   | 項目 | 値 |
   |---|---|
   | Sender email | 手順 2 で検証したメールアドレス |
   | Sender name | `ラダー図トレーニング` |
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` |
   | Username | Brevo のログインメール |
   | Password | 手順 3 の SMTP キー |
5. 保存後、Authentication → Providers → Email の「Confirm email」を ON にする
6. 同画面の「Rate Limits」で「Rate limit for sending emails」を **1 時間あたり 30** 程度に設定(Brevo の 300 通/日 を超えないため)

---

## 4. ローカル開発の環境変数 — B 時点

1. リポジトリ直下で `cp .env.example .env.local`
2. `.env.local` を開き、§1.2 で取得した `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY`(dev プロジェクトの値)を記入する。他は空のままでよい
3. `.env.local` は `.gitignore` 済み。コミットされないことを `git status` で確認

---

## 5. Supabase(prod プロジェクト)— C 時点

1. §1.1 と同じ手順で 2 つ目のプロジェクト `ladder-dojo-prod` を作成(Free、Tokyo、パスワードは別に生成して保存)
2. §1.2 と同じ 4 つの値を取得(prod 用として区別して保存)
3. §1.4 と同じ認証設定を行う。ただし URL は本番のもの:
   - Site URL: `https://ladder-dojo.pages.dev`(§6 で決まる実際の URL)
   - Redirect URLs: `https://ladder-dojo.pages.dev/**`
4. §2 の Google クライアントの「承認済みのリダイレクト URI」に prod の Callback URL を追加。「承認済みの JavaScript 生成元」に本番 URL を追加
5. §3.4 と同じ SMTP 設定を prod にも行う(Brevo の SMTP キーは共用でよい)

---

## 6. Cloudflare Pages — C 時点

### 6.1 登録
1. https://dash.cloudflare.com/sign-up でアカウント作成(メール + パスワード。カード不要。プランは Free)
2. ログイン後、左メニュー「Workers & Pages」を開く。初回は `<なにか>.workers.dev` のサブドメイン名を決めるよう促されることがある。任意でよい

### 6.2 Pages プロジェクト作成(空のプロジェクト)
デプロイは GitHub Actions から Wrangler で行う(D-012)ため、**Git 連携は使わず** 空プロジェクトを作る。
1. 「Workers & Pages」→「Create」→「Pages」タブ →「**Upload assets**」(Direct Upload)を選ぶ
2. Project name: `ladder-dojo` → 「Create project」。アップロード画面が出るが、**何もアップロードせず**この画面を閉じてよい(最初のデプロイは CI が行う)
   - 名前が既に使われている場合は `ladder-dojo-<好きな語>` にし、その名前を Claude Code に伝える(`wrangler.toml` の `name` に使う)
3. 本番 URL は `https://<project name>.pages.dev` になる

### 6.3 アカウント ID
「Workers & Pages」→ 概要ページの右側「Account ID」→ コピー → `CLOUDFLARE_ACCOUNT_ID`
(ダッシュボードの URL `https://dash.cloudflare.com/<ここ>/...` の部分と同じ)

### 6.4 API トークン(CI がデプロイに使う)
1. 右上アバター →「My Profile」→「API Tokens」→「Create Token」
2. テンプレート「**Edit Cloudflare Workers**」の「Use template」を選ぶ(Pages のデプロイ権限も含む)。必要最小限にしたい場合は「Create Custom Token」で以下だけ付ける:
   | Permissions | 値 |
   |---|---|
   | Account → Cloudflare Pages | Edit |
   | Account → Workers Scripts | Edit(Pages Functions を使うため) |
   | Account Resources | Include → 自分のアカウント |
3. 「Continue to summary」→「Create Token」→ 表示されたトークンを保存 → `CLOUDFLARE_API_TOKEN`(**この画面を閉じると再表示できない**)

### 6.5 Pages プロジェクトの環境変数(D 時点: フェーズ2 で Pages Functions を使い始めたら)
「Workers & Pages」→ `ladder-dojo` →「Settings」→「Variables and Secrets」→ Production に以下を追加(Type: Secret):
- `SUPABASE_URL` = prod の Project URL
- `SUPABASE_SECRET_KEY` = prod の Secret key

Preview 環境には dev プロジェクトの値を入れる。

---

## 7. GitHub リポジトリの設定 — C 時点(§1.3 が済んでいれば B 時点でも可)

### 7.1 Actions Secrets
リポジトリ → Settings → Secrets and variables → Actions →「New repository secret」で以下を登録する。

| Secret 名 | 値の出どころ | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | §6.4 | Pages へのデプロイ |
| `CLOUDFLARE_ACCOUNT_ID` | §6.3 | 同上 |
| `SUPABASE_ACCESS_TOKEN` | §1.3 | Supabase CLI ログイン(マイグレーション) |
| `SUPABASE_DEV_PROJECT_REF` | §1.2(dev) | dev へのマイグレーション・E2E |
| `SUPABASE_DEV_DB_PASSWORD` | §1.1(dev) | dev へのマイグレーション・pg_dump |
| `SUPABASE_DEV_URL` | §1.2(dev) | E2E のビルド用 |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | §1.2(dev) | E2E のビルド用 |
| `SUPABASE_DEV_SECRET_KEY` | §1.2(dev) | E2E のテストユーザー作成・keep-alive |
| `SUPABASE_PROD_PROJECT_REF` | §5(prod) | prod へのマイグレーション |
| `SUPABASE_PROD_DB_PASSWORD` | §5(prod) | prod へのマイグレーション・pg_dump |
| `SUPABASE_PROD_URL` | §5(prod) | 本番ビルド用 |
| `SUPABASE_PROD_PUBLISHABLE_KEY` | §5(prod) | 本番ビルド用 |
| `SUPABASE_PROD_SECRET_KEY` | §5(prod) | keep-alive |

### 7.2 Environments(本番マイグレーションの手動承認)
Settings → Environments →「New environment」→ `production` → 「Required reviewers」に自分を追加。
Claude Code は prod へのマイグレーションをこの environment 経由で実行するので、人間が Actions の画面で「Approve」を押すまで本番 DB は変更されない。

### 7.3 Actions の有効化確認
Settings → Actions → General → 「Allow all actions and reusable workflows」であることを確認。

---

## 8. GitHub とホスティング(Cloudflare)の連携のしくみ

```
git push (main)
   └─ GitHub Actions: ci.yml
        lint → typecheck → unit test → build → E2E(dev Supabase)
           └─ 成功時のみ deploy.yml
                wrangler pages deploy dist --project-name ladder-dojo
                  (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID を使用)
                  └─ https://ladder-dojo.pages.dev が更新される

git push (feature branch / PR)
   └─ 同じ CI → 成功時にプレビューデプロイ
        └─ https://<branch>.ladder-dojo.pages.dev
```

- 人間が行うのは §6 と §7.1 のみ。ワークフローファイル(`.github/workflows/*.yml`)と `wrangler.toml` は Claude Code が作る
- Cloudflare 側で GitHub 連携(「Connect to Git」)は **設定しない**。設定すると CI と二重にデプロイされる
- デプロイ先 URL は `docs/PROGRESS.md` に Claude Code が記載する

---

## 9. 環境変数 一覧(まとめ)

「置き場所」の凡例: **local** = リポジトリ直下 `.env.local` / **GH** = GitHub Actions Secrets / **CF** = Cloudflare Pages の Variables and Secrets

| 変数名 | いつから必要 | 置き場所 | 用途 | 取得場所 |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | B 認証実装時点 | local, (GH: `SUPABASE_DEV_URL` / `SUPABASE_PROD_URL` から注入) | ブラウザから Supabase に接続 | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | B 認証実装時点 | local, (GH: `SUPABASE_DEV_PUBLISHABLE_KEY` / `SUPABASE_PROD_PUBLISHABLE_KEY`) | 同上(公開可能な鍵) | 同 → Publishable key(旧 anon) |
| `SUPABASE_PROJECT_REF` | B 認証実装時点(初回マイグレーション時) | local(CLI 用、任意), GH(`SUPABASE_DEV_PROJECT_REF` / `SUPABASE_PROD_PROJECT_REF`) | Supabase CLI の `link` / `db push` | ダッシュボード URL の `project/` 直後 |
| `SUPABASE_DB_PASSWORD` | B 認証実装時点(初回マイグレーション時) | local(CLI 用、任意), GH(`SUPABASE_DEV_DB_PASSWORD` / `SUPABASE_PROD_DB_PASSWORD`) | `db push` / `pg_dump` | プロジェクト作成時に生成したもの(忘れた場合は Project Settings → Database → Reset database password) |
| `SUPABASE_ACCESS_TOKEN` | B 認証実装時点(初回マイグレーション時) | local(CLI 用、任意), GH | Supabase CLI のログイン | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_SECRET_KEY` | B(E2E のテストユーザー作成)/ D(Pages Functions) | GH(`SUPABASE_DEV_SECRET_KEY` / `SUPABASE_PROD_SECRET_KEY`), CF | RLS を無視できる管理用鍵。サーバー側専用 | Supabase → Project Settings → API → Secret key(旧 service_role) |
| `SUPABASE_URL` | D フェーズ2 | CF | Pages Functions から Supabase に接続(`VITE_` 無し版) | `VITE_SUPABASE_URL` と同じ値 |
| `CLOUDFLARE_API_TOKEN` | C デプロイ時点 | GH | wrangler によるデプロイ | Cloudflare → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | C デプロイ時点 | GH | 同上 | Cloudflare → Workers & Pages → Account ID |
| `E2E_BASE_URL` | B(E2E を CI で回し始めたら) | GH(必要なら) | Playwright の接続先。未設定ならローカルの Vite dev server | 自動(通常は設定不要) |

**アプリの環境変数に入れないもの**(各サービスのダッシュボードに直接設定する): Google の Client ID / Secret(Supabase に設定)、Brevo の SMTP キー(Supabase に設定)。

---

## 10. トラブル時

| 症状 | 対処 |
|---|---|
| Supabase プロジェクトが「Paused」表示 | プロジェクトを開いて「Restore project」を押す。数分で復帰。keep-alive ワークフローが止まっていないか Actions タブで確認 |
| Google ログインで「このアプリは確認されていません」 | `email/profile` のみなら「詳細」→「(安全ではないページ)に移動」で通る。公開ステータスを「本番環境」にしていれば通常表示されない |
| Google ログインで 100 ユーザー上限エラー | §2.6 の公開ステータス切替を行う |
| 確認メールが届かない | Supabase → Authentication → Logs を確認。Brevo の Sender が未検証か、Supabase の SMTP 設定のパスワード(SMTP キー)誤り |
| GitHub Actions のスケジュールが動かない | 60 日間活動がないと停止する。Actions タブで該当ワークフローを開き「Enable workflow」 |
| Cloudflare デプロイが 403 | API トークンの権限に Cloudflare Pages: Edit が含まれているか確認。トークンを作り直して Secret を更新 |

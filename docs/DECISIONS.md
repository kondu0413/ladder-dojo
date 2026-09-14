# DECISIONS.md — 判断ログ

SPEC.md §2.1 / §6 に基づき、技術上・仕様上の判断を日付付きで記録する。
「暫定」と付いたものは人間が後から差し戻せる。差し戻す場合はこのファイルに追記し、該当行の状態を更新する。

凡例: **採用** = 確定として進める / **暫定** = 迷いがあるが暫定案で進める / **却下** = 検討したが不採用 / **保留** = 人間の判断待ちで着手しない

---

## 2026-09-05 技術スタック選定(フェーズ0)/ 2026-09-14 Cloudflare 一本化に改訂

### 前提となる制約(SPEC.md §6)

| 制約 | 選定への影響 |
|---|---|
| ランニングコスト0円 | 無料枠が明確で、クレジットカード登録なしで始められるサービスのみ |
| スマホブラウザ対応 | モバイルファーストのUI。E2Eテストはモバイル画面サイズで回す |
| シミュレータはクライアント側 | サーバーは「保存・認証・集計」のみ。実行エンジンはブラウザ内 |
| 回路データは可搬な形式(JSON) | 問題・模範解答・テストケース・サンドボックスで同一スキーマ |
| 判定とシミュレータは共通コア | UI・判定・サーバー側検証が同じパッケージを import する |
| 型のある言語 | TypeScript(strict) |
| フェーズ3まで乗り換え不要 | 組織(権限)・ランキング(集計)を RDB + API 層の権限判定で表現できる構成 |

### 採用スタック一覧(2026-09-14 改訂版)

| 領域 | 採用 | 状態 |
|---|---|---|
| 言語 | TypeScript(`strict: true`) | 採用 |
| ランタイム / PM | Node.js 22 LTS / pnpm | 採用 |
| リポジトリ構成 | pnpm workspace モノレポ(`packages/core`, `apps/web`, `apps/api`) | 採用(D-002 改訂) |
| フロントエンド | Vite + React 19 + React Router(SPA、SSRなし) | 採用 |
| UI / 描画 | Tailwind CSS v4 / ラダー図は SVG 描画 | 採用 |
| 回路データ | JSON + zod スキーマ(`schemaVersion` 付き) | 採用 |
| ホスティング | **Cloudflare Workers(Static Assets)**。SPA と API を 1 つの Worker で配信 | 採用(D-009 改訂) |
| API | **Hono**(Workers 上)。`/api/*` のみ Worker が処理し、それ以外は静的アセット | 採用(D-010 改訂) |
| DB | **Cloudflare D1**(SQLite)+ **Drizzle ORM**(drizzle-kit でマイグレーション生成) | 採用(D-006 差し戻し) |
| 認証 | **Better Auth**(Drizzle アダプタ、セッションは D1、Cookie ベース) | 採用(D-006 差し戻し) |
| 認証方式 | **Google ログインのみ**(フェーズ1) | 採用(D-007 改訂) |
| メール送信(SMTP) | なし(メール/パスワード認証を実装しないため不要) | 保留(D-008) |
| 権限判定 | **API 層**(Hono ミドルウェア)で行う。DB 側の RLS は使わない(D1 に存在しない) | 採用(D-017 新設) |
| ユニットテスト | Vitest(core)+ **Vitest + `@cloudflare/vitest-pool-workers`**(API・権限判定、ローカル D1) | 採用(D-011 改訂) |
| E2Eテスト | Playwright(モバイルエミュレーション)。**Wrangler のローカル D1 で完結**、クラウド環境不要 | 採用(D-014 改訂) |
| CI/CD | GitHub Actions(テスト通過後に `wrangler d1 migrations apply` → `wrangler deploy`) | 採用(D-012 改訂) |
| DBマイグレーション | drizzle-kit generate → `apps/api/migrations/*.sql` → Wrangler が適用 | 採用(D-018 新設) |
| Lint / Format | Biome | 採用 |
| 状態管理 / データ取得 | Zustand / TanStack Query + Hono RPC クライアント(`hc`) | 採用(軽微、D-016 改訂) |

---

### D-001 言語: TypeScript(strict)

- **採用**: TypeScript、`strict: true`、`noUncheckedIndexedAccess: true`
- **理由**: §6「型のある言語」。ブラウザで動くシミュレータはJS系が唯一の現実的選択。フロント・コア・サーバー(Workers)・テストを1言語で書ける
- **却下**: Rust + WASM(シミュレータ部分)。性能は不要(ラング数は数十規模)、ツールチェーンが増え自律開発の速度が落ちる。Kotlin/JS、Dart(Flutter Web)はエコシステムと無料ホスティングの相性で不利

### D-002 リポジトリ構成: pnpm workspace モノレポ(2026-09-14 改訂)

- **採用**:
  ```
  packages/core   … シミュレータ・判定・回路JSONスキーマ。依存ゼロ(zodのみ)、DOM非依存・Node API 非依存
  apps/web        … React アプリ(Vite)。core を import する。ビルド成果物 dist/ を Worker の静的アセットとして配信
  apps/api        … Cloudflare Worker(Hono + Better Auth + Drizzle)。wrangler.jsonc、D1 マイグレーション、API テストを持つ
  ```
- **理由**: §6「判定ロジックとシミュレータは共通のコア」を**パッケージ境界**で強制する。core は Node(Vitest)・ブラウザ・Workers のどこでも動く純TSにし、フェーズ2の投稿時サーバー側検証で `apps/api` が同じコードを import する
- **改訂内容**: `supabase/`(migrations, seed)を廃止し、`apps/api` に統合。API のルート定義の型を `apps/web` が Hono RPC で参照するため、`apps/web` は `apps/api` の**型のみ**に依存する(実行時コードは import しない。Biome の `noRestrictedImports` で禁止)
- **却下**: 単一パッケージ + `src/core` ディレクトリ。境界がlint頼みになり、UI依存が混入しやすい。モノレポのコストは pnpm なら小さい

### D-003 フロントエンド: Vite + React 19 + React Router(SPA)

- **採用**: SPA。SSRなし。ビルド成果物は静的ファイルのみ
- **理由**:
  - シミュレータはクライアント側で動くため SSR の恩恵がほぼない。静的ファイルならどの無料ホスティングにも置けて、ホスティング乗り換えが設定変更だけで済む
  - React はモバイルタッチ操作の実装例・ライブラリが最も豊富で、Claude Code の生成精度も高い
  - フェーズ2の「投稿問題一覧」は検索エンジン流入を狙わない(ログイン前提の学習アプリ)ため SEO 要件なし
- **却下**:
  - Next.js: SSR/Server Actions が不要。Node ランタイムに縛られ、無料ホスティングが実質 Vercel(Hobby は非商用限定)に寄る
  - SvelteKit / Nuxt: 技術的には十分だが、エコシステム規模とモバイルUI部品の選択肢で React に劣る
  - Remix / TanStack Start: 同上(サーバー前提)

### D-004 UI: Tailwind CSS v4、ラダー図は SVG

- **採用**: Tailwind CSS v4(モバイルファースト)。ラダー図の描画は SVG
- **理由**: SVG は要素ごとにタップ領域を持てる(接点をタップして操作、グリッドセルをタップして配置)。DOMイベントで済むためドラッグ非依存UIを作りやすく、通電ハイライトも CSS クラス切替で表現できる。テストでも要素を特定しやすい
- **却下**: Canvas(ヒットテストとアクセシビリティを自前実装する必要)、WebGL(過剰)

### D-005 回路データ形式: JSON + zod スキーマ(2026-09-14 一部改訂)

- **採用**: `packages/core` に zod スキーマを置き、`Circuit`(グリッド上の部品と接続)、`TestCase`(入力操作シーケンス → 期待出力)、`Problem`(仕様文 + 模範解答 Circuit + TestCase[] + メタ)を定義。ルートに `schemaVersion` を持たせ、将来のマイグレーション関数を core に置く
- **理由**: §6「問題・模範解答・テストケース・サンドボックス保存がすべて同じ形式」。D1(SQLite)には `TEXT` 列に JSON 文字列として保存し、DBスキーマは回路の内部構造を知らない(問題形式の変更がDBマイグレーションを要求しない)。保存前に API 層で zod 検証し、壊れた JSON は保存しない
- **公式問題の置き場**: DBではなくリポジトリ内の JSON(`apps/web/src/problems/*.json` 相当)としてビルドに同梱。理由: 未ログインでも解ける(§3.5)、D1 の読み取り行数を消費しない、Git で差分レビューできる。投稿問題(フェーズ2)のみ DB に置く

### D-006 認証・DB: Cloudflare D1 + Drizzle + Better Auth(**差し戻し → D1 採用、2026-09-14**)

- **経緯**: 2026-09-05 に Supabase(Auth + Postgres + RLS)を採用し、D1 構成を「乗り換え第一候補」としていた。2026-09-14 に人間が D-006 を差し戻し、**Supabase をやめて Cloudflare に一本化**することを決定
- **採用**: Cloudflare Workers(Static Assets)+ Hono + D1 + Drizzle ORM + Better Auth。すべて Cloudflare の Workers Free プラン内で動かす(カード登録不要)
  - 認証: Better Auth を Worker 上で動かす。Google ログインのみ(D-007)。セッションは D1 の `session` テーブルに保存し、Cookie(HttpOnly, Secure, SameSite=Lax)で保持。SPA と API が同一オリジンなので CORS・トークン受け渡しが不要
  - DB: D1(SQLite)。スキーマは Drizzle で TypeScript から定義し、drizzle-kit で SQL マイグレーションを生成(D-018)
  - 権限: RLS がないため、**すべてのデータアクセスを API 経由**にし、権限判定を API 層で行う(D-017)。ブラウザから DB に直接触る経路は存在しない
- **理由(人間の決定を踏まえた技術的な裏付け)**:
  - **ベンダーが1つ**になり、人間のセットアップ作業が Cloudflare・Google Cloud・GitHub の3か所だけで済む(SETUP.md)。Supabase の dev/prod 2プロジェクト運用、7日間無アクセスでの一時停止、keep-alive ワークフロー、SMTP 設定がすべて不要になる
  - **ローカルで完結する開発・テスト**: Wrangler(Miniflare)がローカル D1 を提供するため、E2E テストにクラウドの dev 環境が要らない(D-014)。CI が外部サービスに依存せず、シークレットなしで PR の CI が回る
  - D1 の無料枠は容量 5 GB / アカウント、Time Travel(7日間の時点復元、要確認)があり、Supabase 無料枠(500 MB、バックアップなし、7日停止)より運用が楽。ただし **1 データベースあたりの上限は 500 MB(Free、要確認)** なので、容量面の実質的な余裕は Supabase と同程度。詳細は COST.md
  - 自前実装が増える点(旧却下理由)は、Better Auth(認証)と Hono ミドルウェア(権限)で吸収する。その分を API テスト(D-011、SPEC.md §2.4)で担保する
- **失うもの(認識した上で受け入れる)**:
  - Postgres 固有機能(RLS、`pg_cron`、マテリアライズドビュー、ウィンドウ関数の一部)。集計は Cron Triggers + 集計テーブルで代替(D-010)
  - Supabase Auth の管理画面(ユーザー一覧・BAN 等)。必要になれば管理 API を自作
  - 全 API リクエストが Workers 無料枠(10万 req/日)と D1 の読み書き上限に乗る。縮退方針は COST.md
- **却下(2026-09-05 時点の比較を保持)**:
  - Supabase: 2026-09-05 採用 → **2026-09-14 差し戻し**。ベンダー分散と dev/prod 2プロジェクト運用・一時停止対策の負担が理由
  - Firebase(Firestore + Auth): NoSQL のため、組織内ランキング・つまずき集計・権限の交差条件を書くのが困難。集計は Cloud Functions 必須で従量課金プラン(Blaze)が必要
  - Neon + Clerk(または Auth.js): DB と認証が別ベンダー。D1 + Better Auth と同じく API 経由が必須なのに、ベンダーだけ増える
  - Convex: 独自クエリ言語・独自ホスティングでロックインが強い
  - PocketBase: 常駐サーバーが必要で 0円ホスティングがない

### D-007 認証方式: Google ログインのみ(2026-09-14 改訂)

- **採用**: フェーズ1は **Google ログインのみ**。Better Auth の `socialProviders.google` を使い、メール送信を一切行わない
- **保留(人間の判断待ち、着手しない)**: メール/パスワード認証(会社メールで使いたい企業導入・Google アカウントを持たない層向け)。2026-09-05 の暫定案では併用としていたが、2026-09-14 に人間が「フェーズ1では実装しない」と決定。実装する場合は Better Auth の `emailAndPassword` を有効化し、確認メール・パスワードリセット用の送信手段(D-008)が必要になる
- **却下(据え置き)**: Magic Link(メール消費が多い)、GitHub ログイン(対象ペルソナに合わない)
- **UI 上の扱い**: ログイン画面は「Google でログイン」ボタン1つ。未ログインでも公式問題・サンドボックスは使える(§3.5、S-002)
- **E2E テストでのログイン**: Google の画面は CI で通せないため、D-014 の「E2E 専用ログイン」を使う

### D-008 SMTP: 保留(2026-09-14 改訂)

- **保留**: メール/パスワード認証を実装しない(D-007)ため、SMTP は不要。Brevo の検討結果(300通/日、独自ドメイン不要)は D-007 の保留が解除された時点で再評価する
- **削除した作業**: SETUP.md の Brevo 節、COST.md の Brevo 節、`.env.example` の SMTP 関連コメント

### D-009 ホスティング: Cloudflare Workers(Static Assets)(2026-09-14 改訂)

- **採用**: Cloudflare Pages ではなく **Workers(Static Assets)** を使う。`apps/api/wrangler.jsonc` で `assets.directory = "../web/dist"`、`assets.not_found_handling = "single-page-application"`、`assets.run_worker_first = ["/api/*"]` を設定し、SPA と API を **1 つの Worker**(名前 `ladder-dojo`)で配信する。URL は `https://ladder-dojo.<サブドメイン>.workers.dev`
- **理由**:
  - Cloudflare が新規プロジェクトに Workers を推奨しており、Pages Functions より D1 バインディング・Cron Triggers・`wrangler dev` の統合が素直
  - 静的アセットへのリクエストは **無料・無制限で Workers の 10万 req/日 に数えない**(要確認)。`run_worker_first` で `/api/*` だけ Worker を通すため、画面表示・シミュレータ利用は無料枠を消費しない
  - SPA と API が同一オリジンになり、Better Auth の Cookie セッションがそのまま使える
  - 商用利用の制限がない(Pages と同じ)。カード不要
- **却下**:
  - Cloudflare Pages + Pages Functions: 2026-09-05 採用 → 2026-09-14 変更。Pages でも D1 は使えるが、Pages Functions は `_worker.js` 形式で Hono・Cron Triggers・vitest-pool-workers との組み合わせに一手間ある。Cloudflare 自身が Workers への移行を案内している
  - 静的ホスティングと API Worker を分ける構成: オリジンが分かれ、Cookie 認証に CORS と `SameSite=None` が必要になる。1 Worker で済むものを分ける理由がない
  - Vercel / Netlify / GitHub Pages / Firebase Hosting: 2026-09-05 の却下理由のまま

### D-010 サーバー側ロジックの置き場: Hono API on Workers(2026-09-14 改訂)

- **採用**: 「サーバー側コードを書かない」方針を撤回し、**データアクセスはすべて `apps/api` の Hono API 経由**にする。構成:
  - `GET/POST /api/auth/*` … Better Auth のハンドラ(Google ログイン開始・コールバック・セッション取得・ログアウト)
  - `/api/progress`, `/api/submissions`, `/api/sandbox` … フェーズ1(本人のデータのみ)
  - `/api/problems`(投稿問題)… フェーズ2
  - `/api/rankings`, `/api/orgs/*` … フェーズ3
  - すべてのルートは zod で入力検証し、D-017 の権限ミドルウェアを通す
- **フェーズ別の見立て**:
  - フェーズ1: 進捗・提出・サンドボックスの CRUD。すべて「本人のデータのみ」(`user_id = session.user.id` を API 側で強制)
  - フェーズ2: 投稿時の「模範解答がテストケースを全て通るか」の自動チェックは、クライアントで即時実行しつつ、**公開フラグを立てる API がサーバー側で `packages/core` を使って再実行**する(改ざんされた投稿が公開されないようにする)。CPU 時間 10 ms/リクエストの制約があるため、テストケース数・スキャン数に上限を設ける(COST.md)。クリア率・いいね数は集計列(カウンタ)を更新して持つ
  - フェーズ3: ランキングは **Cron Triggers**(無料)で期間別集計を `ranking_snapshots` テーブルに書き出す。連続学習日数は `activity_days` から計算。組織権限は D-017
- **却下**:
  - Postgres 関数 / RLS / `pg_cron` / マテリアライズドビュー: D1 に存在しない
  - Cloudflare Durable Objects: 無料枠にあるが、フェーズ3までの要件は D1 + Cron で足りる。リアルタイム要件が出た時点で再検討
  - Supabase Edge Functions(Deno): Supabase 廃止に伴い不要

### D-011 テスト基盤: Vitest + vitest-pool-workers + Playwright(2026-09-14 改訂)

- **採用**:
  - Vitest(`packages/core`): スキャン順序、タイマ、カウンタ、自己保持、微分、判定のユニットテスト。カバレッジは core で 90% 以上を目標
  - **Vitest + `@cloudflare/vitest-pool-workers`(`apps/api`)**: workerd 上で実 D1(ローカル・インメモリ)を使って API を直接呼ぶテスト。**権限判定は必須テスト対象**(SPEC.md §2.4 に追記済み、D-017 にテスト観点を列挙)。マイグレーションはテスト前に自動適用
  - Playwright(`apps/web`): 主要フロー(問題を開く → 回路を操作/編集 → 判定 → 模範解答表示 / ログイン → 保存 → 再読込で復元)。デバイスプロファイルは **Pixel 7 相当のモバイル**と Desktop Chrome の2つ。接続先は `wrangler dev` が起動したローカル Worker(ビルド済み SPA + ローカル D1)。D-014 参照
  - React Testing Library: 部品単位の UI テストに限定して使う
- **理由**: Vitest は Vite と設定を共有できて速い。vitest-pool-workers は本番と同じ workerd ランタイムと D1 の SQL 方言で API を検証でき、モックの乖離がない。Playwright はモバイルエミュレーションとタッチイベントを標準サポートし、§4 DoD「スマホのブラウザで操作できる」を CI で検証できる
- **却下**: Jest(ESM/TS 設定が重い)、Cypress(モバイルエミュレーションが弱い)、D1 を better-sqlite3 でモックする案(SQL 方言・バインディングの差で本番と乖離する)

### D-012 CI/CD: GitHub Actions + Wrangler(2026-09-14 改訂)

- **採用**:
  - `ci.yml`(push / PR): lint → typecheck → unit(core)→ API テスト(ローカル D1)→ build → E2E(ローカル Worker + ローカル D1)。**外部サービスにアクセスしないため、PR の CI にシークレットは不要**
  - `deploy.yml`(`main` で CI 通過後): `wrangler d1 migrations apply ladder-dojo --remote` → `wrangler deploy` → `wrangler secret bulk`(GitHub Secrets から Worker のシークレットを同期)。使う Secrets は `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `BETTER_AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` の 5 つ(SETUP.md §3)
  - `backup.yml`(週1回): `wrangler d1 export --remote` の出力を圧縮して Actions アーティファクトに保存(保持 4 世代)。D1 の Time Travel(7日、要確認)の補完
  - 廃止: `db-migrate.yml`(deploy に統合)、`keepalive.yml`(D1 は一時停止しない)
- **マイグレーションの安全策**: 本番マイグレーションに人間の手動承認は置かない(§2.1 の自律サイクルを止めないため)。代わりに (1) 破壊的変更(列削除・型変更)は「追加 → コード切替 → 次のリリースで削除」の2段階に分ける、(2) `wrangler d1 migrations apply --local` を CI の API テストで毎回通す、(3) 失敗時は Time Travel で復元する、の3点で担保する
- **理由**: §2.4「CIでテストが通らない状態で次に進まない」を**デプロイのゲート**として実装するため、デプロイは CI の後段に置く。Cloudflare の Git 連携(Workers Builds)はテスト失敗でもデプロイされてしまうため使わない
- **プレビューデプロイ**: 行わない。Workers のプレビュー URL は本番と同じ D1 バインディングを共有するため、PR の検証はローカル E2E で行う(D-014)。必要になれば `ladder-dojo-preview` Worker + 別 D1 を追加する
- **前提**: リポジトリは private のため Actions は月 2,000 分。E2E が重くなれば COST.md の縮退方針に従う

### D-013 Lint / Format: Biome(変更なし・補足)

- **採用**: Biome(lint + format を1ツール・1設定で)
- **理由**: 設定量が少なく高速。自律開発ではツール設定の保守コストを最小化したい。`noRestrictedImports` で `packages/core` から React/DOM/Node API を、`apps/web` から `drizzle-orm`・`apps/api` の実行時コードを import できないようにする
- **却下**: ESLint + Prettier(実績はあるが設定と依存が多い。Biome で不足が出た時点で追加検討)

### D-014 環境分離: 本番 D1 のみ + ローカル D1(2026-09-14 改訂)

- **採用**: クラウド側は **本番(prod)の D1 データベース 1 つだけ**。開発・API テスト・E2E はすべて **Wrangler(Miniflare)のローカル D1** で行い、クラウドの dev 環境を作らない
  - ローカル開発: `wrangler dev`(`apps/api`)がローカル D1 を `.wrangler/state/` に永続化。フロントは Vite dev server(5173)から `/api` を 8787 へプロキシ
  - API テスト: vitest-pool-workers がテストごとにインメモリ D1 を用意(D-011)
  - E2E: `pnpm build` → `wrangler d1 migrations apply --local` → `wrangler dev --env e2e`(ビルド済み SPA を配信)→ Playwright。Playwright の `webServer` で自動起動。データは毎回空から始める
- **E2E 専用ログイン(Google の画面を通らない方法)**: `wrangler.jsonc` の `env.e2e` にだけ `E2E_AUTH_BYPASS = "1"` を置き、この値があるときのみ Better Auth の `emailAndPassword` を有効にして、テストが `/api/auth/sign-up/email` でテストユーザーを作りログインする(メール確認なし、送信なし)。本番・ローカル開発の設定にはこの変数が無いため、ユーザー向けにはメール/パスワード認証は存在しない(D-007 の保留と矛盾しない)。**本番設定でこれが無効であることを API テストで検証する**。実装時に Better Auth 側の都合で難しければ、代替として `/api/_e2e/login` エンドポイントを同じ環境変数で出し分ける
- **理由**: 人間のセットアップ作業を減らす(dev プロジェクト不要)、CI からシークレットを無くす、テストデータが本番に混ざらない。E2E が外部サービスの障害・レート制限に影響されない
- **却下**: クラウド dev D1(2026-09-05 の Supabase dev 相当)。Wrangler がローカルで同等の D1 を提供するため不要

### D-015 D1 のバックアップと復元(2026-09-14 改訂、旧「Supabase 一時停止対策」を置換)

- **採用**: D1 は無アクセスで停止しないため keep-alive は不要。バックアップは (1) D1 の **Time Travel**(Free は 7 日間の時点復元、要確認)、(2) `backup.yml` の週次 `wrangler d1 export`(D-012)の2系統。復元手順(`wrangler d1 time-travel restore` / `wrangler d1 execute --file`)は実装時に README に書く
- **注意**: GitHub Actions のスケジュール実行はリポジトリに 60 日間活動がないと自動停止する。フェーズ3 完了後の待機期間に入ったら、人間が定期的に確認するか、バックアップを Cloudflare Cron Triggers + R2(無料枠 10 GB、要確認)に移す

### D-016 その他ライブラリ(軽微、2026-09-14 一部改訂)

| 用途 | 採用 | 却下 / 備考 |
|---|---|---|
| クライアント状態 | Zustand | Redux(過剰)、Jotai(可、好みの差) |
| サーバーデータ | TanStack Query + **Hono RPC クライアント(`hc<AppType>`)** | API のルート型をそのまま使い、フロント側の型生成ツールを持たない |
| 認証クライアント | Better Auth の `createAuthClient`(React 用フック) | — |
| ルーティング | React Router v7(library mode) | TanStack Router(可)。SPA で十分 |
| フォーム | React Hook Form + zod | — |
| 日時 | Temporal polyfill or date-fns | 連続学習日数は **JST 日付**で判定(仕様上の暫定、下記 S-001) |
| ID | ULID or `crypto.randomUUID()` | D1 は自動採番より文字列 ID の方がマージ・エクスポートに強い |

### D-017 権限判定は API 層で行う(RLS の代替)(2026-09-14 新設)

- **採用**: D1 には行レベルセキュリティがないため、**すべての権限判定を `apps/api` の Hono ミドルウェアと各ハンドラで行う**。方針:
  1. **DB への経路は API のみ**。ブラウザは D1 に触れない(バインディングは Worker にしかない)
  2. **認証ミドルウェア** `requireUser`: Better Auth のセッション Cookie を検証し、`c.var.user` を設定。未ログインは 401
  3. **本人性の強制**: フェーズ1のデータ(進捗・提出・サンドボックス)は、リクエストボディの `user_id` を信用せず、常にセッションの `user.id` でクエリを絞る。他人の ID を指定しても 404(存在を漏らさない)
  4. **組織ミドルウェア**(フェーズ3): `requireOrgMember(orgId)` / `requireOrgAdmin(orgId)`。`org_members(org_id, user_id, role)` を1クエリで引き、メンバー外は 404、メンバーだが管理者でない場合は 403
  5. **可視性の判定**(フェーズ2/3): 投稿問題の `visibility`(public / org / private)と通報による非表示は、一覧・取得の両方の SQL の WHERE 句に必ず入れる(取得側だけの判定にしない)
  6. **管理者の閲覧範囲**: 管理者が見られるのは「自分が管理者である組織のメンバー」のデータのみ。組織横断の一覧 API は作らない
  7. **一覧取得は JOIN またはバッチで行い、ループ内クエリを禁止する**(2026-09-14 追記): 一覧・集計系のハンドラ(メンバー進捗一覧、投稿問題一覧、ランキング、割り当て課題一覧など)は、権限判定の結果を使って**1 回の JOIN クエリ**、または `IN (...)` / D1 の `batch()` による**固定回数のクエリ**で取得する。「1 件ずつ `SELECT`」する N+1 パターンは禁止。理由は D1 Free の **1 リクエストあたりクエリ 50 回**の上限(COST.md §1.2)で、これを超えるとそのリクエストが即失敗する。あわせて、権限判定そのものも「メンバー確認 → データ取得」の 2 クエリ以内に収め、ページサイズは最大 20 件に固定する。Drizzle のリレーションクエリ(`db.query.*.findMany({ with })`)は内部で複数クエリに展開されることがあるため、一覧では明示的な `select().from().innerJoin()` を使う
- **品質基準(SPEC.md §2.4 に追記済み)**: 上記の各ルールに対して、vitest-pool-workers による API テストを必須とする。最低限のテスト観点:
  - 未ログインで保護ルートを叩くと 401
  - 他人の `user_id` / リソース ID を指定した取得・更新・削除が 404 で、DB が変更されない
  - 組織メンバー外 → 404、メンバー(非管理者)→ 403、管理者 → 200(閲覧系・割り当て系それぞれ)
  - 組織 A の管理者が組織 B のメンバーの進捗を取得できない
  - `visibility = org` の問題が、他組織のユーザーの一覧・取得の両方に現れない
  - 通報で非表示になった問題が一覧・取得に現れない
  - 本番設定(`E2E_AUTH_BYPASS` 無し)でメール/パスワードのエンドポイントが無効
  - 一覧・集計系の各 API について、テストデータを 60 件以上(上限 50 回を超える件数)入れた状態で 1 リクエストが成功し、D1 へのクエリ回数が固定値(手法 7 で決めた回数)以下であること(vitest-pool-workers で D1 バインディングをラップして回数を数える)
- **理由**: RLS は「書き忘れても DB が守る」安全網だったが、D1 では API がその役割を負う。テストを品質基準に組み込むことで、ハンドラ追加時の書き忘れを CI で検出する
- **却下**: D1 の前段に権限判定用の Durable Object を置く案(過剰)。SQL ビューで擬似 RLS(D1 ではセッション変数がなく成立しない)

### D-018 DB スキーマとマイグレーション運用: Drizzle + drizzle-kit + Wrangler(2026-09-14 新設)

- **採用**:
  - スキーマは `apps/api/src/db/schema.ts` に Drizzle(sqlite)で定義。Better Auth のテーブル(`user`, `session`, `account`, `verification`)は `@better-auth/cli generate` で生成したものを同ファイルに取り込む
  - `drizzle-kit generate` で `apps/api/migrations/NNNN_*.sql` を生成し、**ファイルはコミット**する。適用は `wrangler d1 migrations apply`(ローカル `--local` / 本番 `--remote`)。Drizzle の `migrate()` は使わない(Wrangler の `d1_migrations` テーブルと二重管理になるため)
  - フェーズ1 のテーブル(見立て): `user` / `session` / `account` / `verification`(Better Auth)、`progress`(user_id, problem_id, cleared_at, attempts, failures, last_attempt_at)、`submissions`(id, user_id, problem_id, circuit_json, passed, circuit_hash, created_at)、`sandbox_circuits`(id, user_id, title, circuit_json, test_cases_json, updated_at)、`activity_days`(user_id, date_jst)。すべて `user_id` を先頭にした複合インデックスを持つ(D1 は読み取り「行数」課金のため、テーブルスキャンを避ける)
  - D1 の読み書き上限を意識した設計: Better Auth の `session.cookieCache` を有効化(毎リクエストの session 読み取りを減らす)、`session.updateAge` を 1 日にする(毎リクエストの session 書き込みを避ける)、`COUNT(*)` は集計列で代替
- **理由**: TypeScript でスキーマとクエリの型を一元化でき、SQLite 方言の差を Drizzle が吸収する。マイグレーションファイルを Git に置くことで差分レビューと Time Travel 復元時の再適用が容易
- **却下**: Prisma(D1 アダプタはあるがエンジンが重く Worker サイズ 3 MB 制約に近い)、Kysely(可だがスキーマ定義と型生成が別途必要)、生 SQL のみ(型がなく §6「型のある言語」の趣旨に反する)

---

## 仕様上の暫定判断(SPEC.md に答えがない項目)

### S-001 連続学習日数の「1日」の境界(暫定)

- **論点**: §3.7「連続学習日数」の日付境界をどのタイムゾーンで切るか
- **選択肢**: (a) JST 固定 (b) ユーザー端末のタイムゾーン (c) UTC
- **暫定採用**: (a) JST 固定。UI 言語が日本語のみ(§5)で対象ユーザーも国内のため
- **理由**: サーバー側集計(ランキング)とクライアント表示で結果が一致する。海外展開時に (b) へ変更可能な設計(活動日は日付文字列で保存)にする

### S-002 未ログイン時の進捗の扱い(暫定)

- **論点**: §3.5 で未ログインでも問題を解けるが、その進捗をどう扱うか
- **暫定採用**: ブラウザの localStorage に保存し、ログイン時に「この端末の進捗を引き継ぐ」確認を出してサーバーへマージする(クリア済みは OR、試行回数は加算)
- **理由**: 試してから登録する導線を壊さない。サーバー側で匿名ユーザーを作ると D1 の行数と Workers のリクエストを消費する

### S-003 提出回路履歴の保持上限(暫定)

- **論点**: §3.5「提出回路そのものを履歴として保持」は無制限だと D1 の 1 データベース上限(Free 500 MB、要確認)を圧迫する
- **暫定採用**: 問題ごと・ユーザーごとに **不正解の直近20件 + 正解全件** を保持。同一回路(正規化JSONのハッシュ一致)は重複保存しない
- **理由**: つまずき分析(§3.8)には直近の失敗が重要で、古い失敗は価値が低い。COST.md の縮退方針と連動

---

## 判断の変更履歴

| 日付 | ID | 変更 | 理由 |
|---|---|---|---|
| 2026-09-05 | — | 初版作成 | フェーズ0 技術選定 |
| 2026-09-05 | D-006 | 人間から「D1 はだめか」の確認。比較の上 Supabase 維持で確定。D1 の却下理由を「自前実装が増えるため」に書き直し、乗り換え第一候補として明記 | 人間の確認結果 |
| 2026-09-14 | D-006 | **差し戻し → D1 採用**。Supabase を廃止し Cloudflare に一本化(Workers Static Assets + Hono + D1 + Drizzle + Better Auth) | 人間の差し戻し |
| 2026-09-14 | D-007 | Google ログインのみに変更。メール/パスワードは保留 | 人間の指示(フェーズ1では実装しない) |
| 2026-09-14 | D-008 | Brevo SMTP を保留(不要) | D-007 に伴う |
| 2026-09-14 | D-009 | Cloudflare Pages → Workers(Static Assets)。SPA と API を 1 Worker に | D-006 に伴う |
| 2026-09-14 | D-010 | 「サーバー側コードを書かない」を撤回。Hono API 経由に統一、集計は Cron Triggers | D-006 に伴う(RLS / pg_cron が無い) |
| 2026-09-14 | D-011 | API テスト(vitest-pool-workers、ローカル D1)を追加。E2E の接続先をローカル Worker に | D-017 のテスト担保 |
| 2026-09-14 | D-012 | deploy に D1 マイグレーションを統合。db-migrate / keepalive を廃止、backup を追加。PR CI をシークレット不要に | D-006 / D-014 に伴う |
| 2026-09-14 | D-014 | dev / prod 2 環境 → 本番 D1 のみ + ローカル D1。E2E 専用ログイン方式を定義 | 人間の指示(クラウド dev 不要) |
| 2026-09-14 | D-015 | Supabase 一時停止対策 → D1 バックアップ・復元に置換 | D-006 に伴う |
| 2026-09-14 | D-016 | Hono RPC クライアント・Better Auth クライアント・ID 方式を追記 | D-006 に伴う |
| 2026-09-14 | D-017 | 新設: 権限判定を API 層で行う方針と必須テスト観点。SPEC.md §2.4 に API テストを追記 | 人間の指示 |
| 2026-09-14 | D-018 | 新設: Drizzle + drizzle-kit + Wrangler のマイグレーション運用、フェーズ1 テーブル見立て | D-006 に伴う |
| 2026-09-14 | S-002, S-003 | Supabase 前提の記述(MAU、500 MB)を D1 前提に修正。判断内容は変更なし | D-006 に伴う |
| 2026-09-14 | D-017 | 方針 7「一覧取得は JOIN またはバッチで行い、ループ内クエリを禁止」とクエリ回数のテスト観点を追加。COST.md §1.2 に D1 Free の「1 リクエストあたりクエリ 50 回」制限を追記 | 人間の指示(マージ後の追記) |

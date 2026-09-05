# DECISIONS.md — 判断ログ

SPEC.md §2.1 / §6 に基づき、技術上・仕様上の判断を日付付きで記録する。
「暫定」と付いたものは人間が後から差し戻せる。差し戻す場合はこのファイルに追記し、該当行の状態を更新する。

凡例: **採用** = 確定として進める / **暫定** = 迷いがあるが暫定案で進める / **却下** = 検討したが不採用

---

## 2026-09-05 技術スタック選定(フェーズ0)

### 前提となる制約(SPEC.md §6)

| 制約 | 選定への影響 |
|---|---|
| ランニングコスト0円 | 無料枠が明確で、クレジットカード登録なしで始められるサービスのみ |
| スマホブラウザ対応 | モバイルファーストのUI。E2Eテストはモバイル画面サイズで回す |
| シミュレータはクライアント側 | サーバーは「保存・認証・集計」のみ。実行エンジンはブラウザ内 |
| 回路データは可搬な形式(JSON) | 問題・模範解答・テストケース・サンドボックスで同一スキーマ |
| 判定とシミュレータは共通コア | UI・判定・(将来の)サーバー側検証が同じパッケージを import する |
| 型のある言語 | TypeScript(strict) |
| フェーズ3まで乗り換え不要 | 組織(権限)・ランキング(集計)をRDB+行レベルセキュリティで表現できる構成 |

### 採用スタック一覧

| 領域 | 採用 | 状態 |
|---|---|---|
| 言語 | TypeScript(`strict: true`) | 採用 |
| ランタイム / PM | Node.js 22 LTS / pnpm | 採用 |
| リポジトリ構成 | pnpm workspace モノレポ(`packages/core`, `apps/web`) | 採用 |
| フロントエンド | Vite + React 19 + React Router(SPA、SSRなし) | 採用 |
| UI / 描画 | Tailwind CSS v4 / ラダー図は SVG 描画 | 採用 |
| 回路データ | JSON + zod スキーマ(`schemaVersion` 付き) | 採用 |
| 認証・DB | Supabase(Auth + Postgres + RLS) | 採用 |
| 認証方式 | Google ログイン(主)+ メール/パスワード | 暫定 |
| メール送信(SMTP) | Brevo 無料枠を Supabase Auth のカスタムSMTPに接続 | 暫定 |
| ホスティング | Cloudflare Pages(必要時に Pages Functions) | 採用 |
| サーバー側ロジック | 原則なし(RLS + Postgres関数)。必要時のみ Cloudflare Pages Functions | 採用 |
| ユニットテスト | Vitest | 採用 |
| E2Eテスト | Playwright(モバイルエミュレーション) | 採用 |
| CI/CD | GitHub Actions(テスト通過後に wrangler で Cloudflare Pages へデプロイ) | 採用 |
| DBマイグレーション | Supabase CLI(`supabase/migrations/` を CI から `db push`) | 採用 |
| Lint / Format | Biome | 採用 |
| 状態管理 / データ取得 | Zustand / TanStack Query | 採用(軽微) |

---

### D-001 言語: TypeScript(strict)

- **採用**: TypeScript、`strict: true`、`noUncheckedIndexedAccess: true`
- **理由**: §6「型のある言語」。ブラウザで動くシミュレータはJS系が唯一の現実的選択。フロント・コア・サーバー関数・テストを1言語で書ける
- **却下**: Rust + WASM(シミュレータ部分)。性能は不要(ラング数は数十規模)、ツールチェーンが増え自律開発の速度が落ちる。Kotlin/JS、Dart(Flutter Web)はエコシステムと無料ホスティングの相性で不利

### D-002 リポジトリ構成: pnpm workspace モノレポ

- **採用**:
  ```
  packages/core   … シミュレータ・判定・回路JSONスキーマ。依存ゼロ(zodのみ)、DOM非依存
  apps/web        … React アプリ。core を import する
  supabase/       … migrations, seed, (必要なら) functions
  ```
- **理由**: §6「判定ロジックとシミュレータは共通のコア」を**パッケージ境界**で強制する。core は Node(Vitest)・ブラウザ・Cloudflare Workers のどこでも動く純TSにし、フェーズ2の投稿時サーバー側検証で同じコードを使う
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

### D-005 回路データ形式: JSON + zod スキーマ

- **採用**: `packages/core` に zod スキーマを置き、`Circuit`(グリッド上の部品と接続)、`TestCase`(入力操作シーケンス → 期待出力)、`Problem`(仕様文 + 模範解答 Circuit + TestCase[] + メタ)を定義。ルートに `schemaVersion` を持たせ、将来のマイグレーション関数を core に置く
- **理由**: §6「問題・模範解答・テストケース・サンドボックス保存がすべて同じ形式」。Postgres には `jsonb` で保存し、DBスキーマは回路の内部構造を知らない(問題形式の変更がDBマイグレーションを要求しない)
- **公式問題の置き場**: DBではなくリポジトリ内の JSON(`apps/web/src/problems/*.json` 相当)としてビルドに同梱。理由: 未ログインでも解ける(§3.5)、DB egress を消費しない、Git で差分レビューできる。投稿問題(フェーズ2)のみ DB に置く

### D-006 認証・DB: Supabase

- **採用**: Supabase 無料プラン。Auth(Google / メール)+ Postgres + RLS(行レベルセキュリティ)。クライアントから supabase-js で直接アクセスし、権限は RLS で担保
- **理由**:
  - 認証・RDB・権限制御が1サービスで揃い、無料枠が明確(§2.3)。カード登録不要
  - フェーズ3の要件が RDB で自然に表現できる:
    - 組織・権限 → `organizations` / `org_members(role)` テーブル + RLS ポリシー
    - ランキング(期間別) → SQL の集計ビュー/マテリアライズドビュー + `pg_cron` で定期更新
    - 連続学習日数 → `activity_days` テーブルからウィンドウ関数で算出
    - つまずき分析 → `submissions` に対する集計クエリ
  - Postgres なので、万一 Supabase を離れる場合も `pg_dump` でそのまま他の Postgres へ移せる
- **却下**:
  - Firebase(Firestore + Auth): NoSQL のため、組織内ランキング・つまずき集計・権限の交差条件を書くのが困難。集計は Cloud Functions 必須で、Functions は従量課金プラン(Blaze)への切替が必要 → フェーズ3で「乗り換え」が発生する
  - Neon + Clerk(または Auth.js): DB と認証が別ベンダーで、クライアントから DB に安全に触る仕組み(RLS相当)がなく、全アクセスをサーバー関数経由にする必要がある。無料枠(Workers 10万req/日)を全リクエストで消費する
  - Cloudflare D1 + Better Auth: 1ベンダーで完結する魅力はあるが、RLS がなく上と同じ問題。認証メール送信・セッション管理を自前で運用する負担が大きい
  - Convex: TS ネイティブで開発体験は良いが、独自クエリ言語・独自ホスティングでロックインが強く、SQL 集計の自由度で劣る
  - PocketBase: 常駐サーバーが必要で 0円ホスティングがない

### D-007 認証方式(暫定): Google ログイン(主)+ メール/パスワード

- **暫定採用**:
  1. **Google ログイン**を主導線にする(メール送信不要、スマホで最短)
  2. **メール/パスワード**も提供する(会社メールで使いたい企業導入・Googleアカウントを持たない層向け)。確認メール・パスワードリセットは D-008 の SMTP を使う
- **理由**: Supabase の組み込みメール送信は「毎時2通程度」と厳しく、送信先も限定されるため本番のメール認証には使えない。Google ログインならメール送信自体が不要で、0円で最も確実
- **迷った選択肢(併記)**:
  - Magic Link(メールのみ・パスワードなし): ログイン毎にメールを消費するため無料SMTP枠(300通/日)に早く当たる。フェーズ1では不採用、要望があれば追加
  - GitHub ログイン: 開発者向けで対象ペルソナ(製造現場の新人)に合わない。不採用
  - メール確認を無効化して SMTP を不要にする: 0円かつ最も簡単だが、パスワードリセットができず、なりすまし登録も可能。開発初期(認証実装時点で SMTP 未設定の間)の一時措置としてのみ許容し、デプロイ時点までに SMTP を設定する
- **E2Eテスト**: テストユーザーは Supabase の Admin API(secret key)で `email_confirm: true` を付けて作成する。CI ではメール送信・Google 画面を通らない

### D-008 SMTP(暫定): Brevo 無料枠

- **暫定採用**: Brevo(旧 Sendinblue)無料プラン(300通/日)を Supabase Auth のカスタム SMTP に設定
- **理由**: 独自ドメインなしでも送信者メールアドレス単体の検証で送れる。カード不要
- **却下**:
  - Resend: 無料3,000通/月だが、任意宛先に送るには独自ドメインが必要(ドメイン取得は年額費用 → 0円制約に反する)
  - Gmail SMTP(アプリパスワード): 動くが個人アカウント依存で、規約上も推奨されない
  - Amazon SES: 無料枠あるがカード必須、サンドボックス解除申請が必要

### D-009 ホスティング: Cloudflare Pages

- **採用**: Cloudflare Pages(静的配信)。サーバー処理が必要になった時点で同プロジェクトの Pages Functions(Workers ランタイム)を使う
- **理由**:
  - 静的配信の帯域・リクエスト数が無制限、ビルド 500回/月、カード不要
  - **商用利用の制限がない**(将来の企業導入・有料化検討を塞がない)
  - Pages Functions は Wrangler(esbuild)でバンドルされるため、`packages/core` をそのまま import できる(フェーズ2の投稿時サーバー側検証で重要)
  - Cron Triggers(定期実行)も無料で使え、ランキング更新の代替手段になる
- **却下**:
  - Vercel Hobby: 開発体験は最良だが、利用規約で**非商用に限定**。企業導入を視野に入れる本プロジェクトには不適。帯域 100GB/月 の上限もある
  - Netlify: 帯域 100GB/月、ビルド 300分/月 と Cloudflare より狭い
  - GitHub Pages: 静的のみでサーバー関数がない。private リポジトリでは有料プランが必要
  - Firebase Hosting: D-006 で Firebase を却下したため、ベンダーを増やす意味がない
- **補足**: Cloudflare は新規プロジェクトに「Workers(Static Assets)」を推奨し始めている。Pages が将来非推奨になっても、静的ファイル+Functions という構成は Workers にそのまま移行できる(設定ファイルの変更のみ、コード変更なし)

### D-010 サーバー側ロジックの置き場

- **採用**: 原則「サーバー側コードを書かない」。権限は RLS、集計は Postgres のビュー/関数(RPC)、定期処理は `pg_cron` で行う。どうしても信頼できる実行環境が必要な処理だけ Cloudflare Pages Functions に置く
- **フェーズ別の見立て**:
  - フェーズ1: サーバー関数なし。進捗・回路の保存は RLS 付きテーブルに直接 upsert
  - フェーズ2: 投稿時の「模範解答がテストケースを全て通るか」の自動チェックは、クライアントで即時実行しつつ、**公開フラグを立てる操作だけ Pages Function 経由**でサーバー側でも再実行する(改ざんされた投稿が公開されないようにする)。クリア率・いいね数は集計ビュー
  - フェーズ3: ランキングは期間別マテリアライズドビュー + `pg_cron` 更新。組織機能は RLS のみで完結
- **却下**: Supabase Edge Functions(Deno)。無料枠は十分(50万回/月)だが、Deno は import に拡張子必須・npm 互換が別系統で、`packages/core` の共有に摩擦がある。Cloudflare 側に寄せた方が1ツールチェーンで済む

### D-011 テスト基盤: Vitest + Playwright

- **採用**:
  - Vitest: `packages/core`(スキャン順序、タイマ、カウンタ、自己保持、微分、判定)のユニットテスト。カバレッジは core で 90% 以上を目標
  - Playwright: 主要フロー(問題を開く → 回路を操作/編集 → 判定 → 模範解答表示 / ログイン → 保存 → 再読込で復元)。デバイスプロファイルは **Pixel 7 相当のモバイル**と Desktop Chrome の2つ
  - React Testing Library: 部品単位の UI テストに限定して使う
- **理由**: Vitest は Vite と設定を共有できて速い。Playwright はモバイルエミュレーションとタッチイベントを標準サポートし、§4 DoD「スマホのブラウザで操作できる」を CI で検証できる
- **却下**: Jest(ESM/TS 設定が重い)、Cypress(モバイルエミュレーションが弱く、並列実行が有料寄り)

### D-012 CI/CD: GitHub Actions + wrangler-action

- **採用**:
  - `ci.yml`: push / PR で lint → typecheck → unit → build → E2E
  - `deploy.yml`: `main` で CI 通過後に `cloudflare/wrangler-action` で Pages へ本番デプロイ。PR ブランチはプレビューデプロイ
  - `db-migrate.yml`: `supabase/migrations/` 変更時に Supabase CLI で `db push`(dev → 手動承認 → prod)
  - `keepalive.yml`: 週2回、Supabase dev/prod に軽いクエリを投げて無料プロジェクトの自動一時停止を防ぐ + 週1回 `pg_dump` を Actions アーティファクトとして保存(無料プランはバックアップなし)
- **理由**: §2.4「CIでテストが通らない状態で次に進まない」を**デプロイのゲート**として実装するため、デプロイは CI の後段に置く。Cloudflare の Git 連携(push で自動ビルド)はテスト失敗でもデプロイされてしまう
- **却下**: Cloudflare Pages の Git 連携ビルド(上記理由。ただし設定は簡単なので、CI ゲートが不要と判断されれば切替可能)、CircleCI / GitLab CI(GitHub 上にリポジトリがあるため不要)
- **前提**: リポジトリは private のため Actions は月 2,000 分。E2E が重くなれば COST.md の縮退方針に従う

### D-013 Lint / Format: Biome

- **採用**: Biome(lint + format を1ツール・1設定で)
- **理由**: 設定量が少なく高速。自律開発ではツール設定の保守コストを最小化したい。`noRestrictedImports` で `packages/core` から React/DOM を import できないようにする
- **却下**: ESLint + Prettier(実績はあるが設定と依存が多い。Biome で不足が出た時点で追加検討)

### D-014 環境分離: Supabase プロジェクト dev / prod

- **採用**: 無料枠の「アクティブ2プロジェクト」を dev(ローカル開発・CI の E2E)と prod(公開URL)に割り当てる
  - ローカル開発時点: `ladder-dojo-dev` を作成(1つ目)
  - デプロイ時点: `ladder-dojo-prod` を作成(2つ目)
- **理由**: E2E テストがテストデータを作るため、本番と共有できない
- **代替(任意)**: Docker がある環境では Supabase CLI のローカルスタック(`supabase start`)を dev に使ってよい。メールは Mailpit で捕捉できるため SMTP 不要。Claude Code の実行環境に Docker がない前提でクラウド dev を正とする

### D-015 Supabase 無料プロジェクトの一時停止・バックアップ対策

- **採用**: D-012 の `keepalive.yml`。加えて、一時停止された場合の復旧手順(ダッシュボードで Restore を押す)を SETUP.md に記載
- **注意**: GitHub Actions のスケジュール実行はリポジトリに 60 日間活動がないと自動停止する。フェーズ3 完了後の待機期間に入ったら、人間が定期的に確認するか、Cloudflare Cron Triggers に keep-alive を移す

### D-016 その他ライブラリ(軽微)

| 用途 | 採用 | 却下 / 備考 |
|---|---|---|
| クライアント状態 | Zustand | Redux(過剰)、Jotai(可、好みの差) |
| サーバーデータ | TanStack Query | SWR(可)。Supabase の型生成(`supabase gen types`)と組み合わせる |
| ルーティング | React Router v7(library mode) | TanStack Router(可)。SPA で十分 |
| フォーム | React Hook Form + zod | — |
| 日時 | Temporal polyfill or date-fns | 連続学習日数は **JST 日付**で判定(仕様上の暫定、下記 S-001) |

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
- **理由**: 試してから登録する導線を壊さない。サーバー側で匿名ユーザーを作ると MAU を消費する

### S-003 提出回路履歴の保持上限(暫定)

- **論点**: §3.5「提出回路そのものを履歴として保持」は無制限だと無料DB(500MB)を圧迫する
- **暫定採用**: 問題ごと・ユーザーごとに **不正解の直近20件 + 正解全件** を保持。同一回路(正規化JSONのハッシュ一致)は重複保存しない
- **理由**: つまずき分析(§3.8)には直近の失敗が重要で、古い失敗は価値が低い。COST.md の縮退方針と連動

---

## 判断の変更履歴

| 日付 | ID | 変更 | 理由 |
|---|---|---|---|
| 2026-09-05 | — | 初版作成 | フェーズ0 技術選定 |

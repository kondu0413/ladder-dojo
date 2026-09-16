# ラダー図トレーニング(ladder-dojo)

PLC のラダー図を「読む」→「直す」→「書く」の順に身につける Web アプリ。仕様の正典は [SPEC.md](./SPEC.md)、判断ログは [docs/DECISIONS.md](./docs/DECISIONS.md)、進捗は [docs/PROGRESS.md](./docs/PROGRESS.md)。

- 本番 URL: https://ladder-dojo.mojya.workers.dev
- ランニングコスト: 0 円(Cloudflare Workers Free + D1 Free + Google OAuth + GitHub Actions)。詳細は [docs/COST.md](./docs/COST.md)

## いまできること

| 画面 | パス | 内容 |
|---|---|---|
| トップ | `/` | 未ログインなら紹介の画面(LP)、ログイン済みなら問題一覧。LP からは「ログインせずに試す」で問題に入れる(S-021) |
| 問題一覧 | `/problems` | 公式問題 35 問を段階別に表示。クリア状況つき。未ログインでも開ける |
| 問題 | `/problems/:id` | 読む(選択式の予測 + 解説 + シミュレータで答え合わせ)/ 直す / 書く |
| みんなの問題 | `/community` | ユーザーが投稿した問題の一覧。検索・並べ替え・絞り込み |
| 投稿問題 | `/community/:id` | 投稿問題を解く。いいね・難易度投票・通報 |
| サンドボックス | `/sandbox` | 自由に回路を作り、テストを付けて保存・実行・投稿 |
| ランキング | `/rankings` | 指標 4 種 × 期間 3 種。速さは競わせない |
| 組織 | `/orgs` | 組織の作成・招待コードでの参加 |
| 組織の詳細 | `/orgs/:id` | メンバー / 課題 / 一覧表 / つまずき。課題には期限と達成率が付く。管理者はメンバー × 問題の表で全員の進捗を一望でき、CSV で保存もできる |
| サンプル | `/samples` | 代表的な回路 5 種を動かして見る |

- どの段階も、やさしい「読む」問題から始まる。接点とコイルだけの回路 → 自己保持、タイマ単体 → 自動消灯、という順に手を広げる
- ラダー図は SVG で描画し、電流が流れている要素・電圧だけ来ている配線・無電圧を色分けする
- 操作はタップ中心(ドラッグ非依存)。スマホ幅で E2E を回している
- タイマは実時間。1x / 5x / 即時 を切り替えられる
- 判定は「入力操作 → 期待出力」の振る舞い一致。回路の形は見ない。不正解のときは、どのテストのどの操作のあとで何が違ったかを表示する
- ラダー図は読み上げに対応している。SVG の `aria-label` に行ごとの説明が入り(「1 行目、X0 の a 接点、Y0 の出力コイル」)、動かすと通電状態も読める。通電表示は色だけに頼らず、電圧が来ているだけの配線は破線で描く(S-018)
- 2 回続けて不正解だと、つまずき診断が出る。回路に 1 手だけ修正を当てて判定し直し、通る手が見つかればそのセルをラダー図で囲んで示す。直し方までは言わない
- 不正解のときはタイムチャートも出る。入力と出力の波形を時間軸で並べ、食い違ったデバイスの行を赤くする
- 問題ページには「みんながつまずくところ」が畳んで置いてある。実際にその問題でつまずいた**人数**だけを出し、3 人に達するまでは表示しない
- クリアしてから日が経った問題は、一覧の上に「そろそろ復習しませんか」として出る。間隔は 7 / 21 / 60 日と広がる。手元の進捗だけで決まるので未ログインでも動く
- **スマホでも PC でも使える**。画面幅に合わせて一覧が 1〜3 列に変わり、狭いときはメニューが畳まれる。画面の枠は `AppShell` に集約している(S-020)
- **オフラインで使える**。ホーム画面に追加でき、電波が無くても公式問題とサンドボックスはそのまま動く。保存・投稿・ランキングだけがつながってからになる(2 回目の訪問から有効)
  - アイコンは `public/*.svg` が正で、PNG はそこから作った出力。SVG を直したら `pnpm --filter @ladder-dojo/web icons` で作り直す(iOS Safari が `apple-touch-icon` に SVG を受け付けないため PNG が要る)
- 画面ごとに JS を分けて最初の読み込みを軽くしている。分けた分は手が空いてから裏で取りに行くので、一度も開いていない画面もオフラインで開ける(S-015)
- 未ログインでも全部解ける。ログイン(Google)すると進捗がサーバーに同期され、端末に溜めた進捗を引き継げる
- サンドボックスの回路はテストを付けて問題として投稿できる。投稿時にサーバーが模範解答を自動チェックし、自分のテストを通らなければ公開しない
- 公開範囲は 公開 / 組織のメンバーだけ / 非公開。組織限定の問題は組織外からは検索にも直 URL にも出てこない
- ログイン中は答え合わせのたびに提出回路がサーバーに残る。組織の管理者はそれをラダー図で見て、どこでつまずいたか追える
- 全体ランキングは 1 日 1 回の Cron で集計したスナップショットを返す(D1 の読み取り行数を使いすぎないため)。組織内ランキングは対象が少ないのでその場で計算する

## 構成

```
packages/core   シミュレータ・判定・回路 JSON スキーマ・編集操作(純 TypeScript、DOM / Node API 非依存)
apps/web        React 19 + Vite + Tailwind v4 の SPA。公式問題もここに同梱(src/problems/)
apps/api        Cloudflare Worker(Hono + D1 + Better Auth)。wrangler.jsonc、D1 マイグレーション、API テスト
.github/        CI(ci.yml)、デプロイ(deploy.yml)、D1 バックアップ(backup.yml)
docs/           PROGRESS / DECISIONS / COST / SETUP
```

`apps/web` は `apps/api` から **DTO の型だけ**を import する(`@ladder-dojo/api/dto`)。実行時コードは import しない(D-002 / D-016)。

1 つの Worker `ladder-dojo` が `/api/*` を Hono で処理し、それ以外は `apps/web/dist` の静的ファイル(SPA フォールバック付き)を返す。

## 手元で動かす(任意)

Claude Code の開発・テストは手元の環境を必要としない。人間が触って確認したい場合のみ。

```sh
corepack enable && corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm dev          # Vite(http://localhost:5173)と wrangler dev(http://localhost:8787、ローカル D1)を同時起動
```

`/api` は Vite から 8787 にプロキシされる。Google ログインを手元で試す場合だけ `.env.example` を `.env.local` にコピーして値を入れる(docs/SETUP.md §5)。

## テスト

```sh
pnpm lint         # Biome
pnpm typecheck    # tsc(全パッケージ)
pnpm test         # core ユニット(カバレッジ閾値つき)+ API テスト(workerd + ローカル D1)+ web ユニット
pnpm build        # core → web(dist/)
pnpm e2e          # Playwright。ビルド済み SPA を wrangler dev --env e2e で配信して接続(モバイル + デスクトップ)
pnpm ci           # 上記すべて
```

E2E は `apps/api` の `e2e:serve` が `wrangler dev --env e2e` を起動する。`E2E_BASE_URL` を設定すると既存サーバーに接続する。手元の Chromium を使いたいときは `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`。

## デプロイ

`main` への push で `.github/workflows/deploy.yml` が動く。

1. `ci.yml` をそのまま呼び出し(lint → typecheck → unit → API → build → E2E)。失敗すればデプロイしない
2. `wrangler whoami` でアカウント ID を取得
3. D1 `ladder-dojo` が無ければ `wrangler d1 create` で作成し、ID を `apps/api/wrangler.jsonc` に反映
4. `wrangler d1 migrations apply ladder-dojo --remote`(`apps/api/migrations/*.sql` がある場合)
5. `wrangler deploy`
6. Worker のシークレットを同期: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は GitHub Secrets から、`BETTER_AUTH_SECRET` は未登録のときだけ生成して登録

GitHub Secrets は **`CLOUDFLARE_API_TOKEN` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` の 3 つ**だけ(docs/SETUP.md)。PR の CI はシークレットを使わない。

### バックアップと復元

- `backup.yml` が毎週月曜 03:00 JST に `wrangler d1 export --remote` の結果を Actions アーティファクト(28 日保持 = 4 世代)に保存する。手動実行も可
- 復元: アーティファクトの `.sql.gz` を展開し、`cd apps/api && pnpm exec wrangler d1 execute ladder-dojo --remote --file <file>.sql`。7 日以内なら `wrangler d1 time-travel restore ladder-dojo --timestamp <ISO 8601>` も使える

# ラダー図トレーニング(ladder-dojo)

PLC のラダー図を「読む」→「直す」→「書く」の順に身につける Web アプリ。仕様の正典は [SPEC.md](./SPEC.md)、判断ログは [docs/DECISIONS.md](./docs/DECISIONS.md)、進捗は [docs/PROGRESS.md](./docs/PROGRESS.md)。

- 本番 URL: https://ladder-dojo.mojya.workers.dev
- ランニングコスト: 0 円(Cloudflare Workers Free + D1 Free + Google OAuth + GitHub Actions)。詳細は [docs/COST.md](./docs/COST.md)

## 構成

```
packages/core   シミュレータ・判定・回路 JSON スキーマ(純 TypeScript、DOM / Node API 非依存)
apps/web        React 19 + Vite + Tailwind v4 の SPA。ビルド成果物 dist/ を Worker の静的アセットとして配信
apps/api        Cloudflare Worker(Hono + D1)。wrangler.jsonc、D1 マイグレーション、API テスト
.github/        CI(ci.yml)、デプロイ(deploy.yml)、D1 バックアップ(backup.yml)
docs/           PROGRESS / DECISIONS / COST / SETUP
```

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
pnpm test         # core ユニット + API テスト(workerd + ローカル D1)
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

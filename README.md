# 業者検索アプリ

Salesforce の発注先（商品オブジェクト）を検索し、実績・年度別グラフ・口コミをまとめて確認できる Web アプリです。

## 機能

| # | 機能 | 内容 |
|---|------|------|
| — | ログイン | Salesforce アカウントでログイン（OAuth 2.0 + PKCE）。データは**ログインした人の権限**で表示 |
| ① | 検索 | 発注先名／商品コードのキーワード、ファミリ、評価（★3/4/4.5以上）、有効のみ |
| ② | 口コミ入力 | ★1〜5・観点（品質/納期/価格/対応/その他）・関連商談・本文。投稿者はログインユーザー名が自動で入ります。**アプリ側の DB（SQLite）に保存** |
| ③ | 実績の紐づけ | 商談商品の `Product2Id`（＝発注先）で集計し、発注先ごとに実績を表示 |
| ④ | 年度別グラフ | 直近5年度の「利用回数」と「利用金額」を棒グラフで表示（今期は濃い色） |
| ⑤ | 今期の利用一覧 | 利用日の新しい順。利用が無い場合は「直近の利用はありませんでした」 |

## 実績の紐づけ方（③）

Salesforce 側の設定変更は不要です。

```
商品（Product2＝発注先） ← Product2Id ─ 商談商品（OpportunityLineItem） ─ OpportunityId → 商談（Opportunity）
```

商談商品は必ず商品 ID を持っているため、「商品＝その発注先」の商談商品を集めれば実績になります。

| 項目 | 使用する Salesforce 項目 |
|------|------------------------|
| 利用日 | 商談商品の作成日 `OpportunityLineItem.CreatedDate`（日本時間の日付に変換） |
| 利用金額 | 商談商品の最終原価 `FinalCost__c` |
| 利用回数 | **商談商品の件数** |
| 対象 | 商談ステージが「請求」以降（ステージの並び順で判定）。失注は除外 |
| 年度 | 1月〜12月（`FISCAL_YEAR_START_MONTH=1`）。`2026年度` ＝ 2026/1/1〜12/31 |

## 起動方法

Node.js 22.5 以上が必要です（口コミ保存に内蔵の `node:sqlite` を使用）。

```bash
npm install
```

```bash
npm start
```

http://localhost:3000 を開きます。`.env` が無い（`SF_CLIENT_ID` が空の）場合は、ログインなしの**デモデータ**で動きます。

## Salesforce との接続

1. Salesforce の **外部クライアントアプリ**（または接続アプリ）の OAuth 設定
   - **コールバック URL**：`http://localhost:3000/oauth/callback`（本番は `https://<アプリのURL>/oauth/callback`）
   - **OAuth 範囲**：`api`、`refresh_token, offline_access`、`openid`（または `id`）
   - **PKCE を必須にする**：オン
   - **Web サーバーフローの秘密が必要**：オフ（オンにする場合は `.env` に `SF_CLIENT_SECRET` を設定）
   - 利用者のプロファイル／権限セットにこのアプリへのアクセスを許可
2. `.env.example` を `.env` にコピーし、`SF_CLIENT_ID`（コンシューマー鍵）を設定
   - Sandbox の場合は `SF_LOGIN_URL=https://test.salesforce.com`
   - 本番公開時は `APP_BASE_URL` を `https://…` に変更（Cookie が Secure になります）
3. `npm start` → 「Salesforce でログイン」

利用者には、商品・商談・商談商品と `FinalCost__c` の**参照権限**が必要です。見えない商談はアプリにも表示されません。

## 構成

```
server.js            Express サーバー（API とファイル配信）
lib/config.js        設定（.env）
lib/auth.js          Salesforce ログイン（OAuth 2.0 Web サーバーフロー + PKCE）・セッション
lib/salesforce.js    Salesforce REST API（SOQL）
lib/mock.js          デモデータ
lib/service.js       検索・年度集計・口コミのロジック
lib/reviews.js       口コミの保存（SQLite: data/reviews.db）
lib/fiscal.js        会計年度の計算
public/              画面（HTML / CSS / JS、SVG 棒グラフ）
```

### API

| メソッド | パス | 内容 |
|---------|------|------|
| GET | `/auth/login` | Salesforce ログイン画面へ |
| GET | `/oauth/callback` | ログイン後の戻り先 |
| POST | `/auth/logout` | ログアウト（トークンを無効化） |
| GET | `/api/meta` | ファミリ一覧・観点・今期 |
| GET | `/api/vendors?keyword=&family=&minRating=&activeOnly=true` | 発注先検索 |
| GET | `/api/vendors/:id` | 詳細（年度別集計・今期利用・口コミ） |
| POST | `/api/vendors/:id/reviews` | 口コミ登録 |

## 本番運用時の注意

- 本番は必ず **HTTPS** で公開してください（`APP_BASE_URL=https://…`）。
- ログイン情報はサーバーのメモリに保持します。**サーバーを再起動すると全員ログアウト**されます。8時間操作が無い場合も自動ログアウトします。
- 口コミは `data/reviews.db` に保存されます。定期的なバックアップをおすすめします。
- 検索結果は最大200件です。

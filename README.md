# 業者検索アプリ

Salesforce の発注先（商品オブジェクト）を検索し、実績・年度別グラフ・口コミをまとめて確認できる Web アプリです。

## 機能

| # | 機能 | 内容 |
|---|------|------|
| ① | 検索 | 発注先名／商品コードのキーワード、ファミリ、評価（★3/4/4.5以上）、有効のみ |
| ② | 口コミ入力 | ★1〜5・観点（品質/納期/価格/対応/その他）・関連商談・投稿者名・本文。**アプリ側の DB（SQLite）に保存** |
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
| 利用回数 | 利用した**商談の件数**（1商談に同じ発注先の明細が複数あっても1回） |
| 対象 | 商談ステージが「請求」以降（ステージの並び順で判定）。失注は除外 |
| 年度 | Salesforce の会計年度開始月（組織設定）に従う。`2026年度` ＝ 開始年 |

## 起動方法

Node.js 22.5 以上が必要です（口コミ保存に内蔵の `node:sqlite` を使用）。

```bash
npm install
```

```bash
npm start
```

http://localhost:3000 を開きます。`.env` が無い場合は**デモデータ**で動きます。

## Salesforce との接続

1. Salesforce の設定で **外部クライアントアプリ**（または接続アプリ）を作成
   - OAuth を有効化し、スコープに `api` を追加
   - **クライアントログイン情報フロー（Client Credentials Flow）** を有効化し、「実行ユーザー」を指定
     （このユーザーの権限で商品・商談・商談商品を読み取ります。`FinalCost__c` の参照権限が必要）
2. `.env.example` を `.env` にコピーし、`SF_LOGIN_URL`（My Domain の URL）、`SF_CLIENT_ID`、`SF_CLIENT_SECRET` を設定
3. `npm start`

## 構成

```
server.js            Express サーバー（API とファイル配信）
lib/config.js        設定（.env）
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
| GET | `/api/meta` | ファミリ一覧・観点・今期 |
| GET | `/api/vendors?keyword=&family=&minRating=&activeOnly=true` | 発注先検索 |
| GET | `/api/vendors/:id` | 詳細（年度別集計・今期利用・口コミ） |
| POST | `/api/vendors/:id/reviews` | 口コミ登録 |

## 本番運用時の注意

- **ログイン機能はありません。** 社外に公開せず社内ネットワーク内で動かすか、前段に認証（Salesforce ログインや社内 SSO）を追加してください。
- 口コミは `data/reviews.db` に保存されます。定期的なバックアップをおすすめします。
- 検索結果は最大200件です。

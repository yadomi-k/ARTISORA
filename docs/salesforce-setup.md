# Salesforce の設定手順（ARTISORA 業者検索）

VISORA と同じく、アプリはブラウザから直接 Salesforce にログインし、データを読み書きします。
アプリ側にはデータを保存しません（口コミも Salesforce に保存します）。

## 1. 口コミ用のオブジェクトを作る

`salesforce/` フォルダに定義があります。Salesforce CLI でデプロイできます。

```bash
cd salesforce
sf project deploy start --source-dir force-app --target-org <組織の別名>
```

画面で作る場合は、次のとおり作成してください。

**カスタムオブジェクト：パートナー口コミ（`Partner_Review__c`）**
- レコード名：口コミ番号（自動採番 `RV-{000000}`）
- 共有設定（組織の共有設定）：公開／参照のみ（全員が読めて、編集は作成者のみ）

| 項目の表示ラベル | API参照名 | データ型 | 備考 |
|---|---|---|---|
| 発注先 | `Vendor__c` | 参照関係（商品） | 必須。削除の制限あり |
| 評価 | `Rating__c` | 数値（1桁、小数0） | 必須 |
| 観点 | `Category__c` | 選択リスト | 品質／納期／価格／対応／その他 |
| 口コミ | `Comment__c` | ロングテキストエリア（32,768） | |
| 関連商談 | `Opportunity__c` | 参照関係（商談） | 任意 |

入力規則 `Rating_Range`：`OR(Rating__c < 1, Rating__c > 5)` → 「評価は1〜5で入力してください。」

商品（発注先）のページレイアウトに関連リスト「パートナー口コミ」を追加すると、Salesforce の画面でも口コミを確認できます。

## 2. 権限を付ける

権限セット **ARTISORA 利用者**（`ARTISORA_User`）を利用者に割り当てます。
（パートナー口コミの参照・作成、観点／口コミ／関連商談の項目）

利用者には、ほかに次の参照権限が必要です：商品、商談、商談商品、商談商品の `FinalCost__c`。

## 3. 外部クライアントアプリ（コンシューマ鍵：`3MVG9YDQS5WtC11pW...EXJn`）

| 設定 | 値 |
|---|---|
| コールバック URL | `https://yadomi-k.github.io/ARTISORA/` |
| OAuth 範囲 | `api`、`openid` |
| PKCE 拡張を要求 | オン |
| Web サーバーフローの秘密が必要 | **オフ**（サーバーが無いため） |
| 利用者 | 利用者のプロファイル／権限セットに許可 |

## 4. CORS（VISORA で設定済み）

許可オリジン `https://yadomi-k.github.io` は VISORA で登録済みのため、追加の設定は不要です。
（設定 → CORS：「OAuth エンドポイントの CORS を有効化」がオン、許可オリジンリストに `https://yadomi-k.github.io`）

## 集計のルール

| 項目 | 内容 |
|---|---|
| 発注先 | 商品（`Product2`） |
| 実績 | 商談商品（`OpportunityLineItem`）のうち、商品＝その発注先のもの |
| 利用日 | 商談商品の作成日 `CreatedDate`（日本時間の日付） |
| 利用金額 | `FinalCost__c`（最終原価）の合計 |
| 利用回数 | 商談商品の件数 |
| 対象の商談 | ステージが「請求」「完了」 |
| 年度 | 1月〜12月 |

変更は `index.html` 先頭の `window.AppConfig` で行えます。

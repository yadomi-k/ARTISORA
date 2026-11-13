# ARTISORA（業者検索）

Salesforce の発注先（商品）を検索し、実績・年度別グラフ・今期の利用・口コミをまとめて確認するアプリです。
VISORA と同じく、`index.html` 1ファイルを GitHub Pages で公開し、ブラウザから直接 Salesforce にログインして使います。

**公開URL：https://yadomi-k.github.io/ARTISORA/**

**データはすべて Salesforce にあります。** アプリ側には保存しません。

## 機能

| # | 機能 | 内容 |
|---|---|---|
| — | ログイン | Salesforce アカウントでログイン（OAuth 2.0 + PKCE）。ログインした人の権限でデータを表示 |
| ① | 検索 | 検索画面 → 検索結果 → 発注先の内容 の順に表示。条件は発注先名／商品コード、工事類〜その他の取扱区分、対応エリア、ファミリ、評価、有効のみ（すべて選択式）。内製部門に✓がある発注先は出さない |
| ② | 口コミ | ★1〜5・観点・関連商談・本文を、Salesforce の「パートナー口コミ」に登録。投稿者は Salesforce の作成者 |
| ③ | 実績の紐づけ | 商談商品の商品（`Product2Id`）＝発注先として集計 |
| ④ | 年度別グラフ | 直近5年度（1月〜12月）の利用回数・利用金額の棒グラフ。今期は濃い色 |
| ⑤ | 今期の利用 | 利用日の新しい順。無い場合は「直近の利用はありませんでした」 |

「デモデータで試す（ログインなし）」で、Salesforce に接続せずに画面を確認できます（デモで登録した口コミは保存されません）。

## ファイル

```
index.html                 アプリ本体（設定は先頭の window.AppConfig）
salesforce/                口コミ用オブジェクト・権限セットの定義（Salesforce CLI でデプロイ可）
docs/salesforce-setup.md   Salesforce の設定手順
```

## 公開（GitHub Pages）

リポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にします。
`main` に push すると数分で公開URLに反映されます。

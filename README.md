# my-first-project

3人チームで開発を進めるためのリポジトリです。

## はじめに
1. 開発の流れ・ブランチ運用は [CONTRIBUTING.md](CONTRIBUTING.md) を読んでください。
2. Claude Code(クラウド)で開発する場合は [CLAUDE.md](CLAUDE.md) がClaudeへの共通指示になります。
3. 開発環境のセットアップ手順は下記「セットアップ」に追記してください。

## ツール概要
Zoom商談の文字起こしから制作発注書の項目を自動抽出し、確認・修正のうえHubSpotへ転記する単一HTMLツールです(`index.html`)。

- 実行: `index.html` をブラウザで開くだけ(Node.js・サーバー不要)。
- 技術: HTML / Tailwind CSS(CDN) / 素のJavaScript。抽出はルールベースでAI・外部送信なし。
- HubSpotトークンは画面で一時入力、またはブラウザのLocalStorageに保存(HubSpot API以外には送信しません)。
- 注意: HubSpot APIをブラウザから直接呼ぶとCORSで失敗する場合があります。その場合は「発注書テキストをコピー」で手動貼り付けしてください。

## セットアップ
特にありません。`index.html` を開いて動作確認してください。

## 秘密情報の扱い
APIキーやトークンはリポジトリにcommitしないでください。`.env` は `.gitignore` 済みです。

## 発注書変換スキル(Claude Code)
Zoom文字起こしを発注書に変換する、**種類別の専用スキル**です。種類ごとに完全に分離しており、書式・ルールは混ざりません。

| コマンド | 対象 | 見出し |
|---|---|---|
| `/order-raqmo` | RAQMO(制作発注) | 【制作発注】 |
| `/order-nest` | nestの発注 | 【nestの発注】 |

- 使い方: `/order-nest` の後ろに文字起こしを貼る(または実行後に貼る)。出力は「発注書本文」と「要確認リスト」。
- 自動では起動しません(`disable-model-invocation`)。必ずコマンドで種類を選んでください。
- 場所: `.claude/skills/order-raqmo/` と `.claude/skills/order-nest/`(各 `SKILL.md`=変換ルール、`template.md`=書式、`learning.md`=過去事例の学習メモ)。
- 種類の見分け方: 「nest / フルパック / AIO / 口コミ誘導」が出ればnest、「ドメイン / MEETO / MOFUL / サイト名」が出ればRAQMO。
- nestにRAQMO-LP(AIO付)が付く場合は、nestの発注書内の【AIO-RAQMO付の場合】欄に書きます(RAQMO書式は使わない)。別契約なら2通に分けて作成します。
- パスワードの扱いは種類で異なります(RAQMO=書かない、nest=お客様が明言した場合のみ記入)。発注書には機微情報が入りうるため、Gitや共有チャットに貼らないでください。

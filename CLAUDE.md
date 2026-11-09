# CLAUDE.md

このリポジトリは3人チームで開発しています。Claude Codeは以下に従ってください。

## 基本方針
- 日本語で会話・コメント・PR説明を書く。
- 変更は小さく、1PR = 1目的。
- 指示された範囲を超えるリファクタリングはしない。必要なら別Issue/PRを提案する。
- 秘密情報(APIキー等)をcommit・ログ出力しない。

## ブランチ・PR
- `main` に直接pushしない。割り当てられた作業ブランチで開発する。
- PRは依頼があったときだけ作る。作る際は `.github/pull_request_template.md` に沿う。
- 詳細は [CONTRIBUTING.md](CONTRIBUTING.md)。

## コード規約
- 構成: 単一HTML(`index.html`)。HTML / Tailwind CSS(CDN) / 素のJavaScript。ビルド工程・外部ライブラリの追加はしない(必要なら先にIssueで相談)。
- JavaScript: `'use strict'`、インデント2スペース、変数・関数は `camelCase`、定数は `UPPER_SNAKE_CASE`。コメントは日本語。
- 秘密情報: HubSpotトークンなどをコードに埋め込まない。画面からの入力、またはLocalStorageのみ(読み書きは `try/catch` で囲む)。
- 外部通信: HubSpot API以外へデータを送信しない。
- 公開: このリポジトリはPublic。顧客名・個人情報・社内事情をコード、コミット、Issue、PRに書かない。

## 実行・テスト
- ビルド: 不要。
- 実行: `index.html` をブラウザで開く。または `python3 -m http.server 8000` を実行して `http://localhost:8000/` を開く。
- テスト: 自動テストは未整備。商材を「RAQMO」にし、サンプルのVTTを貼り付けて「自動解析」を実行し、5項目の抽出と、必須項目の「未確定(要確認)」バッジが入力で消えることを確認する。商材「nest」では、プレビューがnestひな形に切り替わり、コピー/転記される本文が `【nestの発注】` で始まること、RAQMOの項目が混ざらないことを確認する。
- HubSpot転記: 実通信はCORSで失敗する場合がある。確認はテスト用の取引・チケットで行い、本番データでは試さない。
- 公開: GitHub Pages(`main` / root)。`main` へのマージで更新される。

# kzn-form-tool

3人チームで開発を進めるためのリポジトリです。

## はじめに
1. 開発の流れ・ブランチ運用は [CONTRIBUTING.md](CONTRIBUTING.md) を読んでください。
2. Claude Code(クラウド)で開発する場合は [CLAUDE.md](CLAUDE.md) がClaudeへの共通指示になります。
3. 開発環境のセットアップ手順は下記「セットアップ」に追記してください。

## ツール概要
Zoom商談の文字起こしから制作発注書の項目を自動抽出し、確認・修正のうえHubSpotへ転記する単一HTMLツールです(`index.html`)。

- 商材の切替: 基本設定の「商材」で、プレビューの項目が変わります。**nest** はnestの発注ひな形(受注・販促商品/nest本体/AUTO/AIO/AIO-RAQMO付/イレギュラー)の全項目で、その形式のテキストがHubSpotへ転記されます。**RAQMO・その他** は従来の制作発注の項目です。
- 実行: `index.html` をブラウザで開くだけ(Node.js・サーバー不要)。
- 技術: HTML / Tailwind CSS(CDN) / 素のJavaScript。抽出はルールベースでAI・外部送信なし。
- HubSpotトークンは画面で一時入力、またはブラウザのLocalStorageに保存(HubSpot API以外には送信しません)。
- 注意: HubSpot APIをブラウザから直接呼ぶとCORSで失敗する場合があります。その場合は「発注書テキストをコピー」で手動貼り付けしてください。

## セットアップ
特にありません。`index.html` を開いて動作確認してください。

## 秘密情報の扱い
APIキーやトークンはリポジトリにcommitしないでください。`.env` は `.gitignore` 済みです。

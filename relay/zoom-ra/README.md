# Zoom Revenue Accelerator 中継サーバー

発注書作成ツールから、Zoom Revenue Accelerator のAI要約を自動で取り込むための、小さな中継サーバー(Cloudflare Workers)です。

- Zoomの鍵は、このサーバーの「シークレット」にだけ置きます。**コード・Gitには書きません**。
- 使えるのは「商談の一覧」と「1件の要約」だけです。Zoomの他のAPIは中継しません。
- 合言葉(`RELAY_TOKEN`)を知っている人だけが、使えます。

> **注意**: Zoomの公式ドキュメントを確認できない環境で作りました。APIのパス・権限(scope)・要約の返り方は、実際に動かして確認が必要です。うまく取れないときは、下の「うまくいかないとき」を見てください。

## 準備するもの
- Zoomの管理者(アプリを作る権限があること)
- Cloudflareのアカウント(無料枠で足ります)
- Node.js(wranglerを使う場合)

## 1. Zoomでアプリをつくる(Zoom Marketplace)
1. [Zoom App Marketplace](https://marketplace.zoom.us/) の「Develop」→「Build App」→ **Server-to-Server OAuth** を選びます。
2. 「Scopes」で、Revenue Accelerator の **会話の一覧・詳細を読む権限**(名前に `zra:` や `iq_conversation` が付くもの。`...:admin` の付くもの)を追加します。権限が表示されないときは、Zoomの管理者設定(ロールの権限)と、契約プランを確認してください。
3. アプリを「Activate(有効化)」します。
4. 画面に出る **Account ID / Client ID / Client Secret** を控えます(人に見せない・Gitに書かない)。

## 2. Cloudflare Workersにおく
```bash
cd relay/zoom-ra
npx wrangler login
npx wrangler deploy
```
`wrangler.toml` の `ALLOWED_ORIGIN` は、ツールを開くURLの元(例: `https://kizunayyamamoto-afk.github.io`)にします。

## 3. シークレットを登録する
```bash
npx wrangler secret put ZOOM_ACCOUNT_ID
npx wrangler secret put ZOOM_CLIENT_ID
npx wrangler secret put ZOOM_CLIENT_SECRET
npx wrangler secret put RELAY_TOKEN
```
`RELAY_TOKEN` は、自分で決める長いランダムな文字列です(例: `openssl rand -hex 24` の結果)。

## 4. ツールに設定する
1. 発注書作成ツールの左カラム「Zoomの商談内容」→「Zoom Revenue Acceleratorから自動で取得」を開きます。
2. 「中継サーバーのURL」に、デプロイ後のURL(`https://kzn-zoom-ra-relay.○○.workers.dev`)を入れます。
3. 「アクセストークン」に、`RELAY_TOKEN` を入れます。
4. 「商談の一覧を取得」を押し、商談を選んで「この商談の要約を取り込む」を押します。
5. 「商材を選んだら、直近の商談の要約を自動で取り込む」をオンにすると、商材を選んだときに、直近の商談を自動で取り込みます(違う商談のときは、一覧から選び直してください)。

## 動作の確認(curl)
```bash
curl -H "Authorization: Bearer <RELAY_TOKEN>" \
  "https://<デプロイ後のURL>/conversations?from=2026-11-01&to=2026-11-13"
```

## うまくいかないとき
| 症状 | 確認すること |
|---|---|
| 401 | ツールのアクセストークンが、`RELAY_TOKEN` と同じか |
| 502「Zoomから…取得できませんでした」 | Zoomアプリが有効か。会話を読む権限が付いているか。期間内に商談があるか。レスポンスの `zoom` に、Zoomのエラーが入ります |
| ツールに「接続できません」 | URLの間違い。`ALLOWED_ORIGIN` が、ツールのURLの元と一致しているか(末尾の `/` なし) |
| 要約の文章が空 | Zoom側で解析が終わっていない可能性。しばらくしてから、もう一度 |
| 一覧や要約の形が違う | レスポンスの項目名がZoomの仕様と違う可能性。名前を伏せた実際のレスポンスを見せてください(`worker.js` と、ツールの `zraListOf` / `zraFlatten` を合わせます) |

## セキュリティ
- 合言葉と、Zoomの鍵は、人に渡さない・Gitに書かない。漏れたら、合言葉はすぐ変更し、ZoomのClient Secretは再発行してください。
- 中継サーバーが返す要約には、お客様の情報が含まれます。ツールを開く人を、社内に限ってください。

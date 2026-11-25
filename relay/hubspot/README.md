# HubSpot中継サーバー(無料・Cloudflare Workers)

発注書作成ツールから、HubSpotの**読み取り**(取引・会社)と**チケット作成**をするための、小さな中継サーバーです。

## なぜ必要か
HubSpotのAPIは、ブラウザのページから直接は呼べません(ブラウザの制限「CORS」。画面に「Failed to fetch」と出ます)。そこで、間にこの中継サーバーを置きます。

```
ツール(ブラウザ) → 中継サーバー(Cloudflare Workers・無料) → HubSpot
```

- HubSpotのトークンは、**中継サーバーの中にだけ**置きます。ブラウザにも、Gitにも、置きません。
- 使えるのは、次の4つだけです。取引・会社を、書き換えたり、削除したりはできません。
  1. 取引の読み取り　2. 会社の読み取り　3. 取引に紐づく会社の取得　4. チケットの新規作成(取引・会社への紐づけつき)
- ツールが送る「合言葉」を知っている人だけが使えます。

## 費用
Cloudflare Workersの**無料プラン**で足ります(1日10万回の呼び出しまで。この用途では、1日に数十回です)。クレジットカードの登録は、不要な見込みです。プランの内容は、変わることがあるので、Cloudflareの公式の説明で確認してください。

## 用意するもの
| もの | 誰が | 備考 |
|---|---|---|
| HubSpotのアクセストークン(`pat-…`) | HubSpotの管理者 | Private Appを作って発行。権限は、取引の読み取り(`crm.objects.deals.read`)、会社の読み取り(`crm.objects.companies.read`)、チケットの読み取り・書き込み(`tickets`) |
| Cloudflareの無料アカウント | ツールの管理者 | メールアドレスで登録 |
| 合言葉 | ツールの管理者 | 自分で決める、長いランダムな文字列(例: パスワード生成ツールで30文字) |

## 手順(画面だけで、できます。コマンドは不要です)
1. **Cloudflareに登録**: <https://dash.cloudflare.com/sign-up> で、無料アカウントを作ります。
2. **Workerを作る**: 左メニューの「Workers & Pages」→「作成」→「Workers」→「Hello World」を選び、名前を `kzn-hubspot-relay` にして「デプロイ」。
3. **プログラムを貼る**: 「コードを編集」を押し、中身を**すべて消して**、このフォルダの `worker.js` の内容を、そのまま貼ります。「デプロイ」を押します。
4. **変数とシークレットを登録**: 作ったWorkerの「設定」→「変数とシークレット」で、次の3つを追加して、「デプロイ」します。

   | 名前 | 種類 | 値 |
   |---|---|---|
   | `HUBSPOT_TOKEN` | シークレット | HubSpotのアクセストークン(`pat-…`) |
   | `RELAY_TOKEN` | シークレット | 自分で決めた合言葉 |
   | `ALLOWED_ORIGIN` | テキスト | `https://kizunayyamamoto-afk.github.io`(末尾の `/` なし) |

5. **URLを確認**: Workerの画面に、`https://kzn-hubspot-relay.○○.workers.dev` のようなURLが出ます。
6. **ツールに入れる**: 発注書作成ツールの左カラム「HubSpot接続設定」に、次を入れます。
   - 「HubSpot中継サーバーのURL」: 5のURL
   - 「アクセストークン(中継サーバーの合言葉)」: `RELAY_TOKEN` と同じ合言葉
7. **試す**: 右カラムの「HubSpot 紐づけ先」に、テスト用の取引IDを入れて、「HubSpotの情報を取得して反映」を押します。

(コマンドで置く場合は、このフォルダで `npx wrangler deploy` のあと、`npx wrangler secret put HUBSPOT_TOKEN` と `npx wrangler secret put RELAY_TOKEN` を実行します。`wrangler.toml` の `ALLOWED_ORIGIN` は、公開サイトに合わせて直します。)

## 動作の確認(任意)
```bash
curl -H "Authorization: Bearer <合言葉>" \
  "https://<WorkerのURL>/crm/v3/objects/deals/<取引ID>?properties=dealname"
```

## うまくいかないとき
| 症状 | 確認すること |
|---|---|
| ツールに「中継サーバーと通信できません」 | URLの間違い。`ALLOWED_ORIGIN` が、ツールを開いているURLの元と、一致しているか(末尾の `/` なし、`https://`から) |
| 401(合言葉が違います) | ツールの「アクセストークン」が、`RELAY_TOKEN` と同じか。HubSpot側のトークンが無効な場合も、401になります |
| 403 | HubSpotのPrivate Appの権限(取引・会社・チケット)を確認 |
| 404 | 取引ID・会社IDの間違い。または、許可していない操作 |
| チケット作成で、紐づけのエラー | HubSpot側で、取引・会社への紐づけに、書き込み権限が必要な場合があります。管理者に、取引・会社の書き込み権限の追加を相談 |

## セキュリティ
- 合言葉と、HubSpotのトークンは、人に渡さない・Gitに書かない・チャットに貼らない。漏れたときは、Cloudflareの画面で値を変え、HubSpotのトークンも再発行してください。
- 中継サーバーが返す内容には、お客様の情報が含まれます。ツールを開く人を、社内に限ってください。

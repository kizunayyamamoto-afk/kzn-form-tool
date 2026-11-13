// Zoom Revenue Accelerator の要約を取得する、中継サーバー（Cloudflare Workers 用）
// 発注書作成ツールから呼ばれ、Zoom の API を代わりに呼んで、結果を返す。
// Zoom の鍵は、このWorkerのシークレット（環境変数）にだけ置く。コードには書かない。
//
// 環境変数（シークレット）:
//   ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET : Zoom の Server-to-Server OAuth アプリの値
//   RELAY_TOKEN     : ツールが送る合言葉（自分で決めた長いランダム文字列）
//   ALLOWED_ORIGIN  : ツールを開くURLの元（例: https://kizunayyamamoto-afk.github.io）
//
// 使えるURL（これ以外は404。Zoomの任意のAPIを中継することはしない）:
//   GET /conversations?from=YYYY-MM-DD&to=YYYY-MM-DD  … 商談（会話）の一覧
//   GET /conversations/{id}                           … 1件の詳細と、内容分析（要約）

'use strict';

const ZOOM_API = 'https://api.zoom.us/v2';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ID_RE = /^[A-Za-z0-9_\-=+]{6,200}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let cachedToken = null;   // { value, expiresAt }

const json = (body, status, cors) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
});

// 長さが同じでも、比較にかかる時間を一定にする（合言葉の当てずっぽう対策）
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function zoomToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
  const basic = btoa(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`);
  const res = await fetch(`${ZOOM_TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID)}`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error('Zoomの認証に失敗しました。アカウントID・クライアントID・シークレットを確認してください。');
    err.status = 502;
    throw err;
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function zoomGet(env, path) {
  const token = await zoomToken(env);
  const res = await fetch(`${ZOOM_API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const cors = {
      'access-control-allow-origin': allowed && origin === allowed ? allowed : 'null',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'GETだけ使えます。' }, 405, cors);

    const auth = request.headers.get('authorization') || '';
    if (!env.RELAY_TOKEN || !safeEqual(auth, `Bearer ${env.RELAY_TOKEN}`)) {
      return json({ error: '合言葉（アクセストークン）が違います。' }, 401, cors);
    }
    if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
      return json({ error: '中継サーバーにZoomの設定がありません。' }, 500, cors);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/conversations') {
        const from = url.searchParams.get('from') || '';
        const to = url.searchParams.get('to') || '';
        if (!DATE_RE.test(from) || !DATE_RE.test(to)) return json({ error: 'from / to は YYYY-MM-DD で指定してください。' }, 400, cors);
        const r = await zoomGet(env, `/zra/conversations?from=${from}&to=${to}&page_size=30`);
        return json(r.ok ? r.data : { error: 'Zoomから一覧を取得できませんでした。', zoomStatus: r.status, zoom: r.data }, r.ok ? 200 : 502, cors);
      }
      const m = url.pathname.match(/^\/conversations\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!ID_RE.test(id)) return json({ error: 'IDの形式が正しくありません。' }, 400, cors);
        const enc = encodeURIComponent(id);
        const detail = await zoomGet(env, `/zra/conversations/${enc}`);
        if (!detail.ok) return json({ error: 'Zoomから商談の詳細を取得できませんでした。', zoomStatus: detail.status, zoom: detail.data }, 502, cors);
        // 要約は内容分析（smartChapters）に入る。取れなくても、詳細だけ返す
        const analysis = await zoomGet(env, `/zra/conversations/${enc}/content_analysis?analysis_type=smartChapters`);
        return json({
          detail: detail.data,
          analysis: analysis.ok ? analysis.data : null,
          analysisError: analysis.ok ? null : { zoomStatus: analysis.status, zoom: analysis.data },
        }, 200, cors);
      }
      return json({ error: '見つかりません。' }, 404, cors);
    } catch (e) {
      return json({ error: e && e.message ? e.message : '中継サーバーでエラーが起きました。' }, (e && e.status) || 500, cors);
    }
  },
};

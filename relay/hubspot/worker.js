// HubSpot中継サーバー（Cloudflare Workers 用）
// 発注書作成ツール（ブラウザ）は、HubSpotのAPIを直接呼べない(CORS)ため、このWorkerが代わりに呼ぶ。
// HubSpotのトークンは、このWorkerのシークレット（環境変数）にだけ置く。コード・ブラウザ・Gitには置かない。
//
// 環境変数（シークレット）:
//   HUBSPOT_TOKEN  : HubSpotのPrivate Appのアクセストークン（pat-…）
//   RELAY_TOKEN    : ツールが送る合言葉（自分で決めた長いランダム文字列）
//   ALLOWED_ORIGIN : ツールを開くURLの元（例: https://kizunayyamamoto-afk.github.io。末尾の / なし）
//
// 使えるAPI（これ以外は404。HubSpotの任意のAPIを中継することはしない）:
//   GET  /crm/v3/objects/deals/{取引ID}                      … 取引の読み取り
//   GET  /crm/v3/owners/{担当者ID}                           … 取引の担当者（営業）の名前の読み取り
//   GET  /crm/v3/objects/companies/{会社ID}                  … 会社の読み取り
//   GET  /crm/v4/objects/deals/{取引ID}/associations/companies … 取引に紐づく会社のID
//   POST /crm/v3/objects/deals/search                        … 取引を、顧客名で探す（読み取りだけ。検索語・件数・返すプロパティを制限）
//   POST /crm/v3/objects/tickets                              … チケットの新規作成（取引・会社への紐づけつき）
//   POST /crm/v3/objects/notes                                … メモ(ノート)の新規作成（チケット・取引・会社への紐づけつき）

'use strict';

const HUBSPOT_API = 'https://api.hubapi.com';
const ROUTES = [
  { method: 'GET', re: /^\/crm\/v3\/objects\/deals\/\d{1,20}$/ },
  { method: 'GET', re: /^\/crm\/v3\/objects\/companies\/\d{1,20}$/ },
  { method: 'GET', re: /^\/crm\/v3\/owners\/\d{1,20}$/ },
  { method: 'GET', re: /^\/crm\/v4\/objects\/deals\/\d{1,20}\/associations\/companies$/ },
  { method: 'POST', re: /^\/crm\/v3\/objects\/deals\/search$/ },
  { method: 'POST', re: /^\/crm\/v3\/objects\/tickets$/ },
  { method: 'POST', re: /^\/crm\/v3\/objects\/notes$/ },
];
const QUERY_RE = /^[A-Za-z0-9_,=&.%\-]*$/;           // properties=a,b&associations=companies など
const PROP_NAME_RE = /^[a-z][a-z0-9_]{0,99}$/;       // HubSpotのプロパティ内部名
const ALLOWED_ASSOC_TYPES = new Set([26, 28]);       // チケット→会社 / チケット→取引（HubSpot定義）
const NOTE_ASSOC_TYPES = new Set([228, 214, 190]);    // メモ→チケット / メモ→取引 / メモ→会社（HubSpot定義）
const SEARCH_PROPS = new Set(['dealname', 'dealstage', 'pipeline', 'closedate', 'amount', 'hs_lastmodifieddate']);   // 検索で返してよいプロパティ
const MAX_NOTE_BODY = 60000;
const MAX_BODY = 200000;

const json = (body, status, cors) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
});

// 比較にかかる時間を一定にする（合言葉の当てずっぽう対策）
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// チケット作成の本文を検証する（properties と associations だけ。紐づけ先は、取引・会社だけ）
function validateTicketBody(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return '本文の形式が正しくありません。';
  for (const k of Object.keys(b)) if (k !== 'properties' && k !== 'associations') return `許可していない項目です: ${k}`;
  const props = b.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return 'properties がありません。';
  for (const [k, v] of Object.entries(props)) {
    if (!PROP_NAME_RE.test(k)) return `プロパティ名が正しくありません: ${k}`;
    if (typeof v !== 'string') return `プロパティの値は文字列にしてください: ${k}`;
  }
  const assoc = b.associations === undefined ? [] : b.associations;
  if (!Array.isArray(assoc) || assoc.length > 4) return 'associations の形式が正しくありません。';
  for (const a of assoc) {
    if (!a || !a.to || !/^\d{1,20}$/.test(String(a.to.id)) || !Array.isArray(a.types) || a.types.length > 2) return 'associations の形式が正しくありません。';
    for (const t of a.types) {
      if (t.associationCategory !== 'HUBSPOT_DEFINED' || !ALLOWED_ASSOC_TYPES.has(Number(t.associationTypeId))) return '許可していない紐づけの種類です。';
    }
  }
  return '';
}

// メモ作成の本文を検証する（properties は hs_timestamp と hs_note_body だけ。本文は、<br> 以外のタグを許さない）
function validateNoteBody(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return '本文の形式が正しくありません。';
  for (const k of Object.keys(b)) if (k !== 'properties' && k !== 'associations') return `許可していない項目です: ${k}`;
  const props = b.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return 'properties がありません。';
  for (const k of Object.keys(props)) if (k !== 'hs_timestamp' && k !== 'hs_note_body') return `許可していないプロパティです: ${k}`;
  if (typeof props.hs_note_body !== 'string' || !props.hs_note_body || props.hs_note_body.length > MAX_NOTE_BODY) return 'メモの本文が正しくありません。';
  if (/<(?!br\s*\/?>)/i.test(props.hs_note_body)) return 'メモの本文に、使えないタグが含まれています。';
  if (props.hs_timestamp !== undefined && typeof props.hs_timestamp !== 'string' && typeof props.hs_timestamp !== 'number') return 'hs_timestamp の形式が正しくありません。';
  const assoc = b.associations === undefined ? [] : b.associations;
  if (!Array.isArray(assoc) || assoc.length > 3) return 'associations の形式が正しくありません。';
  for (const a of assoc) {
    if (!a || !a.to || !/^\d{1,20}$/.test(String(a.to.id)) || !Array.isArray(a.types) || a.types.length > 1) return 'associations の形式が正しくありません。';
    for (const t of a.types) {
      if (t.associationCategory !== 'HUBSPOT_DEFINED' || !NOTE_ASSOC_TYPES.has(Number(t.associationTypeId))) return '許可していない紐づけの種類です。';
    }
  }
  return '';
}

// 取引の検索の本文を検証する（query・limit・properties だけ。検索語は短い文字列、件数は10件まで）
function validateSearchBody(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return '本文の形式が正しくありません。';
  for (const k of Object.keys(b)) if (k !== 'query' && k !== 'limit' && k !== 'properties') return `許可していない項目です: ${k}`;
  if (typeof b.query !== 'string' || !b.query.trim() || b.query.length > 100 || /[\u0000-\u001f]/.test(b.query)) return '検索語が正しくありません。';
  if (b.limit !== undefined && (!Number.isInteger(b.limit) || b.limit < 1 || b.limit > 10)) return 'limit は1〜10の整数にしてください。';
  if (b.properties !== undefined) {
    if (!Array.isArray(b.properties) || b.properties.length > 10 || !b.properties.every(x => SEARCH_PROPS.has(x))) return '許可していないプロパティです。';
  }
  return '';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const cors = {
      'access-control-allow-origin': allowed && origin === allowed ? allowed : 'null',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const auth = request.headers.get('authorization') || '';
    if (!env.RELAY_TOKEN || !safeEqual(auth, `Bearer ${env.RELAY_TOKEN}`)) {
      return json({ error: '合言葉（アクセストークン）が違います。' }, 401, cors);
    }
    if (!env.HUBSPOT_TOKEN) return json({ error: '中継サーバーにHubSpotのトークンが設定されていません。' }, 500, cors);

    const url = new URL(request.url);
    const route = ROUTES.find(r => r.method === request.method && r.re.test(url.pathname));
    if (!route) return json({ error: '許可していない操作です。' }, 404, cors);
    if (request.method === 'GET' && !QUERY_RE.test(url.search.replace(/^\?/, ''))) return json({ error: 'クエリの形式が正しくありません。' }, 400, cors);

    let body;
    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: '本文が大きすぎます。' }, 413, cors);
      let parsed;
      try { parsed = JSON.parse(text); } catch { return json({ error: '本文がJSONではありません。' }, 400, cors); }
      const bad = url.pathname === '/crm/v3/objects/notes' ? validateNoteBody(parsed)
        : url.pathname === '/crm/v3/objects/deals/search' ? validateSearchBody(parsed)
        : validateTicketBody(parsed);
      if (bad) return json({ error: bad }, 400, cors);
      body = JSON.stringify(parsed);
    }

    try {
      const res = await fetch(HUBSPOT_API + url.pathname + (request.method === 'GET' ? url.search : ''), {
        method: request.method,
        headers: { authorization: `Bearer ${env.HUBSPOT_TOKEN}`, 'content-type': 'application/json' },
        body,
      });
      const text = await res.text();   // HubSpotの応答(状態コード・本文)を、そのまま返す
      return new Response(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json', ...cors } });
    } catch {
      return json({ error: 'HubSpotに接続できませんでした。' }, 502, cors);
    }
  },
};

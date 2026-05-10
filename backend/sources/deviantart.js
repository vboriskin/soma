// DeviantArt — OAuth2 client_credentials, /browse/tags endpoint.
// /browse/popular and /browse/newest are deprecated (404). /browse/tags accepts
// a single tag — выбираем «лучшее» слово, не первое (оно часто служебное).
// Кириллица транслитится в латиницу.

import { pickBestTag } from './_util.js';

const TOKEN_URL = 'https://www.deviantart.com/oauth2/token';
const SEARCH_URL = 'https://www.deviantart.com/api/v1/oauth2/browse/tags';

const tokenStore = { token: null, expires: 0 };

async function getToken() {
  const id = process.env.DA_CLIENT_ID;
  const secret = process.env.DA_SECRET;
  if (!id || !secret) {
    throw new Error('deviantart: DA_CLIENT_ID/DA_SECRET not set');
  }

  if (tokenStore.token && Date.now() < tokenStore.expires - 30_000) {
    return tokenStore.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
  });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`deviantart token ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data.access_token) {
    throw new Error('deviantart token: no access_token in response');
  }
  tokenStore.token = data.access_token;
  tokenStore.expires = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return tokenStore.token;
}

export async function searchDeviantArt(query) {
  const tag = pickBestTag(query);
  if (!tag) return [];

  const token = await getToken();
  const url = `${SEARCH_URL}?tag=${encodeURIComponent(tag)}&limit=24&mature_content=false`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`deviantart ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  const results = Array.isArray(data.results) ? data.results : [];
  const items = [];
  for (const p of results) {
    if (!p?.content?.src) continue;
    const thumb = p.preview?.src || p.thumbs?.[0]?.src || p.content.src;
    items.push({
      url: p.content.src,
      thumb,
      source: 'deviantart',
      author: p.author?.username || 'unknown',
      authorUrl: p.author?.username ? `https://www.deviantart.com/${p.author.username}` : 'https://www.deviantart.com/',
      pageUrl: p.url || '',
      id: 'da-' + (p.deviationid || p.url || Math.random().toString(36).slice(2)),
      title: p.title || '',
      tags: [tag],
      usedTag: tag,
      width: p.content.width || null,
      height: p.content.height || null,
      dateCreated: p.published_time ? Number(p.published_time) * 1000 : null,
      likes: p.stats?.favourites ?? null,
    });
  }
  return items;
}

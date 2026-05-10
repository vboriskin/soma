// Bluesky publicAppView — XRPC search.
// Endpoint: https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q={q}&limit=25
// Auth: не требуется. Но Bluesky в 2026 включили Cloudflare-protection,
// поэтому из some IP-ranges возвращается 403. В таком случае источник
// помечается status:'unavailable' в FEEDS. Юзер может позже подключить
// свою сессию через cookies (TODO).

const FETCH_TIMEOUT_MS = 10000;
const LIMIT = 25;
const BASE = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

function postToItem(post, feed) {
  // post.embed может быть app.bsky.embed.images#view с .images[].fullsize
  const embed = post.embed || {};
  const images = embed.images || (embed.media && embed.media.images) || [];
  const img = Array.isArray(images) ? images[0] : null;
  const url = img && (img.fullsize || img.thumb);
  if (!url) return null;
  const author = post.author || {};
  const record = post.record || {};
  const text = String(record.text || '').trim();
  const handle = author.handle || '';
  const postUrl = post.uri ? `https://bsky.app/profile/${handle}/post/${post.uri.split('/').pop()}` : '';
  return {
    id: `${feed.id}-${post.cid || post.uri}`,
    source: feed.id,
    sourceLabel: feed.label,
    lang: feed.lang || 'en',
    textOnly: false,
    title: text.length > 140 ? text.slice(0, 140) + '…' : text,
    description: text,
    url: postUrl || `https://bsky.app/profile/${handle}`,
    thumb: url,
    publishedAt: record.createdAt || post.indexedAt || null,
    author: author.displayName || handle || 'bluesky',
  };
}

export async function fetchBlueskyFeed(feed) {
  const q = String(feed.query || '').trim();
  if (!q) return [];
  const url = `${BASE}?q=${encodeURIComponent(q)}&limit=${LIMIT}`;
  let r;
  try {
    r = await abortable(signal => fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
    }), FETCH_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`bluesky: ${e.message}`);
  }
  if (!r.ok) throw new Error(`bluesky ${r.status}`);
  const data = await r.json();
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  return posts.map(p => postToItem(p, feed)).filter(Boolean);
}

// Dribbble — public API v2 has no search endpoint, and AWS WAF blocks every
// path under /search/* and /tags/* even with valid session cookies (it's a
// per-route rule that fingerprints TLS as well). The main feed at /shots, on
// the other hand, accepts cookies and returns real shot cards. So we treat
// Dribbble as a curated *feed* — the query is ignored. We rotate through
// pages 1..MAX_PAGE for variety on each call.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCookies, recordStatus } from '../auth/dribbble-cookies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, '..', 'dribbble-token.json');

const FEED_URL = 'https://dribbble.com/shots';
const MAX_PAGE = 6;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function readToken() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.access_token || null;
  } catch (e) {
    return null;
  }
}

// Parse a single shot block out of the feed HTML. Returns null on no match.
// The /shots feed uses srcset entries like "URL?...resize=320x240 320w,
// URL?...resize=400x300 400w, ..." (responsive `<source>` tags). We pick the
// largest variant by width as the full URL and a small one as the thumb.
function parseShot(chunk) {
  const srcset = chunk.match(/srcset="([^"]+)"/i);
  if (!srcset) return null;

  let url = null, thumb = null;
  // Old-style "URL 1x, URL 2x, URL 3x"
  const variants = {};
  for (const part of srcset[1].split(',').map(s => s.trim())) {
    const m = part.match(/^(\S+)\s+([1-3])x$/);
    if (m) variants[m[2]] = m[1];
  }
  if (Object.keys(variants).length) {
    url   = variants['2'] || variants['3'] || variants['1'];
    thumb = variants['1'] || variants['2'] || url;
  } else {
    // New-style "URL 320w, URL 400w, ..."
    const sized = [];
    for (const part of srcset[1].split(',').map(s => s.trim())) {
      const m = part.match(/^(\S+)\s+(\d+)w$/);
      if (m) sized.push({ url: m[1].replace(/&amp;/g, '&'), w: Number(m[2]) });
    }
    if (sized.length) {
      sized.sort((a, b) => a.w - b.w);
      url   = sized[Math.min(sized.length - 1, sized.length - 1)].url; // largest
      thumb = sized.find(s => s.w >= 320)?.url || sized[0].url;
    }
  }
  if (!url) return null;

  // Page link
  const linkM = chunk.match(/href="(\/shots\/[^"#?]+)"/);
  const slug = linkM ? linkM[1] : null;

  // Author username — Dribbble templates vary, try a few patterns
  let username = null, displayName = null;
  const userLink = chunk.match(/href="\/([a-zA-Z0-9._-]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
  if (userLink) { username = userLink[1]; displayName = userLink[2].trim(); }

  // Title (alt or aria-label)
  const titleM = chunk.match(/(?:aria-label|alt)="([^"]+)"/);
  const title = titleM ? titleM[1] : '';

  // Stable id from data-thumbnail-id or path
  const idM = chunk.match(/data-thumbnail-id="(\d+)"/);
  const id = idM ? idM[1] : (slug || ('' + Math.random())).split('/').pop();

  return {
    url,
    thumb,
    source: 'dribbble',
    author: displayName || username || 'dribbble',
    authorUrl: username ? `https://dribbble.com/${username}` : 'https://dribbble.com/',
    pageUrl: slug ? `https://dribbble.com${slug}` : 'https://dribbble.com/',
    id: 'dr-' + id,
    title,
  };
}

// Extract shot-blocks from the page HTML by splitting on `<li ` and keeping
// chunks that look like a shot (contain srcset & a /shots/ link).
function extractShots(html) {
  const items = [];
  const seen = new Set();
  const chunks = html.split(/<li\b/i);
  for (const chunk of chunks) {
    if (!/srcset=/.test(chunk) || !/\/shots\//.test(chunk)) continue;
    const item = parseShot(chunk);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= 30) break;
  }
  return items;
}

// Детерминированный hash query → page index (1..MAX_PAGE).
// Запрос игнорируется fetcher'ом по сути (AWS WAF блочит /search/), но мы
// используем его как seed: разные категории дизайнера (`dashboard`, `landing`,
// `motion`, `ai chat`, …) получают разные slice'ы /shots, не одну ленту.
// Решает аудит-находку #4 «12 категорий = одна Dribbble-лента».
function pageForQuery(query) {
  const s = String(query || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return 1 + (Math.abs(h) % MAX_PAGE);
}

export async function searchDribbble(query) {
  // Page determined by query hash → разные категории видят разные shots
  const page = pageForQuery(query);
  const url = `${FEED_URL}?page=${page}`;
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  };
  const token = readToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const cookies = readCookies();
  if (cookies) headers['Cookie'] = cookies;
  if (!cookies) {
    const msg = 'Dribbble cookies not set. Open SOMA settings → Dribbble.';
    recordStatus(false, msg);
    throw new Error(msg);
  }

  let r, html;
  try {
    r = await fetch(url, { headers });
    html = await r.text();
  } catch (e) {
    const msg = `dribbble fetch failed: ${e.message}`;
    recordStatus(false, msg);
    throw new Error(msg);
  }

  // AWS WAF challenge — body contains "awsWafCookieDomainList" / "gokuProps"
  // and status is 202. We can't pass it without a real browser session.
  if (r.status === 202 || /awsWafCookie|gokuProps/.test(html)) {
    const msg = 'Dribbble blocked the request (AWS WAF). Cookies expired or invalid — refresh them in SOMA settings.';
    recordStatus(false, msg);
    throw new Error(msg);
  }
  if (!r.ok) {
    const msg = `dribbble ${r.status}`;
    recordStatus(false, msg);
    throw new Error(msg);
  }

  try {
    const items = extractShots(html);
    if (!items.length) {
      const msg = 'Dribbble HTML structure changed, please update parser';
      recordStatus(false, msg);
      throw new Error(msg);
    }
    recordStatus(true, null);
    return items;
  } catch (e) {
    const msg = /structure changed|AWS WAF|cookies/i.test(e.message)
      ? e.message
      : 'Dribbble HTML structure changed, please update parser';
    recordStatus(false, msg);
    throw new Error(msg);
  }
}

export function dribbbleHasToken() {
  return !!readToken();
}

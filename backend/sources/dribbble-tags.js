// Dribbble-tags — historically hit `/tags/{tag}`, but AWS WAF blocks every
// /tags/* and /search/* path (independent of cookies). Falls back to the same
// /shots feed as `dribbble.js`, but pages a different range so refills don't
// duplicate. The query is ignored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCookies, recordStatus } from '../auth/dribbble-cookies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, '..', 'dribbble-token.json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function readToken() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).access_token || null; }
  catch (e) { return null; }
}

function parseShot(chunk) {
  const srcset = chunk.match(/srcset="([^"]+)"/i);
  if (!srcset) return null;

  let url = null, thumb = null;
  const variants = {};
  for (const part of srcset[1].split(',').map(s => s.trim())) {
    const m = part.match(/^(\S+)\s+([1-3])x$/);
    if (m) variants[m[2]] = m[1];
  }
  if (Object.keys(variants).length) {
    url   = variants['2'] || variants['3'] || variants['1'];
    thumb = variants['1'] || variants['2'] || url;
  } else {
    const sized = [];
    for (const part of srcset[1].split(',').map(s => s.trim())) {
      const m = part.match(/^(\S+)\s+(\d+)w$/);
      if (m) sized.push({ url: m[1].replace(/&amp;/g, '&'), w: Number(m[2]) });
    }
    if (sized.length) {
      sized.sort((a, b) => a.w - b.w);
      url   = sized[sized.length - 1].url;
      thumb = sized.find(s => s.w >= 320)?.url || sized[0].url;
    }
  }
  if (!url) return null;
  const linkM = chunk.match(/href="(\/shots\/[^"#?]+)"/);
  const slug = linkM ? linkM[1] : null;
  let username = null, displayName = null;
  const userLink = chunk.match(/href="\/([a-zA-Z0-9._-]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
  if (userLink) { username = userLink[1]; displayName = userLink[2].trim(); }
  const titleM = chunk.match(/(?:aria-label|alt)="([^"]+)"/);
  const title = titleM ? titleM[1] : '';
  const idM = chunk.match(/data-thumbnail-id="(\d+)"/);
  const id = idM ? idM[1] : (slug || ('' + Math.random())).split('/').pop();

  return {
    url, thumb,
    source: 'dribbble-tags',
    author: displayName || username || 'dribbble',
    authorUrl: username ? `https://dribbble.com/${username}` : 'https://dribbble.com/',
    pageUrl: slug ? `https://dribbble.com${slug}` : 'https://dribbble.com/',
    id: 'drt-' + id,
    title,
  };
}

// Детерминированный hash query → page (7..12). Парный `dribbble.js`
// использует 1..6 — здесь продолжаем с 7, чтобы при включении обоих
// источников получать дополняющие slice'ы. Аудит-находка #4.
function pageForQuery(query) {
  const s = String(query || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return 7 + (Math.abs(h) % 6);
}

export async function searchDribbbleTags(query) {
  // Page determined by query hash (range 7..12, complementary to dribbble.js).
  const page = pageForQuery(query);
  const url = `https://dribbble.com/shots?page=${page}`;
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
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

  const r = await fetch(url, { headers });
  const html = await r.text();
  if (r.status === 202 || /awsWafCookie|gokuProps/.test(html)) {
    const msg = 'Dribbble blocked the request (AWS WAF). Cookies expired or invalid — refresh them in SOMA settings.';
    recordStatus(false, msg);
    throw new Error(msg);
  }
  if (!r.ok) {
    const msg = `dribbble-tags ${r.status}`;
    recordStatus(false, msg);
    throw new Error(msg);
  }

  const items = [];
  const seen = new Set();
  for (const chunk of html.split(/<li\b/i)) {
    if (!/srcset=/.test(chunk) || !/\/shots\//.test(chunk)) continue;
    const item = parseShot(chunk);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= 30) break;
  }
  if (!items.length) {
    const msg = 'Dribbble HTML structure changed, please update parser';
    recordStatus(false, msg);
    throw new Error(msg);
  }
  recordStatus(true, null);
  return items;
}

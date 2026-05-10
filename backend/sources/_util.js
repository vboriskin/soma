// Shared helpers for source modules.

import { Agent, fetch as undiciFetch } from 'undici';

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// TLS-relax fetch — для серверов с неполной цепочкой сертификатов
// (snob.ru, eyeondesign.aiga.org, doga.no и т.д.). Curl с системным truststore
// видит их нормально, Node 22 fetch — нет (UNABLE_TO_VERIFY_LEAF_SIGNATURE).
// Только для read-only RSS — никаких credentials через эти запросы не идёт.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export async function fetchInsecure(url, init = {}) {
  return undiciFetch(url, { ...init, dispatcher: insecureAgent });
}

// Wayback Machine fallback. Когда исходный URL отдаёт 404/403/DNS-fail,
// проверяем наличие свежего snapshot'а через `archive.org/wayback/available`.
// Если есть — отдаём его cached HTML/XML. Подходит только для read-only RSS.
//
// Использование:
//   const text = await fetchWithWaybackFallback('https://x/feed', { headers: {...} });
//   // если основной упал, вернёт content из Wayback или null
const WAYBACK_AVAIL = 'https://archive.org/wayback/available';
const WAYBACK_TIMEOUT_MS = 6000;

export async function fetchWithWaybackFallback(originalUrl, init = {}) {
  // 1) Пробуем основной
  try {
    const r = await fetch(originalUrl, init);
    if (r.ok) return await r.text();
  } catch (e) { /* fall through */ }
  // 2) Запрашиваем Wayback availability
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), WAYBACK_TIMEOUT_MS);
    const probe = await fetch(`${WAYBACK_AVAIL}?url=${encodeURIComponent(originalUrl)}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!probe.ok) return null;
    const data = await probe.json();
    const closest = data?.archived_snapshots?.closest;
    if (!closest || closest.status !== '200' || !closest.url) return null;
    // 3) Тянем snapshot
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), WAYBACK_TIMEOUT_MS);
    const r = await fetch(closest.url, { signal: ctrl2.signal, headers: init.headers || {} });
    clearTimeout(t2);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    return null;
  }
}

export async function fetchHtml(url, extraHeaders = {}) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...extraHeaders,
    },
  });
  if (!r.ok) {
    throw new Error(`${new URL(url).hostname} ${r.status}`);
  }
  return r.text();
}

export async function fetchXml(url, extraHeaders = {}) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
      ...extraHeaders,
    },
  });
  if (!r.ok) {
    throw new Error(`${new URL(url).hostname} ${r.status}`);
  }
  return decodeFeedBody(await r.arrayBuffer(), r.headers.get('content-type'));
}

// Decode an RSS/Atom buffer with the right encoding. Most feeds are UTF-8,
// but a few legacy Russian sites still publish CP1251. We sniff the encoding
// from either the Content-Type header or the XML declaration.
export function decodeFeedBody(buffer, contentType = '') {
  const u8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  // First decode as utf-8 to read the XML declaration
  let text;
  try { text = new TextDecoder('utf-8', { fatal: false }).decode(u8); }
  catch (e) { text = ''; }
  let enc = '';
  const mDecl = text.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
  if (mDecl) enc = mDecl[1].toLowerCase();
  if (!enc && contentType) {
    const mCt = String(contentType).match(/charset=([^;]+)/i);
    if (mCt) enc = mCt[1].toLowerCase().trim();
  }
  if (/^(windows-1251|cp1251|cp-1251)$/.test(enc)) {
    try { return new TextDecoder('windows-1251').decode(u8); }
    catch (e) { /* fall through to utf-8 */ }
  }
  return text;
}

// Minimal feed parser — handles both RSS 2.0 (`<item>`) and Atom (`<entry>`).
// Returns array of {title, link, description, image, guid, pubDate}.
export function parseRssItems(xml) {
  const items = [];
  // RSS 2.0
  const rssRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = rssRe.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title:       extractTag(block, 'title'),
      link:        extractTag(block, 'link'),
      description: extractTag(block, 'description') || extractTag(block, 'content:encoded'),
      guid:        extractTag(block, 'guid'),
      image:       extractRssImage(block),
      pubDate:     extractTag(block, 'pubDate') || extractTag(block, 'dc:date'),
    });
  }
  if (items.length) return items;

  // Atom — `<entry>`. <link> obычно self-closing с href; <published>/<updated> вместо pubDate.
  const atomRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((m = atomRe.exec(xml)) !== null) {
    const block = m[1];
    // <link rel="alternate" href="..."/> или просто <link href="..."/>
    let link = '';
    const linkAlt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
    const linkAny = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
    link = (linkAlt && linkAlt[1]) || (linkAny && linkAny[1]) || extractTag(block, 'link');
    items.push({
      title:       extractTag(block, 'title'),
      link,
      description: extractTag(block, 'content') || extractTag(block, 'summary'),
      guid:        extractTag(block, 'id'),
      image:       extractRssImage(block),
      pubDate:     extractTag(block, 'published') || extractTag(block, 'updated'),
    });
  }
  return items;
}

function extractTag(block, name) {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  let v = m[1].trim();
  // CDATA wrap
  v = v.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
  return decodeEntities(v);
}

function extractRssImage(block) {
  // Try multiple common shapes: <enclosure url="..."/>, <media:content url="..."/>,
  // <image> tag, or first <img src=> in description HTML.
  const enc = block.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enc) return enc[1];
  const media = block.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i);
  if (media) return media[1];
  const imgInside = block.match(/<image>\s*<url>([^<]+)<\/url>/i) || block.match(/<image>([^<]+)<\/image>/i);
  if (imgInside) return imgInside[1].trim();
  const desc = (block.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '';
  const inDesc = desc.match(/<img[^>]+src="([^"]+)"/i);
  if (inDesc) return inDesc[1];
  return '';
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
export function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-zA-Z]+;/g, m => ENT[m] || m);
}

// Strip HTML tags (used to clean RSS descriptions).
export function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, '').trim());
}

// Pull first <img src> from an HTML chunk; tolerant of both quote styles.
export function firstImgSrc(html) {
  const m = String(html || '').match(/<img[^>]+src=(?:"([^"]+)"|'([^']+)')/i);
  return m ? (m[1] || m[2]) : '';
}

// Tag-only sources (Tumblr, DeviantArt, Safebooru) — выбираем «лучшее» слово
// для тега. Раньше брали первое (в `still life reference` это был `still`),
// что часто давало широкую и нерелевантную выдачу. Теперь:
// 1) дропаем стоп-слова (en + ru),
// 2) транслитим кириллицу (источники не индексируют русский),
// 3) выбираем самое длинное слово из оставшихся (≈ самое содержательное).
const STOP_WORDS = new Set([
  // EN
  'the','a','an','of','for','with','and','or','to','in','on','at','by','is',
  'as','from','this','that','these','those','my','your','his','her','their',
  'be','been','being','was','were','it','its','it\'s','do','does','did','done',
  'reference','ref','image','photo','picture','art','draw','drawing','study',
  // RU
  'и','в','на','с','со','от','до','для','по','о','об','а','но','или','к','у',
  'я','ты','он','она','мы','вы','они','этот','эта','это','тот','та','то',
  'арт','рисунок','фото','картинка','референс','реф','изображение','очень','этого',
]);

const TRANSLIT_MAP = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};

export function transliterate(s) {
  return String(s || '')
    .toLowerCase()
    .split('')
    .map(ch => TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch)
    .join('');
}

// Возвращает наилучший одиночный тег (lowercase, [a-z0-9]) из запроса.
// Пустая строка — если не нашлось ни одного.
export function pickBestTag(query) {
  const text = transliterate(String(query || ''));
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w && !STOP_WORDS.has(w));
  if (!words.length) return '';
  // Самое длинное → если их несколько одинаковой длины — первое.
  return words.sort((a, b) => b.length - a.length)[0];
}

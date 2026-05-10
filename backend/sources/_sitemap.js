// Sitemap-driven feed — для сайтов без RSS, но со стандартным /sitemap.xml.
// Парсим <url><loc/><lastmod/></url>, сортируем по lastmod desc, берём top N,
// для каждого URL дёргаем og:image (через fetchOgImage). Дроп страниц без og.
//
// Поддерживает sitemapindex (когда корневой sitemap — это список вложенных).
// Берём первый вложенный (обычно «posts/articles»), и парсим уже его.
//
// Источник в FEEDS:
//   { id, label, lang, modes, kind: 'sitemap', url: '<sitemap.xml URL>',
//     pageHostFilter?: 'readcereal.com' (опц., чтобы выкинуть foreign URLs),
//     pathFilter?: /^\/articles\// (опц.) }

import { BROWSER_UA } from './_util.js';

const FETCH_TIMEOUT_MS = 12000;
const TOP_LIMIT = 30;
const OG_TIMEOUT_MS = 5000;

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

async function fetchSitemap(url) {
  const r = await abortable(signal => fetch(url, {
    signal,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/xml, text/xml, */*',
    },
    redirect: 'follow',
  }), FETCH_TIMEOUT_MS);
  if (!r.ok) throw new Error(`sitemap ${r.status}`);
  return r.text();
}

// Если корень — sitemapindex, разворачиваем в первый вложенный.
async function resolveActualSitemap(rootXml, rootUrl) {
  if (!/<sitemapindex/i.test(rootXml)) return rootXml;
  const m = rootXml.match(/<sitemap>\s*<loc>([^<]+)<\/loc>/i);
  if (!m) return rootXml;
  return fetchSitemap(m[1]);
}

function parseUrls(xml) {
  const out = [];
  const re = /<url>([\s\S]*?)<\/url>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const loc = (block.match(/<loc>([^<]+)<\/loc>/i) || [])[1];
    if (!loc) continue;
    const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/i) || [])[1] || null;
    out.push({ loc: loc.trim(), lastmod });
  }
  return out;
}

const META_OG     = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i;
const META_OG_REV = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i;
const META_TW     = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i;
const META_TITLE  = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i;
const META_DESC   = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i;

async function fetchPageMeta(url) {
  try {
    const r = await abortable(signal => fetch(url, {
      signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      redirect: 'follow',
    }), OG_TIMEOUT_MS);
    if (!r.ok) return null;
    const html = await r.text();
    const og = (html.match(META_OG) || html.match(META_OG_REV) || html.match(META_TW) || [])[1];
    if (!og) return null;
    const title = (html.match(META_TITLE) || [])[1] || '';
    const desc  = (html.match(META_DESC)  || [])[1] || '';
    return { og, title, desc };
  } catch (e) {
    return null;
  }
}

export async function fetchSitemapFeed(feed) {
  let xml;
  try { xml = await fetchSitemap(feed.url); }
  catch (e) { throw new Error(`sitemap ${feed.id}: ${e.message}`); }
  xml = await resolveActualSitemap(xml, feed.url);
  let urls = parseUrls(xml);
  // Опциональные фильтры
  if (feed.pageHostFilter) {
    urls = urls.filter(u => u.loc.includes(feed.pageHostFilter));
  }
  if (feed.pathFilter instanceof RegExp) {
    urls = urls.filter(u => feed.pathFilter.test(new URL(u.loc).pathname));
  } else if (typeof feed.pathFilter === 'string') {
    urls = urls.filter(u => u.loc.includes(feed.pathFilter));
  }
  // Сортируем по lastmod desc, у кого нет lastmod — в конец
  urls.sort((a, b) => {
    const at = a.lastmod ? Date.parse(a.lastmod) : 0;
    const bt = b.lastmod ? Date.parse(b.lastmod) : 0;
    return bt - at;
  });
  // Берём top N — иначе мы залипнем на тысячах страниц
  urls = urls.slice(0, TOP_LIMIT);
  // Параллельно дёргаем og:image; страницы без og — дропаем
  const enriched = await Promise.allSettled(urls.map(async u => {
    const meta = await fetchPageMeta(u.loc);
    if (!meta) return null;
    return {
      id: `${feed.id}-${Buffer.from(u.loc).toString('base64').slice(0, 32)}`,
      source: feed.id,
      sourceLabel: feed.label,
      lang: feed.lang || 'en',
      title: meta.title,
      description: meta.desc,
      url: u.loc,
      thumb: meta.og,
      publishedAt: u.lastmod || null,
      author: feed.label,
    };
  }));
  return enriched
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

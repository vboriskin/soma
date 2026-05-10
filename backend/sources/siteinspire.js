// Site Inspire — RSS feed for the curated showcase. Query is ignored;
// returns the latest hand-picked sites.

import { fetchXml, parseRssItems, stripTags, firstImgSrc } from './_util.js';

const RSS_URL = 'https://www.siteinspire.com/showcase.rss';

export async function searchSiteInspireRss(_query) {
  const xml = await fetchXml(RSS_URL);
  const items = parseRssItems(xml);
  const out = [];
  for (const it of items) {
    const img = it.image || firstImgSrc(it.description);
    if (!img) continue;
    const id = (it.guid || it.link || '').replace(/[^a-z0-9]/gi, '').slice(-32) || Math.random().toString(36).slice(2);
    out.push({
      url: img,
      thumb: img,
      source: 'siteinspire',
      author: 'siteinspire · showcase',
      authorUrl: 'https://www.siteinspire.com/',
      pageUrl: it.link || 'https://www.siteinspire.com/',
      id: 'si-' + id,
      title: it.title || '',
      description: stripTags(it.description).slice(0, 300),
      dateCreated: it.pubDate || null,
    });
  }
  return out;
}

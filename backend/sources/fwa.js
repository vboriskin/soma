// FWA — RSS for The FWA winners feed. Query is ignored; returns the latest awards.

import { fetchXml, parseRssItems, stripTags, firstImgSrc } from './_util.js';

const RSS_URL = 'https://thefwa.com/rss';

export async function searchFwaRss(_query) {
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
      source: 'fwa',
      author: 'fwa · award winners',
      authorUrl: 'https://thefwa.com/',
      pageUrl: it.link || 'https://thefwa.com/',
      id: 'fwa-' + id,
      title: it.title || '',
      description: stripTags(it.description).slice(0, 300),
      dateCreated: it.pubDate || null,
    });
  }
  return out;
}

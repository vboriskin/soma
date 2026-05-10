// Awwwards — Site Of The Day RSS. Free-text query is ignored: this is a
// curated feed of the latest SOTD entries.

import { fetchXml, parseRssItems, stripTags, firstImgSrc } from './_util.js';

// /feed redirects (301) to the live SOTD RSS — fetch follows by default.
const RSS_URL = 'https://www.awwwards.com/feed';

export async function searchAwwwardsRss(_query) {
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
      source: 'awwwards-rss',
      author: 'awwwards · site of the day',
      authorUrl: 'https://www.awwwards.com/',
      pageUrl: it.link || 'https://www.awwwards.com/',
      id: 'awd-' + id,
      title: it.title || '',
      description: stripTags(it.description).slice(0, 300),
      dateCreated: it.pubDate || null,
    });
  }
  return out;
}

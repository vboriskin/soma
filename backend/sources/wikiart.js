// WikiArt — unofficial JSON search endpoint, no key required.
// Docs (community-maintained): https://www.wikiart.org/en/App/Painting/PaintingsByArtistsCategoriesPaintingsList

const BASE = 'https://www.wikiart.org/en/api/2/PaintingSearch';

export async function searchWikiart(query) {
  const url = `${BASE}?term=${encodeURIComponent(query)}&imageFormat=Large`;
  const r = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Soma-Reference/1.0',
    },
  });
  if (!r.ok) throw new Error(`wikiart ${r.status}`);
  const data = await r.json();
  const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  const items = [];
  for (const p of list) {
    const url = p.image || p.imageUrl;
    if (!url) continue;
    const id = p.id || p.contentId || p.url || Math.random().toString(36).slice(2);
    const slug = p.url || p.urlSlug || '';
    const author = p.artistName || p.artist || 'WikiArt';
    items.push({
      url,
      thumb: url,
      source: 'wikiart',
      author,
      authorUrl: p.artistUrl ? `https://www.wikiart.org/en/${p.artistUrl}` : 'https://www.wikiart.org/',
      pageUrl: slug ? `https://www.wikiart.org/en/${slug}` : 'https://www.wikiart.org/',
      id: 'wa-' + id,
      title: p.title || '',
      period: p.completitionYear ? String(p.completitionYear) : (p.yearAsString || null),
    });
  }
  return items;
}

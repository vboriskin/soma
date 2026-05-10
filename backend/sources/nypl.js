// New York Public Library — Digital Collections API.
// Auth: Authorization: Token token="..."
// Docs: https://api.repo.nypl.org/
// 2026-05-09: NYPL мигрировали на HTTPS — старый http:// отдаёт 301
// Moved Permanently без редиректа на https (curl-у с -L норм, fetch — нет).

const BASE = 'https://api.repo.nypl.org/api/v2/items/search';

export async function searchNypl(query) {
  const token = process.env.NYPL_TOKEN;
  if (!token) throw new Error('nypl: NYPL_TOKEN not set');

  const url = `${BASE}?q=${encodeURIComponent(query)}&per_page=30`;
  const r = await fetch(url, {
    headers: {
      'Authorization': `Token token="${token}"`,
      'Accept': 'application/json',
      'User-Agent': 'Soma-Reference/1.0',
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`nypl ${r.status}: ${text.slice(0, 160)}`);
  }
  const data = await r.json();
  const results = data?.nyplAPI?.response?.result || [];
  const items = [];
  for (const p of results) {
    const uuid = p.uuid;
    if (!uuid) continue;
    // NYPL's image proxy: //images.nypl.org/index.php?id=...&t=w
    const imgId = p.imageID || p.imageId || (Array.isArray(p.imageIDs) ? p.imageIDs[0] : null);
    if (!imgId) continue;
    const url = `https://images.nypl.org/index.php?id=${imgId}&t=w`;
    const thumb = `https://images.nypl.org/index.php?id=${imgId}&t=t`;
    items.push({
      url,
      thumb,
      source: 'nypl',
      author: p.creatorLiteral || (Array.isArray(p.contributor) ? p.contributor[0] : '') || 'NYPL Digital Collections',
      authorUrl: 'https://digitalcollections.nypl.org/',
      pageUrl: `https://digitalcollections.nypl.org/items/${uuid}`,
      id: 'nypl-' + uuid,
      title: typeof p.title === 'string' ? p.title : (Array.isArray(p.title) ? p.title[0] : ''),
      period: p.dateString || p.dateIssued || null,
      license: 'Public Domain / NYPL',
    });
  }
  return items;
}

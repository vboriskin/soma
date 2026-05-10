// OpenSea — collections endpoint with X-API-KEY.
// v2 API has no full-text search for collections; we pull a popular list and
// optionally filter by query terms client-side.

const BASE = 'https://api.opensea.io/api/v2/collections';

export async function searchOpenSea(query) {
  const key = process.env.OPENSEA_KEY;
  if (!key) throw new Error('opensea: OPENSEA_KEY not set');

  const params = new URLSearchParams({
    chain: 'ethereum',
    order_by: 'market_cap',
    limit: '50',
  });
  const r = await fetch(`${BASE}?${params}`, {
    headers: {
      'X-API-KEY': key,
      'Accept': 'application/json',
      'User-Agent': 'Soma-Reference/1.0',
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`opensea ${r.status}: ${text.slice(0, 160)}`);
  }
  const data = await r.json();
  const collections = Array.isArray(data?.collections) ? data.collections : [];
  const q = query.toLowerCase().trim();
  // Если есть запрос — отдаём ТОЛЬКО совпадения по имени/описанию. Иначе
  // источник на любой фразе сваливался в топ-50 NFT по капитализации
  // (Bored Apes, CryptoPunks) и выглядел как «нерелевантная выдача».
  const list = q
    ? collections.filter(c => (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
    : collections;
  return list.slice(0, 30).filter(c => c.image_url || c.banner_image_url).map(c => ({
    url: c.banner_image_url || c.image_url,
    thumb: c.image_url || c.banner_image_url,
    source: 'opensea',
    author: c.owner || c.name || 'OpenSea',
    authorUrl: c.collection ? `https://opensea.io/collection/${c.collection}` : 'https://opensea.io/',
    pageUrl: c.collection ? `https://opensea.io/collection/${c.collection}` : 'https://opensea.io/',
    id: 'os-' + (c.collection || c.name || Math.random().toString(36).slice(2)),
    title: c.name || '',
    description: c.description || '',
  }));
}

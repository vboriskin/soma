// ArtStation — undocumented public JSON endpoint. No auth, but needs UA.
// /api/v2/search/projects.json gives only `smaller_square_cover_url` (square
// thumbnail). Larger CDN variants (large/medium) return 403 from CloudFront —
// hot-link protection. We use the square thumb for both url and thumb; full
// image lives at pageUrl.

const BASE = 'https://www.artstation.com/api/v2/search/projects.json';

export async function searchArtStation(query) {
  const url = `${BASE}?query=${encodeURIComponent(query)}&page=1&per_page=30`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Soma-Reference/1.0',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`artstation ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  const results = Array.isArray(data.data) ? data.data : (Array.isArray(data.results) ? data.results : []);
  const items = [];
  for (const p of results) {
    const thumb = p.smaller_square_cover_url
      || p.cover?.thumb_url
      || p.cover?.medium_image_url;
    if (!thumb) continue;
    const username = p.user?.username || '';
    items.push({
      url: thumb,
      thumb,
      source: 'artstation',
      author: p.user?.full_name || username || 'unknown',
      authorUrl: username ? `https://www.artstation.com/${username}` : 'https://www.artstation.com/',
      pageUrl: p.url || (p.hash_id ? `https://www.artstation.com/artwork/${p.hash_id}` : ''),
      id: 'as-' + (p.hash_id || p.id || Math.random().toString(36).slice(2)),
      title: p.title || '',
      likes: typeof p.likes_count === 'number' ? p.likes_count : null,
      views: typeof p.views_count === 'number' ? p.views_count : null,
    });
  }
  return items;
}

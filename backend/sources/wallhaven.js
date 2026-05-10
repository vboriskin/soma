// Wallhaven — public JSON API (no key required for SFW search).
// Раньше дёргали из браузера, но Wallhaven блокирует cross-origin fetch
// без allow-origin ответа — поэтому теперь идём через бэкенд-прокси.
// Docs: https://wallhaven.cc/help/api

const BASE = 'https://wallhaven.cc/api/v1/search';

async function _whQuery(qExpr, sorting = 'relevance') {
  const params = new URLSearchParams({
    q: qExpr,
    categories: '111',  // general + anime + people
    purity: '100',      // SFW only
    sorting,
  });
  const r = await fetch(`${BASE}?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`wallhaven ${r.status}: ${text.slice(0, 160)}`);
  }
  const data = await r.json();
  return Array.isArray(data?.data) ? data.data : [];
}

export async function searchWallhaven(query) {
  const trimmed = (query || '').trim();
  // 1-я попытка: точный relevance-search.
  let list = await _whQuery(trimmed, 'relevance');
  // 2-я попытка: если <5 results и multi-word — повторяем без AND-связки,
  // используя самое длинное слово. Wallhaven query parser использует
  // implicit AND, что часто даёт пусто на двух слабо-связанных словах.
  if (list.length < 5 && trimmed.includes(' ')) {
    const words = trimmed.split(/\s+/).filter(w => w.length >= 4);
    if (words.length) {
      const longest = words.sort((a, b) => b.length - a.length)[0];
      const more = await _whQuery(longest, 'toplist');
      // Объединяем без дублей.
      const seen = new Set(list.map(p => p.id));
      for (const p of more) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        list.push(p);
        if (list.length >= 24) break;
      }
    }
  }
  return list.map(p => ({
    url: p.path,
    thumb: p.thumbs?.original || p.thumbs?.large || p.path,
    source: 'wallhaven',
    author: 'wallhaven',
    authorUrl: p.url,
    pageUrl: p.url,
    id: 'wallhaven-' + p.id,
    width: p.dimension_x || null,
    height: p.dimension_y || null,
    palette: Array.isArray(p.colors) ? p.colors.slice(0, 5) : null,
    category: p.category || null,
    views: typeof p.views === 'number' ? p.views : null,
  }));
}

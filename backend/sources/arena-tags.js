// Are.na tags — alternative search angle: hit /v2/search/channels and pull a
// preview of the most recent contents from the top channels. Curators tend to
// group content by theme, so this often surfaces sharper picks than the
// generic search.

const SEARCH_URL = 'https://api.are.na/v2/search/channels';
const CHANNEL_URL = 'https://api.are.na/v2/channels';

const TOP_CHANNELS = 4;
const PER_CHANNEL = 15;

function authParam() {
  const t = process.env.ARENA_TOKEN;
  return t ? `&access_token=${encodeURIComponent(t)}` : '';
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Soma-Reference/1.0', Accept: 'application/json' },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`arena-tags ${r.status}: ${text.slice(0, 160)}`);
  }
  return r.json();
}

function blockToItem(b) {
  if (b?.class !== 'Image' || !b.image) return null;
  const url = b.image.original?.url || b.image.large?.url;
  if (!url) return null;
  const thumb = b.image.thumb?.url || b.image.square?.url || url;
  const slug = b.user?.slug || '';
  return {
    url, thumb,
    source: 'arena-tags',
    author: b.user?.full_name || slug || 'unknown',
    authorUrl: slug ? `https://www.are.na/${slug}` : 'https://www.are.na/',
    pageUrl: `https://www.are.na/block/${b.id}`,
    id: 'art-' + b.id,
    title: b.title || '',
    description: typeof b.description === 'string' ? b.description : '',
  };
}

export async function searchArenaTags(query) {
  const auth = authParam();
  const data = await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}&per=10${auth}`);
  const channels = (Array.isArray(data.channels) ? data.channels : []).slice(0, TOP_CHANNELS);
  if (!channels.length) return [];

  const results = await Promise.all(
    channels.map(c =>
      fetchJson(`${CHANNEL_URL}/${encodeURIComponent(c.slug)}/contents?per=${PER_CHANNEL}&direction=desc${auth}`)
        .then(d => Array.isArray(d.contents) ? d.contents : [])
        .catch(() => [])
    )
  );

  const seen = new Set();
  const items = [];
  for (const contents of results) {
    for (const b of contents) {
      const item = blockToItem(b);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  // Пост-фильтр: оставляем блоки, у которых title/description содержит слова
  // запроса. Без этого канал «morning» тащил кофе/горы вместе с релевантным.
  const words = String(query || '').toLowerCase()
    .split(/\s+/).map(w => w.trim()).filter(w => w.length >= 3);
  if (!words.length) return items;
  const matched = items.filter(it => {
    const hay = `${it.title || ''} ${it.description || ''}`.toLowerCase();
    return words.some(w => hay.includes(w));
  });
  return matched.length ? matched : items;
}

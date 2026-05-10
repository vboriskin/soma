// Are.na — channel-based search.
// /v2/search/blocks is blocked by Cloudflare (v2 API is being deprecated).
// Workaround: /v2/search returns matching channels (curated collections),
// then we pull recent image blocks from the top channels.

const SEARCH_URL = 'https://api.are.na/v2/search';
const CHANNEL_URL = 'https://api.are.na/v2/channels';

const TOP_CHANNELS = 3;
const PER_CHANNEL = 20;

const UA = 'Mozilla/5.0 Soma-Reference/1.0';

function authParam() {
  const t = process.env.ARENA_TOKEN;
  return t ? `&access_token=${encodeURIComponent(t)}` : '';
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`arena ${r.status}: ${text.slice(0, 160)}`);
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
    url,
    thumb,
    source: 'arena',
    author: b.user?.full_name || slug || 'unknown',
    authorId: slug || null,
    authorUrl: slug ? `https://www.are.na/${slug}` : 'https://www.are.na/',
    pageUrl: `https://www.are.na/block/${b.id}`,
    id: 'ar-' + b.id,
    title: b.title || '',
    description: typeof b.description === 'string' ? b.description : '',
    width: b.image?.original?.width || null,
    height: b.image?.original?.height || null,
    dateCreated: b.created_at || null,
  };
}

// Пост-фильтр: ищем совпадение каждого слова запроса в полях блока. Канал
// «morning» содержит и кофе, и серфинг, и горы — без фильтра вся каша
// прилетала к юзеру. Если после фильтрации пусто — возвращаем все (лучше
// что-то релевантное по каналу, чем пустота).
function filterBlocksByQuery(items, query) {
  const words = String(query || '').toLowerCase()
    .split(/\s+/).map(w => w.trim()).filter(w => w.length >= 3);
  if (!words.length) return items;
  const matched = items.filter(it => {
    const hay = `${it.title || ''} ${it.description || ''}`.toLowerCase();
    return words.some(w => hay.includes(w));
  });
  return matched.length ? matched : items;
}

export async function searchArena(query) {
  const auth = authParam();
  const searchData = await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}&per=10${auth}`);
  const channels = (Array.isArray(searchData.channels) ? searchData.channels : []).slice(0, TOP_CHANNELS);
  if (!channels.length) return [];

  const results = await Promise.all(
    channels.map(c =>
      fetchJson(`${CHANNEL_URL}/${encodeURIComponent(c.slug)}/contents?per=${PER_CHANNEL}&direction=desc${auth}`)
        .then(d => (Array.isArray(d.contents) ? d.contents : []))
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
  return filterBlocksByQuery(items, query);
}

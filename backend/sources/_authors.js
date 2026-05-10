// Reverse search — «ещё от автора». Унифицированный entry-point по
// authorId/source. Каждый источник реализует свою функцию fetchAuthor.
// Кэш на 1 час (работы автора редко меняются).

const TTL_MS = 60 * 60 * 1000;
const _cache = new Map(); // `${source}:${authorId}` → { items, at }

const FETCH_TIMEOUT_MS = 8000;
function abortable(promise, ms) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    promise(ctrl.signal).then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

// ----- Unsplash: /users/{username}/photos -----
async function fetchUnsplashAuthor(username) {
  const key = process.env.UNSPLASH_KEY || ''; // ключ задаётся в .env (опционально)
  if (!key) {
    // Если нет server-side ключа, фронт-side ключ не уходит на бэк —
    // альтернативно делаем public profile JSON через unsplash.com/napi.
    const r = await abortable(s => fetch(
      `https://unsplash.com/napi/users/${encodeURIComponent(username)}/photos?per_page=30`,
      { signal: s, headers: { Accept: 'application/json', 'User-Agent': 'SOMA/1.0' } }
    ), FETCH_TIMEOUT_MS);
    if (!r.ok) throw new Error(`unsplash author ${r.status}`);
    const arr = await r.json();
    return (Array.isArray(arr) ? arr : []).map(p => ({
      url: p.urls?.full || p.urls?.regular,
      thumb: p.urls?.regular || p.urls?.small,
      source: 'unsplash',
      author: p.user?.name || username, authorId: username,
      authorUrl: `https://unsplash.com/@${username}`,
      pageUrl: p.links?.html || `https://unsplash.com/photos/${p.id}`,
      id: 'unsplash-' + p.id,
      title: p.description || p.alt_description || '',
      width: p.width, height: p.height,
    })).filter(i => i.url);
  }
  const r = await abortable(s => fetch(
    `https://api.unsplash.com/users/${encodeURIComponent(username)}/photos?per_page=30&client_id=${encodeURIComponent(key)}`,
    { signal: s, headers: { Accept: 'application/json' } }
  ), FETCH_TIMEOUT_MS);
  if (!r.ok) throw new Error(`unsplash author ${r.status}`);
  const arr = await r.json();
  return (Array.isArray(arr) ? arr : []).map(p => ({
    url: p.urls?.full || p.urls?.regular,
    thumb: p.urls?.regular || p.urls?.small,
    source: 'unsplash',
    author: p.user?.name || username, authorId: username,
    authorUrl: `https://unsplash.com/@${username}`,
    pageUrl: p.links?.html, id: 'unsplash-' + p.id,
    title: p.description || p.alt_description || '',
    width: p.width, height: p.height,
  })).filter(i => i.url);
}

// ----- Are.na: /users/{slug}/blocks (image-only) -----
async function fetchArenaAuthor(slug) {
  const token = process.env.ARENA_TOKEN ? `&access_token=${encodeURIComponent(process.env.ARENA_TOKEN)}` : '';
  const r = await abortable(s => fetch(
    `https://api.are.na/v2/users/${encodeURIComponent(slug)}/blocks?per=30&direction=desc${token}`,
    { signal: s, headers: { Accept: 'application/json', 'User-Agent': 'SOMA/1.0' } }
  ), FETCH_TIMEOUT_MS);
  if (!r.ok) throw new Error(`arena author ${r.status}`);
  const data = await r.json();
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  return blocks
    .filter(b => b.class === 'Image' && b.image)
    .map(b => ({
      url: b.image.original?.url || b.image.large?.url,
      thumb: b.image.thumb?.url || b.image.square?.url || b.image.original?.url,
      source: 'arena',
      author: b.user?.full_name || slug, authorId: slug,
      authorUrl: `https://www.are.na/${slug}`,
      pageUrl: `https://www.are.na/block/${b.id}`,
      id: 'ar-' + b.id, title: b.title || '',
      description: typeof b.description === 'string' ? b.description : '',
    })).filter(i => i.url);
}

// ----- Flickr: flickr.people.getPhotos -----
async function fetchFlickrAuthor(ownerId) {
  const key = process.env.FLICKR_KEY || '';
  if (!key) throw new Error('flickr: FLICKR_KEY not set');
  const extras = 'url_l,url_h,url_k,url_o,url_m,owner_name';
  const url = `https://www.flickr.com/services/rest/?method=flickr.people.getPhotos&api_key=${encodeURIComponent(key)}&user_id=${encodeURIComponent(ownerId)}&format=json&nojsoncallback=1&per_page=30&extras=${extras}`;
  const r = await abortable(s => fetch(url, { signal: s, headers: { Accept: 'application/json' } }), FETCH_TIMEOUT_MS);
  if (!r.ok) throw new Error(`flickr author ${r.status}`);
  const data = await r.json();
  if (data.stat !== 'ok') throw new Error(`flickr: ${data.message || 'error'}`);
  const photos = data.photos?.photo || [];
  return photos.filter(p => p.url_l || p.url_m).map(p => ({
    url: p.url_o || p.url_k || p.url_h || p.url_l || p.url_m,
    thumb: p.url_l || p.url_m,
    source: 'flickr',
    author: p.ownername || ownerId, authorId: ownerId,
    authorUrl: `https://www.flickr.com/photos/${p.owner}/`,
    pageUrl: `https://www.flickr.com/photos/${p.owner}/${p.id}/`,
    id: 'flickr-' + p.id, title: p.title || '',
  }));
}

// ----- Tumblr: /v2/blog/{name}/posts (photo type) -----
async function fetchTumblrAuthor(blog) {
  const key = process.env.TUMBLR_KEY || '';
  if (!key) throw new Error('tumblr: TUMBLR_KEY not set');
  const blogName = blog.replace(/\.tumblr\.com.*$/, '');
  const r = await abortable(s => fetch(
    `https://api.tumblr.com/v2/blog/${encodeURIComponent(blogName)}/posts/photo?api_key=${encodeURIComponent(key)}&limit=20`,
    { signal: s, headers: { Accept: 'application/json' } }
  ), FETCH_TIMEOUT_MS);
  if (!r.ok) throw new Error(`tumblr author ${r.status}`);
  const data = await r.json();
  const posts = data.response?.posts || [];
  const items = [];
  for (const post of posts) {
    if (post.type !== 'photo' || !Array.isArray(post.photos)) continue;
    for (const ph of post.photos) {
      const orig = ph.original_size;
      if (!orig?.url) continue;
      items.push({
        url: orig.url, thumb: orig.url,
        source: 'tumblr',
        author: blogName, authorId: blogName,
        authorUrl: `https://${blogName}.tumblr.com/`,
        pageUrl: post.post_url,
        id: `tu-${post.id}-${orig.width}`,
        title: post.summary || '',
      });
    }
  }
  return items;
}

const HANDLERS = {
  unsplash: fetchUnsplashAuthor,
  arena: fetchArenaAuthor,
  flickr: fetchFlickrAuthor,
  tumblr: fetchTumblrAuthor,
};

export async function searchAuthor(source, authorId) {
  const fn = HANDLERS[source];
  if (!fn) throw new Error(`reverse search not supported for ${source}`);
  if (!authorId) throw new Error('authorId required');
  const cacheKey = `${source}:${authorId}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const items = await fn(authorId);
  _cache.set(cacheKey, { items, at: Date.now() });
  return items;
}

export const SUPPORTED_AUTHOR_SOURCES = Object.keys(HANDLERS);

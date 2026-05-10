// WordPress.com Reader REST — агрегатор всех WP.com блогов с конкретным тегом.
// Endpoint: https://public-api.wordpress.com/rest/v1.2/read/tags/{tag}/posts?number=20
// Auth: не требуется для public posts. Один запрос — десятки блогов одним пулом.
//
// Источник в FEEDS: { id, label, lang, modes, kind: 'wp-reader', tag: 'design' }

const FETCH_TIMEOUT_MS = 15000;
const LIMIT = 20;

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

function postToItem(post, feed) {
  // featured_image — прямой URL миниатюры. Если нет — пробуем post_thumbnail.URL.
  const thumb = post.featured_image
    || (post.post_thumbnail && post.post_thumbnail.URL)
    || (Array.isArray(post.attachments) && post.attachments[0] && post.attachments[0].URL)
    || '';
  if (!thumb) return null;
  const text = String(post.excerpt || post.title || '').replace(/<[^>]+>/g, '').trim();
  return {
    id: `${feed.id}-${post.ID}`,
    source: feed.id,
    sourceLabel: feed.label,
    lang: feed.lang || 'en',
    textOnly: false,
    title: post.title ? String(post.title).replace(/<[^>]+>/g, '') : '',
    description: text,
    url: post.URL || post.short_URL || '',
    thumb,
    publishedAt: post.date || null,
    author: (post.author && (post.author.name || post.author.nice_name)) || (post.site_name || 'wordpress'),
  };
}

export async function fetchWpReaderFeed(feed) {
  const tag = String(feed.tag || '').trim();
  if (!tag) return [];
  const url = `https://public-api.wordpress.com/rest/v1.2/read/tags/${encodeURIComponent(tag)}/posts?number=${LIMIT}`;
  let r;
  try {
    r = await abortable(signal => fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
    }), FETCH_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`wp-reader: ${e.message}`);
  }
  if (!r.ok) throw new Error(`wp-reader ${r.status}`);
  const data = await r.json();
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  return posts.map(p => postToItem(p, feed)).filter(Boolean);
}

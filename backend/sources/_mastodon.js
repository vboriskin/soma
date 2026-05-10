// Mastodon / Pixelfed (ActivityPub-compatible) — public timelines / hashtag streams.
// Эндпоинты:
//   /api/v1/timelines/tag/{tag}      — посты с конкретным хэштегом
//   /api/v1/timelines/public         — публичная (federated) лента инстанса
//   /api/v1/timelines/public?local=1 — только локальные посты инстанса
//
// Источник в FEEDS:
//   { id, label, lang, modes, kind: 'mastodon', instance: 'mas.to', tag: 'design' }
//   или { ..., publicTimeline: true, local: true }
//
// Возвращает items в стандартной форме: { id, source, sourceLabel, title, description,
// url, thumb, publishedAt, author, lang? }.

const FETCH_TIMEOUT_MS = 10000;
const LIMIT = 25;

function buildUrl(feed) {
  const base = `https://${feed.instance}/api/v1/timelines`;
  if (feed.tag) {
    return `${base}/tag/${encodeURIComponent(feed.tag)}?limit=${LIMIT}`;
  }
  if (feed.publicTimeline) {
    const local = feed.local ? '&local=true' : '';
    return `${base}/public?limit=${LIMIT}${local}`;
  }
  // Fallback — public federated timeline
  return `${base}/public?limit=${LIMIT}`;
}

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

function statusToItem(status, feed) {
  // Берём первый image из media_attachments. type === 'image' (не video/audio/gifv).
  const media = Array.isArray(status.media_attachments) ? status.media_attachments : [];
  const img = media.find(m => m.type === 'image');
  if (!img) return null; // пост без картинки — для visual-mood приложения дропаем
  const url = img.url || img.preview_url;
  if (!url) return null;
  const account = status.account || {};
  // content приходит как HTML — снимаем теги для краткого description
  const text = String(status.content || '').replace(/<[^>]+>/g, '').trim();
  return {
    id: `${feed.id}-${status.id}`,
    source: feed.id,
    sourceLabel: feed.label,
    lang: feed.lang || 'en',
    textOnly: false,
    title: text.length > 140 ? text.slice(0, 140) + '…' : text,
    description: text,
    url: status.url || `https://${feed.instance}/@${account.acct}/${status.id}`,
    thumb: url,
    publishedAt: status.created_at || null,
    author: account.display_name || account.username || feed.instance,
  };
}

export async function fetchMastodonFeed(feed) {
  const url = buildUrl(feed);
  let r;
  try {
    r = await abortable(signal => fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
    }), FETCH_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`mastodon ${feed.instance}: ${e.message}`);
  }
  if (!r.ok) {
    throw new Error(`mastodon ${feed.instance} ${r.status}`);
  }
  const data = await r.json();
  if (!Array.isArray(data)) return [];
  return data.map(s => statusToItem(s, feed)).filter(Boolean);
}

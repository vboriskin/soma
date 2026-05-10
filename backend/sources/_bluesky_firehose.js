// Bluesky Jetstream firehose subscription. Jetstream — упрощённый websocket
// поверх AT-Protocol firehose, отдаёт JSON (вместо CBOR-encoded репликации).
// Endpoint: wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post
//
// Архитектура:
// - Один long-lived websocket subscription на весь lifetime сервера
// - Lazy init: соединение поднимается при первом запросе фида (kind='bluesky-firehose')
// - In-memory ring buffer на ~500 последних постов с картинками
// - Реконнект при разрыве через 5 сек
// - Фильтры по словам в тексте, источник кладёт `keywords: ['design','typography']`

import WebSocket from 'ws';

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';
const RING_SIZE = 500;
const RECONNECT_MS = 5000;

let ws = null;
let connecting = false;
const ring = []; // массив { id, source, sourceLabel, lang, title, description, url, thumb, publishedAt, author, keywords[] }
let connectError = null;

function pushRing(item) {
  ring.unshift(item);
  if (ring.length > RING_SIZE) ring.length = RING_SIZE;
}

function startSubscription() {
  if (ws || connecting) return;
  connecting = true;
  try {
    ws = new WebSocket(JETSTREAM_URL);
  } catch (e) {
    connecting = false;
    connectError = e.message;
    setTimeout(startSubscription, RECONNECT_MS);
    return;
  }
  ws.on('open', () => {
    connecting = false;
    connectError = null;
    console.log('[bluesky-firehose] connected');
  });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Интересны только commit-events на feed.post
      if (msg.kind !== 'commit') return;
      const commit = msg.commit;
      if (!commit || commit.collection !== 'app.bsky.feed.post' || commit.operation !== 'create') return;
      const record = commit.record;
      if (!record) return;
      // Достаём первое image-embed
      const embed = record.embed || {};
      const images = (embed.images && embed.images) ||
                     (embed.media && embed.media.images) || null;
      if (!Array.isArray(images) || !images.length) return;
      const img = images[0];
      // jetstream даёт image как { image: { ref: { $link }, mimeType }, alt }
      // Чтобы получить реальный URL — собираем cdn-url через did
      const did = msg.did;
      const cidLink = img.image && img.image.ref && img.image.ref['$link'];
      if (!did || !cidLink) return;
      const thumbUrl = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cidLink}@jpeg`;
      const fullUrl  = `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cidLink}@jpeg`;
      const text = String(record.text || '').trim();
      pushRing({
        id: 'bsky-fh-' + commit.cid,
        source: 'bsky-firehose', // override per-source при чтении из ring
        sourceLabel: 'Bluesky · firehose',
        lang: 'en',
        textOnly: false,
        title: text.length > 140 ? text.slice(0, 140) + '…' : text,
        description: text,
        url: `https://bsky.app/profile/${did}/post/${commit.rkey}`,
        thumb: thumbUrl,
        publishedAt: record.createdAt || new Date().toISOString(),
        author: did,
        _text: text.toLowerCase(), // для матчинга keywords
      });
    } catch (e) { /* skip malformed */ }
  });
  ws.on('error', (e) => {
    connectError = e.message;
    console.warn('[bluesky-firehose] error:', e.message);
  });
  ws.on('close', () => {
    console.log('[bluesky-firehose] closed, reconnecting in 5s');
    ws = null;
    connecting = false;
    setTimeout(startSubscription, RECONNECT_MS);
  });
}

// Читаем из ring-buffer'а с фильтром по keywords (массив слов; OR-логика)
export async function fetchBlueskyFirehoseFeed(feed) {
  if (!ws && !connecting) startSubscription();
  const keywords = Array.isArray(feed.keywords)
    ? feed.keywords.map(k => String(k).toLowerCase())
    : [];
  let items = ring;
  if (keywords.length) {
    items = items.filter(it => keywords.some(k => it._text && it._text.includes(k)));
  }
  // Adapter: переписываем source/sourceLabel под конкретный feed
  return items.slice(0, 30).map(it => ({
    ...it,
    source: feed.id,
    sourceLabel: feed.label,
    _text: undefined,
  }));
}

export function shutdownFirehose() {
  if (ws) try { ws.close(); } catch (e) {}
}

export function firehoseStatus() {
  return { connected: !!(ws && ws.readyState === WebSocket.OPEN), buffered: ring.length, error: connectError };
}

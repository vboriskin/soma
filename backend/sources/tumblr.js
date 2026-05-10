// Tumblr — single-tag search via /v2/tagged. Multi-attempt: если первый тэг
// дал 0 photo-posts, пробуем следующий из candidates (по убыванию длины).
// Cyrillic транслитится локально (бывший pickBestTag вынесен сюда).

const BASE = 'https://api.tumblr.com/v2/tagged';

function pickThumb(altSizes, fallback) {
  if (!Array.isArray(altSizes) || !altSizes.length) return fallback;
  let best = null;
  for (const s of altSizes) {
    if (!s?.url || typeof s.width !== 'number') continue;
    if (s.width >= 250 && s.width <= 500) {
      if (!best || s.width > best.width) best = s;
    }
  }
  return best ? best.url : fallback;
}

// Helper — список кандидатов на tag из query, отсортированный по длине desc.
// Используется для multi-attempt: если первый тэг дал 0 photo-постов,
// пробуем второй и т.д.
function _tagCandidates(query) {
  const text = (query || '').toLowerCase();
  // Простой transliterate cyrillic → latin (tumblr теги преимущественно en).
  const TR = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  const STOP = new Set(['the','a','an','of','for','with','and','or','to','in','on','at','by','is','as','from','this','that','reference','ref','image','photo','picture','art','draw','study','и','в','на','с','от','для','по']);
  const words = text.split(/\s+/)
    .map(w => w.split('').map(c => TR[c] !== undefined ? TR[c] : c).join(''))
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w && w.length >= 3 && !STOP.has(w));
  if (!words.length) return [];
  return Array.from(new Set(words)).sort((a, b) => b.length - a.length);
}

async function _tumblrFetch(tag, key) {
  const url = `${BASE}?tag=${encodeURIComponent(tag)}&api_key=${encodeURIComponent(key)}&limit=30`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`tumblr ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  return Array.isArray(data.response) ? data.response : [];
}

export async function searchTumblr(query) {
  const key = process.env.TUMBLR_KEY;
  if (!key) throw new Error('tumblr: TUMBLR_KEY not set');

  // Multi-tag retry: если первый тэг дал 0 photo-posts, пробуем следующий.
  // Tumblr тэги идут раздельно, не через AND. Запрос «interior morning» →
  // pickBestTag = «interior» (8 chars), но если у `interior` 0 photo-постов,
  // пробуем «morning» (7).
  const candidates = _tagCandidates(query);
  if (!candidates.length) return [];

  let posts = [];
  let usedTag = candidates[0];
  for (const tag of candidates.slice(0, 3)) {
    posts = await _tumblrFetch(tag, key).catch(() => []);
    // Считаем сколько photo-posts, не общий count.
    const photoCount = posts.filter(p => p.type === 'photo').length;
    if (photoCount > 0) { usedTag = tag; break; }
  }
  const items = [];
  for (const post of posts) {
    if (post.type !== 'photo' || !Array.isArray(post.photos)) continue;
    const blog = post.blog_name || '';
    const authorUrl = blog ? `https://${blog}.tumblr.com/` : '';
    for (const photo of post.photos) {
      const orig = photo.original_size;
      if (!orig?.url) continue;
      items.push({
        url: orig.url,
        thumb: pickThumb(photo.alt_sizes, orig.url),
        source: 'tumblr',
        author: blog || 'tumblr',
        authorId: blog || null,
        authorUrl,
        pageUrl: post.post_url || authorUrl,
        id: `tu-${post.id}-${orig.width || 0}`,
        title: post.summary || '',
        description: typeof photo.caption === 'string' ? photo.caption.replace(/<[^>]+>/g, '') : '',
        tags: Array.isArray(post.tags) ? post.tags : [],
        width: orig.width || null,
        height: orig.height || null,
        dateCreated: post.timestamp ? post.timestamp * 1000 : null,
        likes: typeof post.note_count === 'number' ? post.note_count : null,
        usedTag,
      });
    }
  }
  return items;
}

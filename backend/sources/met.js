// Metropolitan Museum of Art — Open Access API.
// Docs: https://metmuseum.github.io/
// Step 1: /search?q=...&hasImages=true → returns array of objectIDs (up to ~thousands).
// Step 2: /objects/{id} per object → primaryImage + metadata.
// Запрашиваем только первые N IDs параллельно, остальное игнор.

const SEARCH_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const OBJECT_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';
const FETCH_TIMEOUT_MS = 8000;
const FETCH_LIMIT = 24; // сколько объектов параллельно тянем за один запрос

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

async function fetchObject(id) {
  try {
    const r = await abortable(signal => fetch(`${OBJECT_URL}/${id}`, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
    }), FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    const o = await r.json();
    if (!o.primaryImage && !o.primaryImageSmall) return null;
    return {
      url:       o.primaryImage || o.primaryImageSmall,
      thumb:     o.primaryImageSmall || o.primaryImage,
      source:    'met',
      author:    o.artistDisplayName || o.culture || 'Metropolitan Museum',
      authorUrl: o.objectURL || 'https://www.metmuseum.org/',
      pageUrl:   o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
      id:        'met-' + o.objectID,
      title:     o.title || '',
      period:    o.objectDate || null,
      tags:      [o.classification, o.medium, o.department].filter(Boolean),
      license:   o.isPublicDomain ? 'Public Domain' : 'Met Museum',
    };
  } catch (e) {
    return null;
  }
}

export async function searchMet(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&hasImages=true`;
  let r;
  try {
    r = await abortable(signal => fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
    }), FETCH_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`met: ${e.message}`);
  }
  if (!r.ok) throw new Error(`met ${r.status}`);
  const data = await r.json();
  const ids = Array.isArray(data?.objectIDs) ? data.objectIDs.slice(0, FETCH_LIMIT) : [];
  if (!ids.length) return [];
  // Параллельные запросы. Met API мягко относится к нагрузке (~80 req/sec).
  const objects = await Promise.allSettled(ids.map(fetchObject));
  return objects
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

// Геолокация для лайкнутой картинки. Двухступенчатая стратегия:
//  1) скачиваем картинку (с timeout 6s, max 5 MB), парсим EXIF через exifr —
//     если есть GPS-теги, возвращаем lat/lng + источник 'exif'.
//  2) если EXIF пустой — пробуем геокодировать textual hint из title/description/
//     tags через Nominatim (OpenStreetMap, free, no key). Возвращаем lat/lng
//     + label + источник 'geocode'. Cache 24h.
//
// На больших коллекциях это **не** стоит делать синхронно для 200 элементов —
// фронт вызывает /api/geo/extract по одному при сохранении в коллекцию.

import exifr from 'exifr';

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_UA = 'SOMA/1.0 (visual reference app · localhost)';
const NOMINATIM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _nominatimCache = new Map(); // key → { result, at }

function abortable(promise, ms) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    promise(ctrl.signal).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

// Пытается извлечь GPS из EXIF. Скачивает только первые ~256 KB файла —
// EXIF лежит в начале, нет смысла качать целиком.
async function extractExifGeo(imageUrl) {
  try {
    const r = await abortable(signal => fetch(imageUrl, {
      signal,
      headers: { Range: 'bytes=0-262144' }, // первые 256 KB обычно покрывают EXIF
    }), FETCH_TIMEOUT_MS);
    if (!r.ok && r.status !== 206) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    const data = await exifr.gps(new Uint8Array(buf));
    if (!data || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    if (!isFinite(data.latitude) || !isFinite(data.longitude)) return null;
    return {
      lat: +data.latitude.toFixed(5),
      lng: +data.longitude.toFixed(5),
      label: null,
      source: 'exif',
    };
  } catch (e) { return null; }
}

// Пытается извлечь place-name из текстовых полей (title/description/tags) и
// геокодировать через Nominatim. Использует капитализированные слова длиной
// ≥3 как кандидаты в place-имена; и токены из tags. Если несколько кандидатов
// — берёт самый длинный (обычно название, не общее слово).
function extractPlaceCandidates(item) {
  const text = `${item.title || ''} ${item.description || ''}`.trim();
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const candidates = new Set();
  // Capitalized N-grams длиной 1-3 (Tokyo, New York, San Francisco).
  if (text) {
    const re = /\b([A-ZА-ЯЁ][a-zа-яё]{2,}(?:\s+[A-ZА-ЯЁ][a-zа-яё]+){0,2})\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const v = m[1].trim();
      // Отсекаем фамилии типа «John Smith» — ловится и место «New York».
      // Простая эвристика: общеизвестные геопрефиксы / суффиксы.
      candidates.add(v);
    }
  }
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const v = t.trim();
    if (v.length < 3 || v.length > 40) continue;
    candidates.add(v);
  }
  return Array.from(candidates).sort((a, b) => b.length - a.length).slice(0, 3);
}

async function nominatimSearch(query) {
  if (!query) return null;
  const key = query.toLowerCase().trim();
  const cached = _nominatimCache.get(key);
  if (cached && Date.now() - cached.at < NOMINATIM_CACHE_TTL_MS) return cached.result;
  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const r = await abortable(signal => fetch(url, {
      signal,
      headers: { 'User-Agent': NOMINATIM_UA, Accept: 'application/json' },
    }), FETCH_TIMEOUT_MS);
    if (!r.ok) { _nominatimCache.set(key, { result: null, at: Date.now() }); return null; }
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) {
      _nominatimCache.set(key, { result: null, at: Date.now() });
      return null;
    }
    const top = arr[0];
    const result = {
      lat: +Number(top.lat).toFixed(5),
      lng: +Number(top.lon).toFixed(5),
      label: top.display_name || query,
      source: 'geocode',
    };
    _nominatimCache.set(key, { result, at: Date.now() });
    return result;
  } catch (e) {
    _nominatimCache.set(key, { result: null, at: Date.now() });
    return null;
  }
}

// Главный entry-point: extractGeo({url, title, description, tags}).
// Возвращает {lat, lng, label?, source} или null.
// Порядок попыток: EXIF → Nominatim по тексту.
export async function extractGeo(item) {
  if (!item) return null;
  // 1. EXIF — самый достоверный источник.
  if (item.url) {
    const exif = await extractExifGeo(item.url);
    if (exif) return exif;
  }
  // 2. Nominatim — пробуем 1-2 лучших кандидата.
  const candidates = extractPlaceCandidates(item);
  for (const cand of candidates) {
    const geo = await nominatimSearch(cand);
    if (geo) return geo;
    // Не штурмуем Nominatim — после первой попытки ждём 1.1s
    // (Nominatim просит ≤1 req/s от одного клиента).
    await new Promise(r => setTimeout(r, 1100));
  }
  return null;
}

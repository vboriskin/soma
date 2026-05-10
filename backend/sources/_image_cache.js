// Локальный image cache — opt-in архивирование лайкнутых картинок
// в backend/cache/liked/{md5(url)}.{ext}. Frontend отдельным запросом просит
// архивировать, при показе — fallback с original URL на /api/cache/{md5}.
//
// Функции:
//   saveImage(url) → {hash, path, size, contentType} | null  (если 5MB+ или error)
//   getImagePath(url) → path | null                            (для serving)
//   getStats() → {count, totalBytes}
//
// Не используем Sharp / image processing — просто write-as-is. Меняется
// content-type правильным extension'ом для браузера.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '..', 'cache', 'liked');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 8000;

function ensureDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
}
ensureDir();

function urlHash(url) {
  return crypto.createHash('md5').update(String(url || '')).digest('hex');
}

function extFromContentType(ct, fallback = 'jpg') {
  const c = String(ct || '').toLowerCase();
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
  if (c.includes('png')) return 'png';
  if (c.includes('webp')) return 'webp';
  if (c.includes('gif')) return 'gif';
  if (c.includes('avif')) return 'avif';
  return fallback;
}

// Возвращает путь к закэшированному файлу для данного URL, либо null если нет.
export function getImagePath(url) {
  if (!url) return null;
  const hash = urlHash(url);
  // Перебираем известные расширения.
  for (const ext of ['jpg', 'png', 'webp', 'gif', 'avif']) {
    const full = path.join(CACHE_DIR, `${hash}.${ext}`);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// Скачать и сохранить. Идемпотентно — если уже есть, возвращает existing.
export async function saveImage(url) {
  if (!url) return null;
  const existing = getImagePath(url);
  if (existing) {
    const stat = fs.statSync(existing);
    return {
      hash: urlHash(url),
      path: existing,
      size: stat.size,
      contentType: 'image/' + path.extname(existing).slice(1),
      cached: true,
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const cl = r.headers.get('content-length');
    if (cl && Number(cl) > MAX_BYTES) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    const ext = extFromContentType(ct);
    const hash = urlHash(url);
    const full = path.join(CACHE_DIR, `${hash}.${ext}`);
    fs.writeFileSync(full, buf);
    return { hash, path: full, size: buf.length, contentType: ct, cached: false };
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// Stats для UI.
export function getStats() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    let total = 0;
    for (const f of files) {
      try { total += fs.statSync(path.join(CACHE_DIR, f)).size; } catch (e) {}
    }
    return { count: files.length, totalBytes: total };
  } catch (e) { return { count: 0, totalBytes: 0 }; }
}

// LRU-эвикция при превышении лимита (вызывается вручную с UI). Удаляет
// самые старые файлы (по mtime) до X MB.
export function evict(targetBytes) {
  try {
    const files = fs.readdirSync(CACHE_DIR).map(f => {
      const full = path.join(CACHE_DIR, f);
      const stat = fs.statSync(full);
      return { name: f, full, size: stat.size, mtime: stat.mtimeMs };
    });
    files.sort((a, b) => a.mtime - b.mtime); // oldest first
    let total = files.reduce((s, f) => s + f.size, 0);
    let removed = 0;
    for (const f of files) {
      if (total <= targetBytes) break;
      try { fs.unlinkSync(f.full); } catch (e) {}
      total -= f.size;
      removed++;
    }
    return { removed, totalBytes: total };
  } catch (e) { return { removed: 0, totalBytes: 0 }; }
}

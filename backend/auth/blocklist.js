// Антирейтинг — список «не показывать»: картинки/авторы/источники.
// Файл — `backend/blocklist.json`, gitignored. Структура:
//   { images: [...], authors: [{name, source}], sources: [...] }
// Все три списка независимы — можно скрыть автора у Unsplash, не трогая
// одноимённого автора у Pixabay.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, '..', 'blocklist.json');

function emptyState() {
  return { images: [], authors: [], sources: [] };
}

function readRaw() {
  try {
    if (!fs.existsSync(FILE)) return emptyState();
    const txt = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(txt);
    return {
      images:  Array.isArray(data.images)  ? data.images  : [],
      authors: Array.isArray(data.authors) ? data.authors : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
    };
  } catch (e) { return emptyState(); }
}

function writeRaw(data) {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.warn('[blocklist]', e.message); }
}

// Идентификатор картинки = URL как есть (хеш не нужен, blocklist обычно
// небольшой, простая equality-проверка работает быстро). При желании можно
// перейти на md5(url) для компактности — структура совместима.
function imageKey(url) {
  return String(url || '').trim();
}

function authorKey(name, source) {
  return `${String(name || '').trim().toLowerCase()}|${String(source || '').trim().toLowerCase()}`;
}

export function getList() {
  return readRaw();
}

export function getCounts() {
  const data = readRaw();
  return {
    images:  data.images.length,
    authors: data.authors.length,
    sources: data.sources.length,
    total:   data.images.length + data.authors.length + data.sources.length,
  };
}

export function isBlockedImage(url) {
  if (!url) return false;
  const data = readRaw();
  return data.images.includes(imageKey(url));
}
export function isBlockedAuthor(name, source) {
  if (!name || !source) return false;
  const data = readRaw();
  const key = authorKey(name, source);
  return data.authors.some(a => authorKey(a.name, a.source) === key);
}
export function isBlockedSource(source) {
  if (!source) return false;
  const data = readRaw();
  return data.sources.includes(String(source));
}

// Универсальный фильтр массива items{url,author,source}. Используется в
// fetchAll и /api/search/* для отсечения заблокированного ДО отдачи фронту.
export function filterItems(items) {
  if (!Array.isArray(items) || !items.length) return items || [];
  const data = readRaw();
  if (!data.images.length && !data.authors.length && !data.sources.length) return items;
  const imgSet = new Set(data.images);
  const authorSet = new Set(data.authors.map(a => authorKey(a.name, a.source)));
  const sourceSet = new Set(data.sources);
  return items.filter(it => {
    if (it && sourceSet.has(it.source)) return false;
    if (it && imgSet.has(imageKey(it.url))) return false;
    if (it && imgSet.has(imageKey(it.thumb))) return false;
    if (it && it.author && it.source && authorSet.has(authorKey(it.author, it.source))) return false;
    return true;
  });
}

// Add helpers — идемпотентные (повторное добавление одного значения = no-op).
export function addImage(url) {
  if (!url) throw new Error('url required');
  const data = readRaw();
  const k = imageKey(url);
  if (!data.images.includes(k)) data.images.push(k);
  writeRaw(data);
  return { ok: true, count: data.images.length };
}
export function addAuthor(name, source) {
  if (!name || !source) throw new Error('name and source required');
  const data = readRaw();
  const key = authorKey(name, source);
  if (!data.authors.some(a => authorKey(a.name, a.source) === key)) {
    data.authors.push({ name: String(name).trim(), source: String(source).trim() });
  }
  writeRaw(data);
  return { ok: true, count: data.authors.length };
}
export function addSource(source) {
  if (!source) throw new Error('source required');
  const data = readRaw();
  const k = String(source).trim();
  if (!data.sources.includes(k)) data.sources.push(k);
  writeRaw(data);
  return { ok: true, count: data.sources.length };
}

// Remove helpers — удаляют по точному совпадению.
export function removeImage(url) {
  const data = readRaw();
  const k = imageKey(url);
  const before = data.images.length;
  data.images = data.images.filter(x => x !== k);
  writeRaw(data);
  return { ok: data.images.length < before };
}
export function removeAuthor(name, source) {
  const data = readRaw();
  const key = authorKey(name, source);
  const before = data.authors.length;
  data.authors = data.authors.filter(a => authorKey(a.name, a.source) !== key);
  writeRaw(data);
  return { ok: data.authors.length < before };
}
export function removeSource(source) {
  const data = readRaw();
  const k = String(source).trim();
  const before = data.sources.length;
  data.sources = data.sources.filter(x => x !== k);
  writeRaw(data);
  return { ok: data.sources.length < before };
}

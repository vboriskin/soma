import express, { Router } from 'express';
import { hasCookies as hasDribbbleCookies } from './auth/dribbble-cookies.js';
import { getFeedItems, getFeedSources } from './sources/feed.js';
import { searchDeviantArt } from './sources/deviantart.js';
import { searchArtStation } from './sources/artstation.js';
import { searchTumblr } from './sources/tumblr.js';
import { searchArena } from './sources/arena.js';
import { searchDribbble } from './sources/dribbble.js';
import { searchDribbbleTags } from './sources/dribbble-tags.js';
import { searchArenaTags } from './sources/arena-tags.js';
import { searchWikiart } from './sources/wikiart.js';
import { searchInternetArchive } from './sources/iarchive.js';
import { searchNypl } from './sources/nypl.js';
import { searchOpenSea } from './sources/opensea.js';
import { searchAwwwardsRss } from './sources/awwwards.js';
import { searchSiteInspireRss } from './sources/siteinspire.js';
import { searchFwaRss } from './sources/fwa.js';
import { searchWallhaven } from './sources/wallhaven.js';
import { searchMet } from './sources/met.js';
import {
  isAllowed as cookiesIsAllowed,
  hasCookies as cookiesHas,
  writeCookies as cookiesWrite,
  clearCookies as cookiesClear,
  listSources as cookiesList,
} from './auth/source-cookies.js';
import {
  hasToken as tgHasToken,
  getMe as tgGetMe,
  getUpdates as tgGetUpdates,
  sendMessage as tgSendMessage,
  sendPhoto as tgSendPhoto,
  sendMediaGroup as tgSendMediaGroup,
  buildCaption as tgBuildCaption,
  extractChatsFromUpdates as tgExtractChats,
} from './sources/_telegram.js';
import {
  listTargets as tgListTargets,
  getTarget as tgGetTarget,
  addTarget as tgAddTarget,
  deleteTarget as tgDeleteTarget,
  recordStatus as tgRecordStatus,
  getStatusMap as tgGetStatusMap,
} from './auth/telegram-targets.js';
import {
  searchArtvee,
  searchLandBook,
  searchPinterest,
  searchCosmos,
  searchReadcv,
  searchFigmaCommunity,
  searchMobbin,
  searchRefero,
} from './sources/scrape-pack.js';
import { extractGeo } from './sources/_geo.js';
import { saveImage as cacheSaveImage, getImagePath as cacheGetImagePath, getStats as cacheGetStats, evict as cacheEvict } from './sources/_image_cache.js';
import fs from 'node:fs';
import { searchAuthor, SUPPORTED_AUTHOR_SOURCES } from './sources/_authors.js';
import {
  getList as blocklistGet,
  getCounts as blocklistCounts,
  isBlockedSource as blocklistIsBlockedSource,
  filterItems as blocklistFilter,
  addImage as blocklistAddImage,
  addAuthor as blocklistAddAuthor,
  addSource as blocklistAddSource,
  removeImage as blocklistRemoveImage,
  removeAuthor as blocklistRemoveAuthor,
  removeSource as blocklistRemoveSource,
} from './auth/blocklist.js';

const router = Router();

const TTL_MS = 5 * 60 * 1000;
const NEG_TTL_MS = 5 * 60 * 1000; // remember errors briefly so we don't hammer rate-limited / WAF-blocked sources
const cache = new Map();
const negCache = new Map();

const handlers = {
  deviantart: searchDeviantArt,
  artstation: searchArtStation,
  tumblr: searchTumblr,
  arena: searchArena,
  dribbble: searchDribbble,
  'dribbble-tags': searchDribbbleTags,
  'arena-tags': searchArenaTags,
  wikiart: searchWikiart,
  iarchive: searchInternetArchive,
  nypl: searchNypl,
  opensea: searchOpenSea,
  'awwwards-rss': searchAwwwardsRss,
  siteinspire: searchSiteInspireRss,
  fwa: searchFwaRss,
  wallhaven: searchWallhaven,
  met: searchMet,
  artvee: searchArtvee,
  'land-book': searchLandBook,
  pinterest: searchPinterest,
  cosmos: searchCosmos,
  readcv: searchReadcv,
  'figma-community': searchFigmaCommunity,
  mobbin: searchMobbin,
  refero: searchRefero,
};

// Backend metadata for the diagnostics screen. Reports versions and which
// secrets are present — boolean flags only, never values.
router.get('/info', (req, res) => {
  // Capability `bell`: true если юзер зашёл с BELL_KEY (отдельный
  // pro-tier ключ). Фронт скрывает соответствующий режим без него.
  const bellKey = (process.env.BELL_KEY || '').trim();
  const capabilities = {
    bell: !!bellKey && req.alphaKey === bellKey,
  };
  res.json({
    backend: {
      name: 'soma backend',
      version: '1.0.0',
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
    },
    env: {
      DA_CLIENT_ID:           !!process.env.DA_CLIENT_ID,
      DA_SECRET:              !!process.env.DA_SECRET,
      TUMBLR_KEY:             !!process.env.TUMBLR_KEY,
      ARENA_TOKEN:            !!process.env.ARENA_TOKEN,
      DRIBBBLE_CLIENT_ID:     !!process.env.DRIBBBLE_CLIENT_ID,
      DRIBBBLE_CLIENT_SECRET: !!process.env.DRIBBBLE_CLIENT_SECRET,
      DRIBBBLE_COOKIE:        !!(process.env.DRIBBBLE_COOKIE || hasDribbbleCookies()),
      NYPL_TOKEN:             !!process.env.NYPL_TOKEN,
      OPENSEA_KEY:            !!process.env.OPENSEA_KEY,
    },
    capabilities,
  });
});

// Drop cached entries for a single source on demand. Useful from the
// diagnostics screen ("очистить кеш"). Wipes both positive and negative
// caches for that source's prefix.
router.delete('/cache/:source', (req, res) => {
  const prefix = req.params.source + ':';
  let removed = 0;
  for (const key of cache.keys())    if (key.startsWith(prefix)) { cache.delete(key);    removed++; }
  for (const key of negCache.keys()) if (key.startsWith(prefix)) { negCache.delete(key); removed++; }
  res.json({ ok: true, removed });
});

// Per-source cookies для login-walled (Mobbin/Refero/Read.cv/Pinterest).
// GET — список разрешённых источников и их статус.
// POST /:source — записать cookie-строку.
// DELETE /:source — удалить.
router.get('/cookies', (_req, res) => {
  res.json({ sources: cookiesList() });
});
router.post('/cookies/:source', express.text({ type: '*/*', limit: '64kb' }), (req, res) => {
  const id = req.params.source;
  if (!cookiesIsAllowed(id)) return res.status(404).json({ error: 'unknown source' });
  const value = (req.body || '').trim();
  if (!value) return res.status(400).json({ error: 'empty cookie value' });
  try {
    cookiesWrite(id, value);
    res.json({ ok: true, source: id, hasCookies: cookiesHas(id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.delete('/cookies/:source', (req, res) => {
  const id = req.params.source;
  if (!cookiesIsAllowed(id)) return res.status(404).json({ error: 'unknown source' });
  cookiesClear(id);
  res.json({ ok: true });
});

// Метадата feed-источников без подгрузки items. Используется диагностикой
// фронта, чтобы показать live-статус всех ru/en/ja/no источников до того, как
// юзер открыл ленту.
router.get('/feed/sources', (req, res) => {
  const modeParam = String(req.query.mode || '').trim().toLowerCase();
  const mode = (modeParam === 'designer' || modeParam === 'aesthetic') ? modeParam : null;
  res.json({ sources: getFeedSources(mode) });
});

// Aggregated RSS / Reddit feed for the "лента" view
router.get('/feed', async (req, res) => {
  const sourcesParam = String(req.query.sources || '').trim();
  const sources = sourcesParam ? sourcesParam.split(',').map(s => s.trim()).filter(Boolean) : null;
  const langParam = String(req.query.lang || '').trim().toLowerCase();
  const lang = (langParam === 'ru' || langParam === 'en') ? langParam : null;
  const modeParam = String(req.query.mode || '').trim().toLowerCase();
  const mode = (modeParam === 'designer' || modeParam === 'aesthetic') ? modeParam : null;
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    const items = await getFeedItems({ sources, lang, mode, refresh });
    res.json({ items, sources: getFeedSources(mode) });
  } catch (e) {
    console.error('[feed]', e);
    res.status(500).json({ error: e?.message || 'feed error' });
  }
});

// Источники, которые ВООБЩЕ не учитывают запрос (RSS-фиды одной ленты).
// Для них кэш-ключ без query.
//
// Раньше Dribbble и Dribbble-tags тоже были здесь — кэш `_curated` означал,
// что 12 категорий designer-режима получали один и тот же набор шотов
// (см. soma-search-audit-2026-05-09.md, находка #4). Теперь Dribbble
// детерминированно мапит query→page (1-6), и каждая категория получает
// свой slice ленты. Кэш для них — обычный per-query.
const IGNORES_QUERY_SOURCES = new Set([
  'awwwards-rss', 'siteinspire', 'fwa',
]);

router.get('/search/:source', async (req, res) => {
  const { source } = req.params;
  const query = (req.query.q || '').toString().trim();

  // Антирейтинг: если источник целиком в blocklist — не дёргаем API.
  // Возвращаем пустой массив (фронт не покажет «ошибка», просто 0 results).
  if (blocklistIsBlockedSource(source)) {
    return res.json({ items: [], blocked: true });
  }

  const handler = handlers[source];
  if (!handler) {
    return res.status(404).json({ error: `unknown source: ${source}` });
  }
  if (!query) {
    return res.status(400).json({ error: 'missing query parameter q' });
  }

  const cacheKey = IGNORES_QUERY_SOURCES.has(source)
    ? `${source}:_curated`
    : `${source}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    // Применяем blocklist даже к закэшированным результатам — иначе после
    // блокировки автора/картинки они продолжат появляться 5 минут до TTL.
    return res.json({ items: blocklistFilter(hit.items), cached: true });
  }
  const neg = negCache.get(cacheKey);
  if (neg && Date.now() - neg.at < NEG_TTL_MS) {
    return res.status(neg.status || 500).json({ error: neg.message, cached: true });
  }

  try {
    const items = await handler(query);
    cache.set(cacheKey, { items, at: Date.now() });
    negCache.delete(cacheKey);
    res.json({ items: blocklistFilter(items) });
  } catch (e) {
    console.error(`[${source}]`, e);
    const message = e?.message || 'fetch failed';
    negCache.set(cacheKey, { message, status: 500, at: Date.now() });
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// Антирейтинг (blocklist) — что не показывать. Три списка: images / authors /
// sources. Фильтрация применяется в /search/:source выше — заблокированные
// источники не дёргаются, авторы и картинки выбрасываются ДО отдачи фронту.
// ============================================================================

router.get('/blocklist', (_req, res) => {
  res.json({ ...blocklistGet(), counts: blocklistCounts() });
});

router.post('/blocklist/add', express.json(), (req, res) => {
  const { type, value } = req.body || {};
  try {
    if (type === 'image') {
      const r = blocklistAddImage(value);
      return res.json(r);
    }
    if (type === 'author') {
      const r = blocklistAddAuthor(value?.name, value?.source);
      return res.json(r);
    }
    if (type === 'source') {
      const r = blocklistAddSource(value);
      return res.json(r);
    }
    return res.status(400).json({ error: 'type must be image | author | source' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ============================================================================
// Геолокация — POST /geo/extract { url, title, description, tags }.
// Используется фронтом при сохранении в коллекцию: фронт шлёт metadata
// картинки, бэк пытается извлечь lat/lng через EXIF + Nominatim. Не блокирует
// сохранение — фронт делает запрос асинхронно после addLike. Возвращает
// {geo: {lat,lng,label?,source}|null}.
//
// /api/collection/geo — отдельный agg-endpoint бэк не реализует, потому что
// коллекция живёт в localStorage фронта (не в БД). Фронт сам формирует список
// для карты из своих liked-items.
// ============================================================================

// ============================================================================
// Reverse search — «ещё от автора». GET /author/:source/:authorId.
// Возвращает работы автора через source-specific API. Список поддерживаемых
// источников в SUPPORTED_AUTHOR_SOURCES (unsplash, arena, flickr, tumblr).
// Кэш 1h встроен в _authors.js.
// ============================================================================

router.get('/author/supported', (_req, res) => {
  res.json({ sources: SUPPORTED_AUTHOR_SOURCES });
});

router.get('/author/:source/:authorId', async (req, res) => {
  const { source, authorId } = req.params;
  if (!SUPPORTED_AUTHOR_SOURCES.includes(source)) {
    return res.status(404).json({ error: `reverse search not supported for ${source}` });
  }
  try {
    const items = await searchAuthor(source, authorId);
    res.json({ items });
  } catch (e) {
    console.error(`[author ${source}/${authorId}]`, e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// Local image cache — opt-in архивирование лайкнутых картинок.
// POST /cache/save?url=...  — скачать в backend/cache/liked/{hash}.{ext}
// GET  /cache/img?url=...   — отдать закэшированный файл (или 404)
// GET  /cache/stats          — count + size
// POST /cache/evict?bytes=N  — удалить самые старые до N байт
// ============================================================================

router.post('/cache/save', express.json(), async (req, res) => {
  const url = (req.query.url || req.body?.url || '').toString().trim();
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await cacheSaveImage(url);
    if (!result) return res.status(422).json({ error: 'fetch failed or not an image' });
    res.json({ ok: true, hash: result.hash, size: result.size, cached: !!result.cached });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/cache/img', (req, res) => {
  const url = (req.query.url || '').toString().trim();
  if (!url) return res.status(400).send('url required');
  const p = cacheGetImagePath(url);
  if (!p) return res.status(404).send('not cached');
  // Content-type из расширения
  const ext = p.split('.').pop().toLowerCase();
  const ct = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }[ext] || 'image/jpeg';
  res.set('Content-Type', ct).set('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(p).pipe(res);
});

router.get('/cache/stats', (_req, res) => {
  res.json(cacheGetStats());
});

router.post('/cache/evict', express.json(), (req, res) => {
  const target = Number(req.query.bytes || req.body?.bytes || 1024 * 1024 * 1024); // default 1 GB
  res.json(cacheEvict(target));
});

router.post('/geo/extract', express.json(), async (req, res) => {
  const { url, title, description, tags } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const geo = await extractGeo({ url, title, description, tags });
    res.json({ geo });
  } catch (e) {
    console.error('[geo]', e);
    res.status(500).json({ error: e.message, geo: null });
  }
});

router.post('/blocklist/remove', express.json(), (req, res) => {
  const { type, value } = req.body || {};
  try {
    if (type === 'image')  return res.json(blocklistRemoveImage(value));
    if (type === 'author') return res.json(blocklistRemoveAuthor(value?.name, value?.source));
    if (type === 'source') return res.json(blocklistRemoveSource(value));
    return res.status(400).json({ error: 'type must be image | author | source' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ============================================================================
// Telegram integration — отправка картинок из коллекции через Bot API.
// Токен живёт в .env (TELEGRAM_BOT_TOKEN). На фронт отдаём только botUsername
// и hasToken — сам токен никогда наружу.
// ============================================================================

let botInfoCache = null; // { username, ok, lastTested, error }

async function probeBot(force = false) {
  if (!tgHasToken()) {
    botInfoCache = { ok: false, error: 'TELEGRAM_BOT_TOKEN not set in .env' };
    return botInfoCache;
  }
  if (botInfoCache && botInfoCache.ok && !force) return botInfoCache;
  try {
    const me = await tgGetMe();
    botInfoCache = {
      ok: true,
      username: me.username,
      firstName: me.first_name,
      id: me.id,
      lastTested: new Date().toISOString(),
      error: null,
    };
  } catch (e) {
    botInfoCache = {
      ok: false,
      error: e.message || 'invalid token',
      lastTested: new Date().toISOString(),
    };
  }
  return botInfoCache;
}

router.get('/telegram/info', async (_req, res) => {
  const hasToken = tgHasToken();
  if (!hasToken) {
    return res.json({
      hasToken: false,
      error: 'TELEGRAM_BOT_TOKEN not set in .env',
      targets: tgListTargets(),
    });
  }
  const bot = await probeBot();
  res.json({
    hasToken: true,
    bot,
    targets: tgListTargets(),
    statusMap: tgGetStatusMap(),
  });
});

router.get('/telegram/discover', async (_req, res) => {
  if (!tgHasToken()) return res.status(400).json({ error: 'no token' });
  try {
    const updates = await tgGetUpdates({ limit: 100 });
    const chats = tgExtractChats(updates);
    res.json({ chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/telegram/targets', async (req, res) => {
  if (!tgHasToken()) return res.status(400).json({ error: 'no token' });
  const { label, chatId, type } = req.body || {};
  try {
    const target = tgAddTarget({ label, chatId, type });
    res.json({ ok: true, target });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/telegram/targets/:id', (req, res) => {
  const removed = tgDeleteTarget(req.params.id);
  res.json({ ok: removed });
});

router.post('/telegram/test/:id', async (req, res) => {
  if (!tgHasToken()) return res.status(400).json({ error: 'no token' });
  const target = tgGetTarget(req.params.id);
  if (!target) return res.status(404).json({ error: 'target not found' });
  try {
    await tgSendMessage(target.chatId, 'SOMA · соединение работает');
    tgRecordStatus(target.id, true);
    res.json({ ok: true });
  } catch (e) {
    tgRecordStatus(target.id, false, e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /telegram/send  { targetId, items: [{url,title,author,source,pageUrl}] }
// Если items.length === 1 — sendPhoto. Иначе sendMediaGroup пачками по 10
// с задержкой 1 сек между пачками.
router.post('/telegram/send', async (req, res) => {
  if (!tgHasToken()) return res.status(400).json({ error: 'no token' });
  const { targetId, items } = req.body || {};
  const target = tgGetTarget(targetId);
  if (!target) return res.status(404).json({ error: 'target not found' });
  const list = Array.isArray(items) ? items.filter(i => i && i.url) : [];
  if (!list.length) return res.status(400).json({ error: 'no items' });

  try {
    if (list.length === 1) {
      const it = list[0];
      await tgSendPhoto(target.chatId, it.url, tgBuildCaption(it));
      tgRecordStatus(target.id, true);
      return res.json({ ok: true, sent: 1 });
    }
    // Группами по 10 с задержкой
    let sent = 0;
    for (let i = 0; i < list.length; i += 10) {
      const batch = list.slice(i, i + 10).map(it => ({
        url: it.url,
        caption: tgBuildCaption(it),
      }));
      await tgSendMediaGroup(target.chatId, batch);
      sent += batch.length;
      if (i + 10 < list.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    tgRecordStatus(target.id, true);
    return res.json({ ok: true, sent });
  } catch (e) {
    tgRecordStatus(target.id, false, e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

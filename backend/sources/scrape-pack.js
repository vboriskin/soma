// "Scrape pack" — best-effort scrapers for sites without official search APIs.
// Each one parses public HTML and is therefore fragile by definition: if the
// site changes its markup, expect "structure changed, please update parser".
// All scrapers wrap their work in try/catch so a single broken site doesn't
// take down the rest of the search.

import { fetchHtml } from './_util.js';
import { renderHtml } from './_headless.js';
import { readCookiesAsArray } from '../auth/source-cookies.js';

// Generic <img> harvester. Returns up to `limit` items {url, thumb, pageUrl,
// title} from a chunk of HTML. Use as a fallback when site-specific selectors
// don't match.
function harvestImages(html, opts = {}) {
  const limit = opts.limit || 30;
  const baseHost = opts.baseHost || '';
  const items = [];
  const seen = new Set();
  // Match <img ... src="..." ...> tolerant of attribute order.
  const re = /<img\b([^>]*?)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const srcM = attrs.match(/\b(?:data-src|data-lazy-src|src)="([^"]+)"/i);
    if (!srcM) continue;
    // Decode HTML entities — `page.content()` сериализует DOM обратно в HTML,
    // и `&` в URL'ах превращаются в `&amp;`. Если оставить — браузер потом
    // запросит `?format=webp&amp;w=400`, и cosmos/аналоги отдадут битую
    // картинку или неоптимальный размер.
    let src = srcM[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (/^data:/.test(src)) continue;
    if (/^\/\//.test(src)) src = 'https:' + src;
    else if (/^\//.test(src) && baseHost) src = `https://${baseHost}${src}`;
    if (!/^https?:\/\//.test(src)) continue;
    // Skip obvious tracking pixels and tiny avatars
    if (/sprite|placeholder|blank|loader|spinner|favicon/i.test(src)) continue;
    if (seen.has(src)) continue;
    seen.add(src);
    const altM = attrs.match(/\balt="([^"]+)"/i);
    items.push({ url: src, thumb: src, title: altM ? altM[1] : '' });
    if (items.length >= limit) break;
  }
  return items;
}

// ============== ArtVee ==============
// https://artvee.com/?s=...
export async function searchArtvee(query) {
  try {
    const html = await fetchHtml(`https://artvee.com/?s=${encodeURIComponent(query)}`);
    // ArtVee — WordPress; результаты лежат в `<ul class="products">`. До этого
    // мы харвестили все `<img>` со страницы — половина была sidebar/featured/
    // related-виджеты. Сужаем до контейнера `.products` (если найден).
    const m = html.match(/<ul[^>]*class="[^"]*\bproducts\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    const scope = m ? m[1] : html;
    const harvest = harvestImages(scope, { limit: 30, baseHost: 'artvee.com' })
      .filter(i => /artvee\.com|cloudfront/i.test(i.url))
      // Анализ скрытых событий: artvee стабильно подмешивает свой лого
      // (`/logob*.png`) и заглавную обложку с title="Artvee" в выдачу
      // 1-м/2-м элементом. Срезаем.
      .filter(i => !/\/logob|\/logo[-_.]/i.test(i.url))
      .filter(i => !/^artvee$/i.test((i.title || '').trim()));
    if (!harvest.length) {
      console.warn('[artvee] no items parsed — markup likely changed');
      return [];
    }
    return harvest.map((i, idx) => ({
      url: i.url,
      thumb: i.url,
      source: 'artvee',
      author: 'ArtVee',
      authorUrl: 'https://artvee.com/',
      pageUrl: 'https://artvee.com/?s=' + encodeURIComponent(query),
      id: 'av-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
      license: 'Public Domain',
    }));
  } catch (e) {
    console.warn('[artvee]', e.message);
    return [];
  }
}

// ============== Land-book ==============
// https://land-book.com/?search=...
export async function searchLandBook(query) {
  try {
    // SPA — без headless начальный HTML почти пустой. С headless ждём
    // networkidle и собираем рендеренные карточки.
    const url = `https://land-book.com/?search=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, { waitUntil: 'networkidle', timeout: 18000 });
    if (!html) return [];
    const harvest = harvestImages(html, { limit: 40, baseHost: 'land-book.com' })
      .filter(i => /land-book\.com|cloudinary|cdn/i.test(i.url))
      // Land-book подмешивает иконки категорий и логотипы. Оставляем только
      // настоящие thumb'ы галереи: они на cloudinary или в `/images/sites/`.
      .filter(i => !/icon|logo|sprite|favicon|\/categories\/|\/nav\//i.test(i.url));
    if (!harvest.length) {
      console.warn('[land-book] no items parsed — markup likely changed');
      return [];
    }
    return harvest.map((i, idx) => ({
      url: i.url,
      thumb: i.url,
      source: 'land-book',
      author: 'Land-book',
      authorUrl: 'https://land-book.com/',
      pageUrl: 'https://land-book.com/?search=' + encodeURIComponent(query),
      id: 'lb-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[land-book]', e.message);
    return [];
  }
}

// ============== Pinterest ==============
// Pinterest aggressively тогглит auth-wall: статический HTML без сессии =
// shell + signup form. Через headless страница рендерит реальные пины
// (Pinterest держит часть search-результатов в публичном доступе).
export async function searchPinterest(query) {
  try {
    const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, {
      waitUntil: 'networkidle',
      timeout: 20000,
      waitForSelector: 'img[src*="i.pinimg.com"]',
      cookies: readCookiesAsArray('pinterest'),
    });
    if (!html) return [];
    if (/requireAuth|signup/i.test(html) && !/i\.pinimg\.com/.test(html)) {
      console.warn('[pinterest] auth wall — no public pins after render');
      return [];
    }
    // Pinterest подмешивает аватары/лого (`/avatars/`, `/user/`) и thumbs
    // навигации в выдачу. Принимаем только реальные пины — `originals` и
    // размерные миниатюры. Превращаем мелкие в 736x для приличного превью.
    const harvest = harvestImages(html, { limit: 80 })
      .filter(i => /i\.pinimg\.com\/(originals|736x|564x|474x|236x)\//.test(i.url))
      .map(i => ({ ...i, url: i.url.replace(/\/(?:236x|474x|564x)\//, '/736x/') }));
    if (!harvest.length) {
      console.warn('[pinterest] no items parsed — markup likely changed or auth wall');
      return [];
    }
    return harvest.slice(0, 30).map((i, idx) => ({
      url: i.url,
      thumb: i.url,
      source: 'pinterest',
      author: 'Pinterest',
      authorUrl: 'https://www.pinterest.com/',
      pageUrl: 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(query),
      id: 'pin-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[pinterest]', e.message);
    return [];
  }
}

// ============== Cosmos.so ==============
// SPA — без headless начальный HTML почти пустой. С headless ждём
// networkidle и собираем рендеренные карточки. Раньше использовали
// fetchHtml — стабильно отдавал 0 (см. диагностический отчёт 2026-05-10).
export async function searchCosmos(query) {
  try {
    const url = `https://www.cosmos.so/search?q=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, {
      waitUntil: 'networkidle',
      timeout: 16000,
    });
    if (!html) {
      // Headless недоступен (Playwright не установлен) → fallback на static
      // fetch. Лучше получить 0, чем упасть.
      const staticHtml = await fetchHtml(url);
      const fallback = harvestImages(staticHtml, { limit: 30, baseHost: 'cosmos.so' })
        .filter(i => !/avatars/.test(i.url));
      if (!fallback.length) return [];
      return fallback.map((i, idx) => ({
        url: i.url, thumb: i.url, source: 'cosmos',
        author: 'cosmos.so', authorUrl: 'https://www.cosmos.so/',
        pageUrl: url, id: 'cs-' + (idx + Math.random().toString(36).slice(2, 6)),
        title: i.title || '',
      }));
    }
    // Cosmos хранит превью в s3.amazonaws.com/cosmos-* и img.cosmos.so/.
    // Avatars — `/profile-pictures/` или `/users/`. Их фильтруем.
    // Также Cosmos рендерит generic placeholder-карточки с alt="Cluster element"
    // (это UI-элементы интерфейса, а не контент). Срезаем по title.
    const harvest = harvestImages(html, { limit: 60, baseHost: 'cosmos.so' })
      .filter(i => !/avatars|profile-pictures|\/users\//.test(i.url))
      .filter(i => !/^cluster element$/i.test((i.title || '').trim()));
    if (!harvest.length) {
      console.warn('[cosmos] headless rendered but no items found — markup likely changed');
      return [];
    }
    return harvest.slice(0, 30).map((i, idx) => ({
      url: i.url,
      thumb: i.url,
      source: 'cosmos',
      author: 'cosmos.so',
      authorUrl: 'https://www.cosmos.so/',
      pageUrl: 'https://www.cosmos.so/search?q=' + encodeURIComponent(query),
      id: 'cs-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[cosmos]', e.message);
    return [];
  }
}

// ============== read.cv / posts.cv ==============
// Minimal scrape — content here is largely text and image cards.
export async function searchReadcv(query) {
  try {
    // posts.cv search — почти полностью клиентский, иногда требует логина.
    // Берём 'load' (не 'networkidle' — часто никогда не наступает).
    const url = `https://posts.cv/search?q=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, {
      waitUntil: 'load', timeout: 18000,
      cookies: readCookiesAsArray('readcv'),
    });
    if (!html) return [];
    // posts.cv хранит картинки в r2.cloudflarestorage / cdn.posts.cv. Фильтруем
    // аватары (профильные «User Photo») и только настоящие thumbs постов.
    const harvest = harvestImages(html, { limit: 40 })
      .filter(i => !/avatar|profile|sprite|favicon/i.test(i.url));
    if (!harvest.length) {
      console.warn('[readcv] no items parsed — markup likely changed or SPA');
      return [];
    }
    return harvest.map((i, idx) => ({
      url: i.url,
      thumb: i.url,
      source: 'readcv',
      author: 'posts.cv',
      authorUrl: 'https://posts.cv/',
      pageUrl: 'https://posts.cv/search?q=' + encodeURIComponent(query),
      id: 'rc-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[readcv]', e.message);
    return [];
  }
}

// ============== Mobbin ==============
// Search требует подписку, но публичный browse рендерит превью свободно.
// Через headless получаем реальные превью.
export async function searchMobbin(query) {
  try {
    const url = `https://mobbin.com/browse/ios/apps?search=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, {
      waitUntil: 'load', timeout: 25000,
      cookies: readCookiesAsArray('mobbin'),
    });
    if (!html) return [];
    const harvest = harvestImages(html, { limit: 40 })
      .filter(i => /mobbin\.com|cdn|images\.mobbin/i.test(i.url))
      .filter(i => !/avatar|logo|sprite|favicon/i.test(i.url));
    if (!harvest.length) {
      console.warn('[mobbin] no items parsed — likely paywalled or render failed');
      return [];
    }
    return harvest.map((i, idx) => ({
      url: i.url, thumb: i.url,
      source: 'mobbin',
      author: 'Mobbin',
      authorUrl: 'https://mobbin.com/',
      pageUrl: 'https://mobbin.com/browse/ios/apps?search=' + encodeURIComponent(query),
      id: 'mb-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[mobbin]', e.message);
    return [];
  }
}

// ============== Refero ==============
// SPA, через headless начинает отдавать карточки.
export async function searchRefero(query) {
  try {
    const url = `https://refero.design/explore?q=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, {
      waitUntil: 'load', timeout: 18000,
      cookies: readCookiesAsArray('refero'),
    });
    if (!html) return [];
    const harvest = harvestImages(html, { limit: 40 })
      .filter(i => /refero\.design|cdn|cloudfront|cloudinary/i.test(i.url))
      .filter(i => !/avatar|logo|sprite|favicon/i.test(i.url));
    if (!harvest.length) {
      console.warn('[refero] no items parsed — render failed');
      return [];
    }
    return harvest.map((i, idx) => ({
      url: i.url, thumb: i.url,
      source: 'refero',
      author: 'Refero',
      authorUrl: 'https://refero.design/',
      pageUrl: 'https://refero.design/explore?q=' + encodeURIComponent(query),
      id: 'rf-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[refero]', e.message);
    return [];
  }
}

// ============== Figma Community ==============
// SPA — HTML usually doesn't contain the cards. Best-effort only.
export async function searchFigmaCommunity(query) {
  try {
    // Раньше хардкодом стоял `model_type=plugins` — искались только плагины,
    // хотя юзер обычно ждёт UI-киты / шаблоны / hub_files. Снимаем фильтр —
    // дефолтный search ищет по всему хабу. Через headless ждём network-idle
    // до сбора, иначе initial HTML пустой.
    const url = `https://www.figma.com/community/search?q=${encodeURIComponent(query)}`;
    const html = await renderHtml(url, {
      waitUntil: 'networkidle',
      timeout: 20000,
      waitForSelector: 'img[src*="figma"]',
    });
    if (!html) return [];
    const harvest = harvestImages(html, { limit: 30 })
      .filter(i => /figma\.com|s3-figma/.test(i.url))
      // Анализ hide-событий: figma подмешивает иконки плагинов / template-cards
      // (`PluginIcon`, `plugin_icon`, `icon-`) и hero-аватарки. Срезаем.
      .filter(i => !/PluginIcon|plugin_icon|plugin-icon/i.test(i.title || ''))
      .filter(i => !/\/plugin_icons?\/|\/plugin-icons?\//i.test(i.url));
    if (!harvest.length) {
      console.warn('[figma-community] no items parsed — SPA-rendered');
      return [];
    }
    return harvest.map((i, idx) => ({
      url: i.url,
      thumb: i.url,
      source: 'figma-community',
      author: 'figma community',
      authorUrl: 'https://www.figma.com/community',
      pageUrl: 'https://www.figma.com/community/search?q=' + encodeURIComponent(query),
      id: 'fc-' + (idx + Math.random().toString(36).slice(2, 6)),
      title: i.title || '',
    }));
  } catch (e) {
    console.warn('[figma-community]', e.message);
    return [];
  }
}

// Shared headless browser for SPA-каталогов (Pinterest, Land-book, Read.cv,
// Figma Community, Mobbin, Refero). Запускаем Chromium один раз на весь
// lifecycle сервера, переиспользуем context + page для каждого запроса.
// После 5 минут простоя — закрываем браузер, чтобы не держать память.
//
// Использование:
//   import { renderHtml } from './_headless.js';
//   const html = await renderHtml('https://example.com', { waitUntil: 'networkidle', timeout: 15000 });
//
// При первом вызове Chromium стартует ~1.5 сек (cold). Дальше каждая страница
// 1–4 сек в зависимости от SPA. Если Playwright недоступен — функция
// возвращает '' (пустую строку), и вызывающий код фолбэчится на пустой массив.

let chromium = null;
let importError = null;

async function loadChromium() {
  if (chromium) return chromium;
  if (importError) return null;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
    return chromium;
  } catch (e) {
    importError = e;
    console.warn('[headless] playwright not installed:', e.message);
    return null;
  }
}

let browser = null;
let context = null;
let lastUsed = 0;
let shutdownTimer = null;
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000; // 5 минут

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function ensureBrowser() {
  const ch = await loadChromium();
  if (!ch) return null;
  if (browser && browser.isConnected()) return browser;
  // Если контекст висит после disconnect — обнуляем
  browser = null;
  context = null;
  try {
    browser = await ch.launch({ headless: true });
    context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 1024 },
      locale: 'en-US',
      // Снижаем нагрузку: блокируем тяжёлые ресурсы, которые не нужны для парсинга HTML
      // (видео, шрифты, аналитика). Картинки оставляем — иногда они инжектятся в DOM
      // только после `<img>` lazy-loader срабатывает.
    });
    // Блокируем медиа/шрифты/трекеры, чтобы страница быстрее доходила до networkidle.
    await context.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'media' || t === 'font' || t === 'websocket') return route.abort();
      const u = route.request().url();
      if (/google-analytics|googletagmanager|doubleclick|hotjar|segment\.com|amplitude/.test(u)) {
        return route.abort();
      }
      return route.continue();
    });
  } catch (e) {
    console.warn('[headless] failed to launch:', e.message);
    browser = null;
    context = null;
    return null;
  }
  return browser;
}

function scheduleShutdown() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(async () => {
    if (browser && Date.now() - lastUsed >= IDLE_SHUTDOWN_MS) {
      try { await browser.close(); } catch (e) {}
      browser = null;
      context = null;
    }
  }, IDLE_SHUTDOWN_MS + 1000);
  // не блокируем event-loop при выходе процесса
  if (shutdownTimer.unref) shutdownTimer.unref();
}

// Загружает страницу и возвращает .content() (HTML после JS-рендера).
// opts:
//   waitUntil: 'load' | 'domcontentloaded' | 'networkidle' (default: 'networkidle')
//   timeout: ms (default: 15000)
//   waitForSelector: CSS-селектор, после появления которого можно забирать HTML
//   cookies: массив { name, value, domain, path } — для login-walled источников
export async function renderHtml(url, opts = {}) {
  const waitUntil = opts.waitUntil || 'networkidle';
  const timeout = opts.timeout || 15000;
  const b = await ensureBrowser();
  if (!b) return '';
  let page;
  try {
    // Юзерские cookies (для авторизованных Mobbin/Refero/Read.cv/Pinterest).
    // Применяем НА КОНТЕКСТ — Playwright clear'ает их сам когда контекст умрёт.
    if (Array.isArray(opts.cookies) && opts.cookies.length) {
      try { await context.addCookies(opts.cookies); } catch (e) { /* ignore */ }
    }
    page = await context.newPage();
    await page.goto(url, { waitUntil, timeout });
    if (opts.waitForSelector) {
      try { await page.waitForSelector(opts.waitForSelector, { timeout: Math.min(timeout, 8000) }); }
      catch (e) { /* fallback на networkidle-результат */ }
    }
    const html = await page.content();
    lastUsed = Date.now();
    scheduleShutdown();
    return html;
  } catch (e) {
    console.warn('[headless]', new URL(url).hostname, e.message);
    return '';
  } finally {
    if (page) {
      try { await page.close(); } catch (e) {}
    }
  }
}

// Graceful shutdown — вызывается из server.js при SIGTERM/SIGINT
export async function closeBrowser() {
  if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
  if (browser) {
    try { await browser.close(); } catch (e) {}
    browser = null;
    context = null;
  }
}

# soma backend

Локальный прокси для четырёх источников, которые нельзя дернуть напрямую из браузера: **DeviantArt, ArtStation, Tumblr, Are.na**.

Слушает `http://localhost:8787`. CORS открыт для всех — только для локального использования.

## этика

SOMA — окно в визуальный мир. Мы не создаём контент, мы помогаем тебе собирать его.

- Атрибутируем авторов всегда, когда это возможно (имя + ссылка на источник под каждой карточкой).
- Уважаем запросы на удаление: если автор убрал работу с источника, frontend показывает уведомление, что картинка больше не доступна.
- Не зарабатываем на чужом контенте без согласия — SOMA не имеет монетизации.
- Активно расширяем каталог: добавляем источники из недопредставленных регионов (африканское современное искусство, латиноамериканский дизайн, восточно-европейская архитектура), чтобы баланс выдачи не воспроизводил bias дефолтных платформ.

Полный список feed-источников с указанием языка и режима — в `backend/sources/feed.js`.

См. также: [`soma-audit-3a-2026-05-10.md`](../soma-audit-3a-2026-05-10.md), Блок 4 — этический аудит каталога.

## 1. ключи

```
cp .env.example .env
```

Затем заполнить `.env`:

| переменная | где взять |
|---|---|
| `DA_CLIENT_ID`, `DA_SECRET` | https://www.deviantart.com/developers/apps — создать app, scope: `browse`, redirect_uri: `http://localhost:8787/callback` (формальность для client_credentials) |
| `TUMBLR_KEY` | https://www.tumblr.com/oauth/apps — нужен только consumer key (OAuth Consumer Key) |
| `ARENA_TOKEN` | https://dev.are.na/oauth/applications — создать app, использовать **personal access token** |
| `DRIBBBLE_CLIENT_ID` / `DRIBBBLE_CLIENT_SECRET` | прошиты в `.env.example`. Если хочешь свои — https://dribbble.com/account/applications/new (callback должен быть `http://localhost:8787/auth/dribbble/callback`) |
| `RSSHUB_BASE` | опционально — корень своего RSSHub-instance (без `/`). Включает tg-каналы. См. секцию «свой RSSHub». |
| `NYPL_TOKEN` | прошит. Свой — https://api.repo.nypl.org/ (Token-style auth) |
| `OPENSEA_KEY` | прошит. Свой — https://docs.opensea.io/reference/api-keys |
| ArtStation, WikiArt, Internet Archive, RSS-источники, парсеры | ключ не нужен |

## 2. запуск

```
npm install
npm run dev
```

Сервер поднимется на `http://localhost:8787`. Эндпоинты:

```
GET /api/search/deviantart?q=...
GET /api/search/artstation?q=...
GET /api/search/tumblr?q=...
GET /api/search/arena?q=...
```

Ответ — `{ "items": [...] }` в унифицированном формате. Кеш в памяти, TTL 5 минут.

## 3. dribbble (один раз)

Dribbble нужен только в режиме «дизайнер». OAuth flow требует браузер один раз — токен сохранится в `backend/dribbble-token.json` (gitignored) и живёт долго.

1. Бэк уже запущен (`npm run dev`).
2. Открой в браузере: <http://localhost:8787/auth/dribbble>
3. Залогинься в Dribbble и нажми **Allow**.
4. После редиректа увидишь страницу «готово» — токен записан.
5. В SOMA переключи режим в шапке на «дизайнер» — Dribbble появится в выдаче.

**Поиск по запросу не работает.** AWS WAF на Dribbble блокирует все пути `/search/*` и `/tags/*` независимо от cookies. Поэтому Dribbble ведёт себя как лента — мы скрейпим главный feed `/shots` (страницы 1..6 для основного источника, 7..12 для «теги»). Запрос пользователя игнорируется. Это не ошибка — это ограничение WAF, без headless-браузера обход невозможен.

**Сломался парсер?** Если HTML структуры сменили — поправь regex в [`sources/dribbble.js`](sources/dribbble.js). Сообщение в ошибке: `Dribbble HTML structure changed, please update parser`.

**Перенос на другую машину:** скопируй `dribbble-token.json` (OAuth) и `dribbble-cookies.txt` (session) — оба не привязаны к IP.

### если AWS WAF блокирует

Dribbble закрыт за AWS WAF: scrape страниц поиска без браузера получает HTTP 202 + JS-challenge. OAuth-токен помогает только на `api.dribbble.com`, а не на `dribbble.com`. Симптом — ошибка `Dribbble blocked the request (AWS WAF)`.

**Обновляй cookies через настройки в SOMA, не через .env.** В модалке настроек (режим «дизайнер») есть секция Dribbble: вставляешь строку cookies, нажимаешь «обновить» — бэк сохраняет их в `backend/dribbble-cookies.txt` и тут же делает тестовый запрос.

Откуда взять cookies — справка прямо в той же секции. Кратко: dribbble.com → DevTools → Network → любой запрос к dribbble.com → request headers → `cookie:` → скопировать строку целиком.

`DRIBBBLE_COOKIE` в `.env` остаётся как fallback для server-only сценариев (без UI). Если есть и файл, и env — приоритет у файла.

## 4. свой RSSHub (для Telegram-каналов)

Telegram-каналы (`tg-awdee`, `tg-designdrafts`, `tg-uxnotes` и любые другие) подключаются через [RSSHub](https://docs.rsshub.app) — он генерирует RSS из публичных каналов. Публичная инстанция `rsshub.app` уже год возвращает 403 — нужно поднять свой.

### Через Docker (1 минута)

```
docker run -d --name rsshub --restart=always -p 1200:1200 diygod/rsshub
```

В `backend/.env`:

```
RSSHUB_BASE=http://localhost:1200
```

Перезапусти бэк. tg-* источники теперь дойдут до RSS, и в фильтре они станут активными.

### Свой канал

Можно добавлять любой публичный Telegram-канал — формат `RSSHUB_BASE/telegram/channel/{username}` (без `@`). Структура каталога — в `backend/sources/feed.js`, поле `tgChannel`.

## 5. дополнительные источники для дизайнера

Все ниже работают только в режиме **«дизайнер»** в SOMA. Часть стабильная (официальные API/RSS), часть хрупкая (HTML scrape) — её ломает любая правка вёрстки на стороне сервиса.

| источник           | статус | как работает | примечание |
|--------------------|--------|--------------|-----------|
| **WikiArt**        | ✓ стабильно | неофициальный JSON `PaintingSearch` | без ключа |
| **Internet Archive** | ✓ стабильно | официальный `advancedsearch` JSON | без ключа |
| **NYPL**           | ✓ стабильно | официальный API `api.repo.nypl.org/api/v2/items/search` | прошит токен |
| **OpenSea**        | ✓ стабильно | API v2 `collections` (поиск text-based ограничен — клиентский фильтр поверх popular) | прошит ключ |
| **Awwwards RSS**   | ✓ если RSS-фид жив | `awwwards.com/sites_of_the_day.xml`; **запрос игнорируется** — лента SOTD | если фид сменили — поправить URL в `sources/awwwards.js` |
| **SiteInspire**    | ✓ если RSS жив | `siteinspire.com/showcase.rss`; запрос игнорируется | то же |
| **FWA**            | ✓ если RSS жив | `thefwa.com/rss`; запрос игнорируется | то же |
| **Dribbble (теги)**| ⚠ за AWS WAF | scrape `/tags/{tag}`, нужен `DRIBBBLE_COOKIE` | как обычный Dribbble |
| **Are.na (каналы)**| ✓ стабильно | поиск каналов + контент топ-3 | альтернативный угол к обычному Are.na |
| **ArtVee**         | ⚠ хрупко | scrape `?s=` | best-effort regex по `<img>` |
| **Land-book**      | ⚠ хрупко | scrape `?search=` | то же |
| **Pinterest**      | ⚠ хрупко / часто auth-wall | scrape `/search/pins/` | в инициальном HTML может не быть пинов |
| **Cosmos**         | ⚠ часто SPA | scrape `/search?q=` | скорее не будет работать без headless-браузера |
| **Read.cv**        | ⚠ часто SPA | scrape `posts.cv/search?q=` | то же |
| **Figma Community**| ⚠ SPA | scrape `figma.com/community/search` | в инициальном HTML карточек обычно нет |

Хрупкие источники не падают — при ошибке возвращают пустой массив и пишут `console.warn` в логе бэка. Если в SOMA от них ничего не приходит — посмотри логи `npm run dev`, поправь regex в [`sources/scrape-pack.js`](sources/scrape-pack.js).

Reddit-узкие-сабы — это не отдельный источник, а кнопка `+ узкие сабы` в настройках, видимая только в режиме дизайнера. Добавляет к Reddit подписки на `learndesign, Frontend, UXResearch, InteractionDesign, typography, web_design, UI_Design, userexperience`.

## 6.1. источники режима дизайнер — расширенный пакет

Базовый пакет (Awwwards / FWA / CSSDA / Smashing / Codrops / A List Apart / Brand New / It's Nice That / Creative Review / Design Milk / Sidebar / ArchDaily / Dezeen / Architectural Digest / Hyperallergic / Colossal / Aeon / Hacker News / Product Hunt / Reddit · designer / Хабр-хабы / VC.ru / Tinkoff Журнал / Сноб / Архи.ру / Афиша / Хайтек / Нож / Бюро · Новости) — уже подключён.

В этом пакете добавлены ниши, которых не хватало: дизайн-журналы про айдентику и типографику, UX-исследования, tech/product-журналы, скандинавское медиа и расширение TG-пула.

### Живые (RSS)

| источник | id | lang | url | примечание |
|----|----|----|----|----|
| Type Wolf | `typewolf` | en | `https://www.typewolf.com/feed` | RSS на корне `/feed`, не `/site-of-the-day/feed` |
| Logo Design Love | `logodesignlv` | en | `https://logodesignlove.com/feed/` | блог David Airey |
| BP&O | `bpando.org` | en | `https://bpando.org/feed/` | branding portfolio observed |
| designboom | `designboom` | en (D+Ae) | `https://www.designboom.com/feed/` | глобальный микс |
| Pixel Perfect Magazine | `pixelperfect` | en | `https://pixelperfectmag.com/feed/` | `slow: true` (313 KB) |
| UX Collective | `uxcollective` | en | `https://uxdesign.cc/feed` | Medium publication |
| UX Movement | `uxmovement` | en | `https://uxmovement.com/feed/` | UX-паттерны |
| Nielsen Norman Group | `nngroup` | en | `https://www.nngroup.com/feed/rss/` | UX-исследования |
| SaaS Landing Page | `saaslandingpage` | en | `https://saaslandingpage.com/feed/` | SaaS-лендинги |
| The Verge | `theverge` | en | `https://www.theverge.com/rss/index.xml` | tech-журнал |
| Fast Company | `fastcompany` | en | `https://www.fastcompany.com/rss` | бизнес+дизайн (20 items) |
| Scandinavia Standard | `scandistandard` | en (D+Ae) | `https://www.scandinaviastandard.com/feed/` | скандинавский lifestyle |
| Cool Hunting | `coolhunting` | en (D+Ae) | `https://coolhunting.com/feed/` | глобальный куратор |
| Бюро · Советы | `bureau-soviet` | ru | `https://bureau.ru/bb/soviet/rss/` | методология (отд. от Новостей) |

### Telegram (kind: tg-web)

Все 4 уже подключённых TG-канала переведены с `kind: 'rsshub'` (зависел от `RSSHUB_BASE`) на прямой scrape `t.me/s/{channel}` — теперь работают без дополнительной инфраструктуры.

| источник | id | username | mode |
|----|----|----|----|
| Awdee · TG | `tg-awdee` | `awdee` | designer + aesthetic |
| Дизайн-кабак · TG | `tg-designdrafts` | `designdrafts` | designer |
| UX Notes · TG | `tg-uxnotes` | `uxnotes` | designer |
| Soft Culture · TG | `tg-softculture` | `softculture` | designer + aesthetic (расширен) |
| Design Mate · TG | `tg-designmate` | `designmate` | designer (новый) |
| Product Design School · TG | `tg-productdesignschool` | `productdesignschool` | designer (новый) |

### `unavailable` — DNS / 404 / приватные

**EN журналы / каталоги (5)**: `fontsinuse` (404), `designspiration` (404), `thebrandidentity` (404), `designernews` (DNS fail), `eyeondesign` (TLS chain неполная — `UNABLE_TO_VERIFY_LEAF_SIGNATURE` в Node fetch; curl-у всё равно, нам — нет).

**Скандинавия (1)**: `doga` — Design og arkitektur Norge без публичного RSS.

**RU (2)**: `tj-design` (Tinkoff/Дизайн раздел — 401, нет публичного фида), `setters-media` (404 на стандартных путях).

**TG (приватные / @username не подтверждён)** — `t.me/s/{channel}` отдаёт заглушку без widget-сообщений: `tg-typojournal`, `tg-mainbranding`, `tg-creativitysnobs`, `tg-designdialogue`, `tg-designfest`, `tg-gv-designcrits`, `tg-ru-typography`, `tg-bureauchat`, `tg-uxdesigners`, `tg-typoinspirations`, `tg-brandidcollection`.

> Если у TG-канала появится публичный feed — открой `https://t.me/s/{username}` в браузере: должны появиться превью постов. Если они есть — снимай `status: 'unavailable'` в [`sources/feed.js`](sources/feed.js).

### Mobbin / Refero / Read.cv / UI Garage / Lapa Ninja / Page Flows / Klart

- **Mobbin** — search требует pro-подписку. Через headless `/browse/ios/apps?search=...` грузится, но карточек 0. `defaultOff: true`.
- **Refero** — то же; `/explore?q=` за paywall'ом. `defaultOff: true`.
- **Read.cv (posts.cv)** — search закрыт логином. `defaultOff: true` (после headless-апгрейда 2026-05-09).
- **UI Garage / Lapa Ninja / Page Flows / Klart** — не подключены: SPA с пустым initial HTML и нечем поживиться без логина.

## 6.3. audit-pack (2026-05-09) — новые источники и методы

После панельного аудита добавлено:

### Новые RSS / kinds в FEEDS

| источник | id | mode | примечание |
|----|----|----|----|
| Ignant | `ignant` | aesthetic+designer | флагман photo/design эстетика-mood |
| Dazed | `dazed` | aesthetic | fashion editorial, slow flag |
| Core77 | `core77` | designer | industrial / product-design |
| Yanko Design | `yankodesign` | designer | product-concepts |
| British Journal of Photography | `bjp` | aesthetic | contemporary photo, slow |
| Mousse Magazine | `mousse` | aesthetic | contemporary art, slow |
| Behance | `behance` | designer+aesthetic | RSS живой, 30+ items |
| The Kitchn | `thekitchn` | aesthetic | food/kitchen эстетика, slow |
| Robin Rendle | `robinrendle` | designer | personal design blog (slow) |
| Vercel Blog | `vercel-blog` | designer | engineering+product design |
| Stripe Blog | `stripe-blog` | designer | engineering+brand |
| Daring Fireball | `daringfireball` | designer | tech+design analysis |
| Eye on Design (AIGA) | `eyeondesign` | designer | **revived** через `tlsRelax` (TLS-неполная chain) |

### Новые kinds

| kind | модуль | что делает |
|----|----|----|
| `mastodon` | [`_mastodon.js`](sources/_mastodon.js) | Public timelines / hashtag streams любого инстанса (`mas.to`, `typo.social`, `pixelfed.social`). Один JSON-эндпоинт `/api/v1/timelines/tag/{tag}` — 5 источников `mas-design`, `mas-uidesign`, `mas-typography`, `mas-architecture`, `mas-photography` |
| `bluesky` | [`_bluesky.js`](sources/_bluesky.js) | publicAppView XRPC — `app.bsky.feed.searchPosts`. Сейчас 403 от CF (на нашем IP); код рабочий, оживёт когда снимут блок или появится auth-flow |
| `wp-reader` | [`_wp_reader.js`](sources/_wp_reader.js) | WordPress.com Reader REST — агрегатор всех WP.com блогов с тегом одним вызовом. Источники `wp-reader-design`, `wp-reader-interior`, `wp-reader-typo` |

### TLS-relax helper

В [`_util.js`](sources/_util.js) добавлен `fetchInsecure(url, init)` через undici Agent с `rejectUnauthorized: false`. Применяется к источникам с `tlsRelax: true` в FEEDS — для серверов с неполной цепочкой сертификатов (curl видит через системный truststore, Node 22 fetch — нет). Только read-only RSS, никаких credentials через эти запросы.

Результаты:
- ✅ `eyeondesign` (AIGA) — был unavailable, **10 items**
- ✅ `snob` — TLS поправлен, но дальше TCP/RST на CF-edge, остаётся unavailable до отдельного расследования

### Met Museum stack-модуль

[`backend/sources/met.js`](sources/met.js) — Open Access API: `/search?q=&hasImages=true` → object IDs → параллельные `/objects/{id}` за primaryImage и метаданными. Без ключа, ~700K объектов. Подключён как stack-источник `met` для режимов artist+aesthetic.

### Bluesky / Pixelfed marked unavailable

Код адаптеров рабочий, источники в каталоге, помечены `status: 'unavailable'`:
- **Bluesky** — публичный AppView возвращает 403 (Cloudflare на нашем IP)
- **Pixelfed** — публичные timelines требуют auth с 2024 (API возвращает пустой массив)

Оживут когда добавим OAuth-flow или снимут блок.

### Что ещё в плане

Из аудита остались не реализованы (high effort или специфика):
- **Self-hosted RSSHub** в docker — unlock 11 unavailable TG-каналов. Команда в README §4. Один docker run, не трогает код.
- **Reddit OAuth client_credentials** — оживит нулевые сабы `r-UI_Design / r-userexperience / r-web_design`. Нужны Reddit script-app credentials в `.env`.
- **Sitemap.xml + lastmod** для `cereal`, `gentlewoman`, `setters` — kind `'sitemap'`. Не реализовано.
- **archive.today fallback** для 404/403 источников.
- **headless `context.addCookies()`** для `mobbin`, `refero`, `read.cv`.
- **Atproto firehose websocket** для real-time Bluesky.

## 6.4. audit-pack 2 (2026-05-09 поздно) — методы извлечения

### RSSHub (опционально)

```
docker run -d --name rsshub --restart=always -p 1200:1200 diygod/rsshub
```

В `backend/.env`:
```
RSSHUB_BASE=http://localhost:1200
```

**Важно:** RSSHub без `TELEGRAM_SESSION` (mtproto session string) **не читает приватные TG-каналы**. Те 11 unavailable-каналов (Typo Journal, Main Branding и т.д.) останутся 503 без отдельной mtproto-настройки. Для активации см. [RSSHub docs → Telegram](https://docs.rsshub.app/install/) — нужен gramjs session string в env-переменной `TELEGRAM_SESSION`. Это отдельная настройка на 5–10 минут.

Источники с `kind: 'rsshub'` сами разворачиваются в RSS-эндпоинт `RSSHUB_BASE/telegram/channel/{username}` если переменная задана.

### Sitemap kind ([`_sitemap.js`](sources/_sitemap.js))

Парсит `/sitemap.xml` (включая sitemapindex с вложенными), сортирует URL по `<lastmod>`, для top-30 страниц параллельно дёргает og:image и метаданные. Подходит для сайтов без RSS, но со стандартным SEO-sitemap'ом.

```js
{ id: 'X', kind: 'sitemap', url: 'https://X.com/sitemap.xml',
  pathFilter: '/articles/' }  // опц., чтобы выкинуть служебные URLs
```

Для cereal/gentlewoman/setters механизм рабочий, но эти конкретные сайты в sitemap отдают сервисные страницы (/confirmation, /docs), не статьи — оставлены `unavailable`. Механизм пригодится для других источников где есть качественный sitemap.

### Wayback Machine fallback

В `_util.js` — `fetchWithWaybackFallback(url, init)`. Когда основной URL отвечает 404/403/DNS-fail, helper проверяет `archive.org/wayback/available`, и если есть свежий snapshot — отдаёт его cached HTML. Применяется к feed-источникам с флагом `archiveFallback: true`.

**Применено к:** `fontsinuse`, `designspiration`, `thebrandidentity`, `designernews`. Wayback не всегда хранит свежий feed-XML, поэтому эффект переменный — но это последняя линия защиты.

### Cookies UI для login-walled источников ([`auth/source-cookies.js`](auth/source-cookies.js))

Cookies хранятся в `backend/cookies/{id}.txt` (gitignored), применяются в headless Chromium через `context.addCookies()`. Поддерживается 4 источника: `mobbin`, `refero`, `readcv`, `pinterest`.

**Backend API** (`/api`):
- `GET /cookies` — список разрешённых источников + `hasCookies` для каждого
- `POST /cookies/{id}` — записать cookie-строку (text body)
- `DELETE /cookies/{id}` — удалить

**Frontend UI:** настройки → секция «cookies для платных источников» (видна в режимах designer + aesthetic). Для каждого источника textarea + «обновить» / «очистить». Cookies live-применяются на следующий запрос source через `renderHtml(url, { cookies: [...] })` в `_headless.js`.

**Как получить cookies:** открыть нужный сайт в браузере, залогиниться, DevTools → Application → Cookies → выделить все → скопировать в `name=value;`-формате. Или DevTools → Network → любой запрос → Headers → request `cookie:` — скопировать всю строку.

### Bluesky Jetstream firehose ([`_bluesky_firehose.js`](sources/_bluesky_firehose.js))

Долгоживущая websocket-подписка на `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post`. Один глобальный socket на весь lifetime сервера, ring-buffer на 500 последних постов с image. Реконнект через 5 сек после разрыва. Для каждого источника фильтрация по `keywords`.

**Зависимость:** `ws` (новый npm-пакет).

**Источники в FEEDS:**
- `bsky-fh-design` — keywords: design, typography, ui, ux, branding
- `bsky-fh-photography` — keywords: photography, photo, film, analog
- `bsky-fh-architecture` — keywords: architecture, interior, building, space

**Smoke-test:** за 12 сек подписки — 105 постов в buffer'е, фильтр по «design» — 1 матч (зависит от частоты дизайн-постов в общем потоке Bluesky). Для feed-режима: чем дольше работает бэк, тем плотнее лента. После рестарта — buffer пустой, нужно 1–2 минуты на наполнение. **Это нормально и должно так быть** — firehose это real-time-stream, не RSS-poll.

**Graceful shutdown:** в `server.js` на SIGTERM/SIGINT вызывается `shutdownFirehose()` — websocket закрывается чисто.

## 6.5. Telegram-интеграция

С 2026-05-09 есть отправка картинок из коллекции в Telegram через личного бота. Бот `@soma_visual_bot` уже создан, токен прошит в `.env.example`.

### Как настроить

1. Скопируй `.env.example` в `.env` (если ещё не):
   ```
   cp .env.example .env
   ```
2. Перезапусти бэк (`npm run dev`).
3. Открой настройки SOMA → секция **Telegram** → должно показаться `bot · @soma_visual_bot · подключен`.
4. Чтобы добавить получателя:
   - попроси его написать боту `@soma_visual_bot` любое сообщение
   - в SOMA → настройки → Telegram → `+ добавить получателя` → `автоматически найти →`
   - кликни нужный чат из списка — `chat_id` подставится сам, метку поправь по вкусу
   - `сохранить`
   - проверь через `тест` (бот пришлёт «SOMA · соединение работает»)
5. В коллекции теперь у каждой картинки по hover появляется `→`. Клик → выпадающее меню «отправить в:» → выбор получателя → отправка.

### Массовая отправка

В коллекции в шапке есть `выбрать` — переключает в режим выбора. Клик по картинке = toggle (рамка вокруг). В шапке появляется счётчик `выбрано: N` и кнопка `отправить →`. Telegram-API `sendMediaGroup` отправляет альбомами по 10 картинок, между пачками задержка 1 сек.

### Архитектура

- **Токен** живёт только в `.env` как `TELEGRAM_BOT_TOKEN`. Никогда не отдаётся на фронт — только `hasToken: true/false` и `botUsername`.
- **Цели** (chat_id'ы) хранятся в `backend/telegram-targets.json` (gitignored). Структура `{ targets: [{id, label, chatId, type, createdAt}], status: {id: {ok, lastTested, error}} }`.
- **Backend модули:**
  - [`sources/_telegram.js`](sources/_telegram.js) — клиент Bot API на стандартном fetch (getMe, getUpdates, sendMessage, sendPhoto, sendMediaGroup). Без новых deps.
  - [`auth/telegram-targets.js`](auth/telegram-targets.js) — CRUD по targets + per-target status.
- **Endpoints:**
  - `GET /api/telegram/info` — `{ hasToken, bot: {ok, username, ...}, targets, statusMap }`
  - `GET /api/telegram/discover` — последние 24ч чатов через `getUpdates`
  - `POST /api/telegram/targets` `{label, chatId}` → добавить
  - `DELETE /api/telegram/targets/:id` → удалить
  - `POST /api/telegram/test/:id` → тестовое сообщение
  - `POST /api/telegram/send` `{targetId, items: [{url,title,author,source,pageUrl}]}` → отправка одной или N картинок

### Caption формат

```
{title или description}

{author} · {source}
{pageUrl}
```

Если `title` нет — caption начинается с `author · source`. Caption обрезается до 1024 символов (лимит Telegram) с многоточием.

### Ограничения

- **Размер картинки ≤ 5 MB** — иначе Telegram отклоняет `sendPhoto`. Реализован fallback на `sendDocument` при типичных ошибках.
- **`getUpdates` возвращает последние 24 часа** — если бот давно не получал сообщений, список «автоматически найти» будет пустым. Попроси получателя написать боту — потом нажми «найти» снова.
- **Rate-limit Telegram**: ~30 messages/sec, ~20/min на группу. Массовая отправка идёт пачками по 10 с задержкой 1 сек.

### Безопасность

- Токен `TELEGRAM_BOT_TOKEN` никогда не покидает бэк. На фронт уходит только `botUsername`.
- В JSON-экспорте диагностики (`скачать json`) — `telegram` секция содержит `hasToken: bool`, `botUsername`, список target'ов с chat_id'ами и статусом, **но не токен**.
- `backend/telegram-targets.json` в `.gitignore`.

## 7. headless-браузер для SPA-каталогов

С 2026-05-09 в бэкенд встроен Playwright + headless Chromium. Используется только для SPA-источников, у которых статический HTML пустой (Pinterest, Land-book, Figma Community, Mobbin, Refero, Read.cv). Все остальные источники по-прежнему ходят через обычный `fetch` — headless дорогой по памяти и не нужен там, где работает обычный RSS/JSON.

### Запуск

```
npm install                       # ставит playwright (~5 MB)
npx playwright install chromium   # качает Chromium-headless-shell (~92 MB)
npm run dev
```

Без `playwright install chromium` Playwright не запустит браузер, а `_headless.js` тихо вернёт пустой массив на запрос — SPA-источники станут как раньше «partial · 0 items». В логе: `[headless] failed to launch: ...`.

### Архитектура

[`backend/sources/_headless.js`](sources/_headless.js) — shared-модуль:
- Один Chromium-инстанс на весь lifetime сервера (lazy init при первом вызове).
- Один context, viewport 1280×1024, заблокированы media/font/трекеры через `context.route` — страницы быстрее доходят до `networkidle`.
- Idle-shutdown: если 5 минут не было запросов — браузер закрывается, освобождая ~150 MB RAM.
- При SIGTERM/SIGINT в [`server.js`](server.js) — gracefully закрываем браузер до выхода процесса (иначе zombie Chromium на macOS).

API:

```js
import { renderHtml } from './_headless.js';
const html = await renderHtml('https://example.com', {
  waitUntil: 'networkidle',           // или 'load' / 'domcontentloaded'
  timeout: 18000,
  waitForSelector: 'img[src*="..."]', // опционально — ждать конкретный элемент
});
```

Возвращает `''` если Playwright не установлен или page-fetch упал — вызывающий код фолбэчится на пустой массив без падения.

### Что ожило с headless

| источник | до | после | примечание |
|---|---|---|---|
| `pinterest` | 0 (auth-wall в static HTML) | 17–30 items | реальные `i.pinimg.com/736x/...` |
| `land-book` | 0 (SPA) | 27–32 items | cdn.land-book.com thumbs |
| `figma-community` | 0 (SPA) | 30 items | static.figma.com thumbs |
| `mobbin` | 0 | 0 | search за paywall'ом — `defaultOff` |
| `refero` | 0 | 0 | то же — `defaultOff` |
| `readcv` (posts.cv) | 0 | 0 | search требует логин — `defaultOff` |

Если в будущем появятся cookies для Mobbin/Refero/Read.cv (отдельная фича а-ля Dribbble session), они оживут без правок логики — нужно передать cookies в `context.addCookies(...)` в `_headless.js`.

## 6.2. источники режима эстетика — Seasons-аналоги

Большой пакет журналов и Telegram-каналов «slow living / эстетика быта» — аналоги Seasons of life. URL прозвонены 2026-05-09; что не отдало валидный RSS на момент проверки — помечено `status: 'unavailable'`. Юзер видит их в фильтре источников как «недоступно» (italic), клик на чип не падает — отдаёт пустой массив. Если автор источника откроет публичный RSS / TG-канал, флаг можно снять.

### Живые (RSS)

| источник | id | lang | url |
|----|----|----|----|
| 91 Magazine | `magazine91` | en | `https://91magazine.co.uk/feed/` |
| Modern Farmer | `modernfarmer` | en | `https://modernfarmer.com/feed/` |
| Suitcase Magazine | `suitcase` | en | `https://suitcasemag.com/feed` |
| Country Living UK | `countryliving` | en | `https://www.countryliving.com/uk/rss/all/` |
| Flow Magazine | `flow` | en | `https://www.flowmagazine.com/feed/` |
| The Simple Things | `simplethings` | en | `https://www.thesimplethings.com/blog?format=RSS` (Squarespace) |
| Norwegian Arts | `norwegianarts` | no | `https://norwegianarts.org.uk/feed/` |

### Живые (Telegram через `kind: 'tg-web'` — scrape `t.me/s/{channel}`)

| источник | id | username |
|----|----|----|
| Modern Art & Aesthetic | `tg-modern-art` | `modern_art_only` |
| Русское искусство и стиль | `tg-russian-art` | `big_russian_art` |
| Art & Aesthetic XX century | `tg-art-xx` | `art_and_aestheticXX` |
| Soft Culture | `tg-softculture` | `softculture` |
| Эрмитаж | `tg-hermitage` | `Hermitage_Hermitage` |
| Медленное | `tg-medlennoe` | `medlennoe` |

### `unavailable` — DNS/404/403/private

**EN журналы**: `bloom` (DNS fail), `wildflower` (DNS fail), `heiter` (DNS fail), `seedmag` (DNS fail), `hygge` (DNS fail), `lagom` (200 OK, но не RSS), `anotherescape` (404 на всех путях).

**NO журналы**: `hytteliv` (404), `bobedre-no` (301 → DNS fail), `kk-bolig` (404), `visitnorway` (403). Норвежские издания почти все без публичного RSS — оставлены как маркеры.

**RU журналы**: `apartamentmag` (DNS fail), `tim-magazine` (DNS fail), `marievorobyov` (DNS fail).

**TG (приватные / @username не подтверждён)**: `tg-poludkina` (poludkina_polina), `tg-bangbang` (bangbangeducation), `tg-artworld` (taw1999), `tg-gaeva` (gaeva_dom), `tg-ardinterior` (ardinterior), `tg-miritskevich` (miritskevich), `tg-dachadream`, `tg-slowfood-ru`, `tg-cupmorning`, `tg-radostbyta`, `tg-chitayaupal`. Если у канала есть публичный feed — поправь `status` в [`sources/feed.js`](sources/feed.js).

> Важно: `t.me/s/{channel}` отдаёт 200 OK даже для приватных каналов, но без widget-сообщений (HTML-заглушка ~9 KB). Если в логах `[feed:tg-X]` видишь пустой массив, а сам канал должен быть публичным — открой `https://t.me/s/{channel}` в браузере: если там «Please join», значит автор закрыл канал.

## 5. фронт

Открыть `../soma.html` в браузере: либо через `file://`, либо через `http://localhost:что-то`. **Не через HTTPS** — браузер заблокирует mixed-content на http-бэк.

## заметки

- Бэкенд только для локалки. Перед деплоем поменять `cors({ origin: '*' })` в `server.js` на конкретный origin.
- DeviantArt токен живёт ~1 час, кешируется в памяти модуля и обновляется автоматически.
- Tumblr ищет по одному тегу — берётся первое слово запроса.

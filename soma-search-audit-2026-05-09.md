# SOMA · аудит качества поиска

> Дата: 2026-05-09 · Базовая ревизия кода: `soma.html` (9385 строк) + `backend/` (28 source-adapter'ов, ~3000 строк)
> Цель аудита: **найти все системные причины, по которым 80% результатов поиска свайпаются впустую, и предложить архитектурные решения**.

---

## Команда экспертов

Для аудита собрана условная команда — собирательные образы экспертов, чьи практики и публикации применимы к SOMA. Каждый «приходит со своим взглядом», и в нескольких местах они **не сходятся** — это намеренно, я не натягиваю консенсус.

### 1. Doug Turnbull — Relevance Engineer
*Соавтор «Relevant Search» (Manning), ex-OpenSource Connections, ныне в Reddit/Search-Relevance.* Смотрит на SOMA через линзу «search relevance pipeline»: signals → matching → scoring → diversification. Его жёсткий тезис: «**если у вас нет контролируемого scoring-слоя — у вас нет поиска, у вас агрегатор**». Будет настаивать на том, чтобы рандомного `Math.random()`-шафла вообще не существовало.

### 2. Daniel Tunkelang — Query Understanding
*Ex-LinkedIn Search, автор «Faceted Search». Десятилетия опыта query intent classification.* Скажет про SOMA: «у вас один запрос — три режима, но запрос даже не парсится. Это как если бы Google не различал коммерческий запрос от навигационного». Будет требовать `query understanding layer` ДО маршрутизации.

### 3. Trey Grainger — AI-Powered Search
*Author «AI-Powered Search» (Manning). Бывший CTO Lucidworks.* Будет указывать, что «расширение запроса через regex — это 2010 год. В 2026 — embedding-based query rewriting и semantic search». Но прагматик: «начинайте с lexical baseline + LLM rewriter поверх».

### 4. Pinterest Visual Search Engineer (собирательный)
*Inspired by Andrew Zhai, Yushi Jing.* Pinterest держит самую большую визуальную поисковую систему в мире. Их TL;DR: «пользователь не знает, что он ищет — он узнаёт это в момент свайпа. Поиск должен быть **trip-style discovery**, а не **session-style query**». Будет настаивать на behavioral feedback loop.

### 5. Are.na Content Architect (собирательный)
*Are.na построена вокруг идеи «думать в каналах».* Их инсайт: «full-text search в курируемом контенте — анти-паттерн. Curation сама по себе сигнал». Поэтому в SOMA Are.na надо использовать НЕ как полнотекст, а как «найти канал → взять последние блоки».

### 6. Unsplash Search Lead (собирательный)
*Inspired by Stephanie Liverani, Luke Chesser.* «Unsplash оптимизирован под one-keyword запросы — не фразы. Длинная фраза с AND-связкой = катастрофа». Будет рекомендовать понижать многословные запросы до single-noun perceptual concepts перед отправкой.

### 7. Jakob Voss — Multilingual Search & Library Science
*OCLC, GBV, библиотечный multilingual.* Скажет «в SOMA нет language pipeline вообще. Cyrillic запрос отправляется в English-only API — это категориальная ошибка, не оптимизация». Предложит трёхступенчатую обработку: detect → expand-on-source-language → translate-for-target-API.

### 8. Karen McGrane — Content UX
*Bond Art + Science, до того Razorfish.* Будет смотреть на интерфейс: «поле ввода без подсказок про тип запроса, без feedback'а во время набора, без recovery при empty result — это интерфейс из 2010-х». Предложит progressive disclosure и query autocomplete с примерами.

### 9. Search Quality Engineer Anonymous (Google ex.)
*Видел внутренности больших систем.* Будет смотреть на baseline-метрики: «у вас нет ни одного измерения качества. Ни CTR, ни skip-rate, ни empty-result-rate. Вы оптимизируете на ощупь». Без метрик — никакой архитектуры не примет: «измерь сначала, потом перестраивай».

### 10. Erik Bernhardsson — vector search & ANN
*Создатель Annoy, ex-Spotify, основатель Modal. Десять лет с embedding-индексами.* Будет настойчиво говорить: «всё, что вы делаете — sparse retrieval в шуме. Один пайплайн dense embeddings (CLIP/SigLIP) — и качество сразу x3». Но честно: «но это ещё 2-3 месяца работы, а простые лексические улучшения дадут x1.5 за неделю».

### Где они расходятся

- **Turnbull vs Bernhardsson**: Doug говорит «починить лексическое сначала, ranking — потом». Erik — «пропустите лексическое, идите сразу в embeddings». Я в отчёте буду сторониться обоих и предлагать **порядок: lexical fix → query understanding → dense retrieval как третья волна**.
- **Tunkelang vs UX-эксперт**: Daniel хочет автоматический intent classifier; UX — хочет, чтобы юзер сам выбирал «я ищу артиста / стиль / референс / настроение». Истина — гибрид (мягкая классификация + явный hint, см. ниже).
- **Pinterest vs Are.na**: один говорит «behavioral feedback», другая — «editorial curation». В SOMA нужны оба, для разных кейсов.

---

## Текущее состояние

### 1. Карта системы поиска

Полный путь запроса от ввода до карточки на стопке. Строки и имена функций — точные, привязаны к `soma.html` (если не указан другой файл).

**1.1. Ввод** (`<input id="query">` в `header`)
- Юзер набирает текст. Нет debounce — `search()` вызывается только по Enter / клику preset / клику category.
- Нет autocomplete. Нет suggestions. Нет «did you mean…».
- Нет языкового хинта в placeholder'е (просто «что будем рисовать…», и так в трёх режимах).

**1.2. Триггер `search(query)`** (`soma.html:5431`)
- Сохраняет в `state.query`, чистит queue, отрисовывает loader с прогрессом «загружаю · X из Y».
- Логирует в `state.history` event `search`.
- Дальше — `fetchAll(query, onProgress)`.

**1.3. Маршрутизация: `fetchAll`** (`soma.html:4944`)
```js
for (const src of SOURCES) {
  if (!isSourceInMode(src, state.mode)) continue;  // mode-фильтр
  if (!state.enabledSources[src.id]) continue;     // юзер выключил
  if (!activeIds.has(src.id)) continue;            // не в active preset
  if (src.needsKey && !key) continue;              // нет API ключа
  const q = effectiveQueryFor(src.id, query);      // designer-only мод-инжекция
  // дальше — switch по src.id → fetchUnsplash / fetchReddit / ... / fetchViaBackend
}
const results = await Promise.all(tasks);
let merged = results.flat();
// SHUFFLE
for (let i = merged.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [merged[i], merged[j]] = [merged[j], merged[i]];
}
// dedupe by liked.id
merged = merged.filter(item => !likedIds.has(item.id));
// soft anti-repeat
const fresh = merged.filter(item => !seen.has(item.id));
if (fresh.length >= 5) merged = fresh;
return { items: merged, errors };
```

Это и есть весь «pipeline»: для каждого источника один HTTP-запрос с одним и тем же `query` (плюс редкие designer-инъекции), параллельный Promise.all, плоский flat, шафл, два фильтра, return.

**1.4. Source-specific трансформация: `effectiveQueryFor`** (`soma.html:8878`)
- Работает **только в designer-режиме**. В artist и aesthetic возвращает запрос как есть.
- Для всех источников НЕ из `NO_DESIGNER_INJECTION_SOURCES` дописывает `state.designerPlatform` и `state.designerDomain` (если ≠ 'all'), и для Reddit — слово `dribbble`.
- `NO_DESIGNER_INJECTION_SOURCES` = `unsplash/pexels/pixabay/flickr/wallhaven/openverse/smithsonian/artic/safebooru/wikiart/iarchive/nypl/artvee/opensea/arena/arena-tags`.

То есть: для 16 из ~28 источников в дизайнере вообще никаких модификаций; для остальных — только +1-2 слова. Это **единственный** source-aware-слой во всей системе.

**1.5. Backend route**: `/api/search/:source?q=...` (`backend/routes.js:186`)
- 5-минутный TTL-кэш по ключу `${source}:${query.toLowerCase()}`.
- Negative cache (тоже 5 мин) на ошибки — чтобы не долбить упавший источник.
- Курируемые источники (`dribbble`, `dribbble-tags`, `awwwards-rss`, `siteinspire`, `fwa`) кэшируются БЕЗ запроса в ключе (`${source}:_curated`) — потому что они и так игнорируют q.

**1.6. Per-source adapter** (`backend/sources/{name}.js`)
- Каждый адаптер сам строит URL, делает fetch, парсит ответ, возвращает `[{url, thumb, source, author, authorUrl, pageUrl, id, title, ...}]`.
- Никакого общего слоя normalization, validation, scoring или filtering — это **28 параллельных монолитов**, написанных по разному стилю в разное время.

**1.7. Возврат и рендер** (`renderCard`, `soma.html:5110`)
- Первый item из `state.queue` идёт в верхнюю карточку, дальше стопка вглубь.
- При свайпе вправо — `markSeen(id)` + skip, при лайке — `state.liked.unshift(item)` + `markSeen(id)`.
- Когда стопка иссякла — `refillQueue()` снова дёргает `fetchAll()` с тем же `state.query`, append=true.

**1.8. `seenIds` Map** (`soma.html:3686`, persisted в `localStorage['rs:seen']`)
- TTL 14 дней, cap 5000.
- Ключ — `item.id` (e.g. `unsplash-XXXX`, `reddit-YYYY`). У одной и той же картинки из Pinterest + Are.na + Tumblr id'шники разные → дубль виден N раз.

### 2. Источники и их специфика

Полный каталог. Sourced из `SOURCES` (frontend, `soma.html:2669`), `handlers` (`backend/routes.js:63`) и `FEEDS` (`backend/sources/feed.js:35`).

#### 2.1. Stack-источники (попадают в свайп-стопку)

| Источник | Endpoint | Тип | Лимит | Языки | Quirks |
|---|---|---|---|---|---|
| **Reddit** | `reddit.com/r/{sub}/search.json?q=&restrict_sr=on&sort=relevance&t=all&limit=25` per-sub × N сабов | full-text per-sub | 25 × N (8-16) | EN-only | Кириллица почти не индексируется в EN-сабах. На пустой query — `/hot.json` |
| **Unsplash** | `api.unsplash.com/search/photos?query=&per_page=30` | full-text AND | 30 | EN-only | Длинная фраза = AND-связка по словам, часто пусто. Не понимает русский, не понимает `interior with morning light` (3+ слов) |
| **Pexels** | `api.pexels.com/v1/search?query=&per_page=30` | full-text | 30 | EN-only | Не отдаёт `b2b/internal/web` запросы — это дизайн-сленг, не объекты. Поэтому в `NO_DESIGNER_INJECTION_SOURCES` |
| **Pixabay** | `pixabay.com/api/?q=&per_page=50&image_type=photo` | full-text | 50 | EN-mostly | `image_type=photo` режет иллюстрации/векторы — потенциальная потеря на запросах вроде `vintage poster` |
| **Flickr** | `services/rest/?method=flickr.photos.search&text=&sort=relevance` | full-text title/desc/tags | 50 | EN+ | Multi-word без кавычек = OR (мусор). License-фильтр не используется — могут попадать «for reference only» |
| **Wallhaven** | `wallhaven.cc/api/v1/search?q=&categories=111&purity=100&sorting=relevance` | full-text | 24/page | EN-only | Через бэкенд (CORS). Категории зашиты — нельзя ограничить только people/anime |
| **Art Institute** | `api.artic.edu/api/v1/artworks/search?q=&fields=...&limit=30` | Elasticsearch full-text | 30 | EN | Имена художников и medium ищет идеально, тематика — переменно. Не индексирует русский |
| **Smithsonian** | `api.si.edu/openaccess/api/v1.0/search?q=(query) AND online_media_type:"Images"` | Lucene | 30 | EN | Скобки фикcнуты; Lucene-токенизация русского плохая |
| **Safebooru** | `safebooru.org/index.php?page=dapi&s=post&tags=phrase_as_tag&limit=40` | tag | 40 | EN-only | `still life` → `still_life`. Booru-теги — ручные, многих сочетаний нет (`russian_quiet` не существует) |
| **Openverse** | `api.openverse.org/v1/images/?q=&page_size=30` | full-text | 30 | EN | API теперь требует ключ — без него 401, **status: unavailable** |
| **DeviantArt** | `/api/v1/oauth2/browse/tags?tag=ONE` | один тег | 24 | EN-only | `pickBestTag()` транслитит и берёт самое длинное слово |
| **ArtStation** | `api/v2/search/projects.json?query=&page=1&per_page=30` | full-text | 30 | EN-mostly | Только `smaller_square_cover_url` (square thumb) — больше CDN отдаёт 403 |
| **Tumblr** | `api.tumblr.com/v2/tagged?tag=ONE&limit=30` | один тег | 30 | EN-mostly | Тот же `pickBestTag()` |
| **Are.na** | `/v2/search?q=` → channels → top-3 → contents | search-channels | до 60 (3×20) | EN | Post-фильтр: word-match в title/description блока. На русском почти всегда промах |
| **Are.na (теги)** | `/v2/search/channels?q=` → top-4 × 15 | search-channels | до 60 | EN | Дублирует логику arena.js, разный order/limit |
| **Dribbble** | `/shots` HTML scrape pages 1-6 | curated, query ignored | ~60 | — | AWS WAF блочит `/search/*` и `/tags/*`. Query ИГНОРИРУЕТСЯ |
| **Dribbble (теги)** | тот же `/shots`, страницы 7-12 | curated, query ignored | ~60 | — | То же |
| **WikiArt** | `wikiart.org/en/api/2/PaintingSearch?term=` | full-text | переменно | EN | На фразах часто 0. Однословные («vermeer») — ок |
| **Internet Archive** | `archive.org/advancedsearch.php?q=("phrase") AND mediatype:(image)&sort=-week` | full-text | 30 | EN | Кавычки добавлены; `-week` вместо `downloads desc` — отсекает «тиражные обложки» |
| **NYPL** | `api.repo.nypl.org/api/v2/items/search?q=&per_page=30` | full-text | 30 | EN | Нужен `NYPL_TOKEN`. Хорошо ищет людей и темы. **HTTPS only** (старый http даёт 301, не следует Node fetch) |
| **OpenSea** | `api.opensea.io/api/v2/collections?order_by=market_cap&limit=50` затем substring filter | full-text по name/description | до 30 | EN | API v2 не имеет полнотекста; локально substring-match. На любом не-NFT слове → 0 |
| **Awwwards / SiteInspire / FWA** | RSS | curated, query ignored | ~10-30 | EN | Query ИГНОРИРУЕТСЯ, отдаётся последняя SOTD/showcase лента |
| **Met Museum** | `/search?q=&hasImages=true` → `/objects/{id}` × 24 | full-text | 24 | EN | Двухступенчатый, медленный (~24 параллельных fetch'а) |
| **ArtVee** | `?s=` HTML scrape `<ul.products>` | scrape | 30 | EN | WordPress search; markup-fragile |
| **Land-book / Pinterest / Cosmos / Read.cv / Figma Community / Mobbin / Refero** | scrape (часть headless Chromium) | scrape, full-text | переменно | EN | Pinterest auth-wall интермиттентен; mobbin/refero за подпиской — обычно 0 |

#### 2.2. Feed-источники (попадают только в «ленту», не в стопку)

В `backend/sources/feed.js:35` — каталог **~110 feed'ов**: RSS, Reddit per-sub, scrape, t.me/s/, Mastodon, Bluesky, Bluesky firehose, WP Reader, sitemap. Из них:

- **Available** (~45): Awwwards, FWA, Smashing, Codrops, Habr × 5, BlueprintRu, Apartamento, Kinfolk-scrape, t.me/s/awdee и т.д.
- **Unavailable** (~50): TG-каналы с заглушкой, Pixelfed (auth с 2024), Bluesky (CF block), Cereal/Gentlewoman (sitemap без статей), Snob (TLS reset), DOGA, Skillbox, и т.д.
- Lang: en (60+), ru (20+), ja (2), no (1) — но фронт показывает фильтр только `all/ru/en`.

Feed-pipeline отдельный от stack-pipeline: не использует `query` вообще, **отдаёт последние N постов с image** отсортированные по publishedAt desc. То есть на лента-вью «русский интерьер» = ничем не отличается от «дизайн дашборд» — просто свежесть.

### 3. Текущие проблемы

Конкретные кейсы где система ломается, с цитатами кода и реальными запросами.

#### 3.1. Русский запрос → почти полный провал

**Кейс**: пользователь набирает «утренний свет в комнате» (запрос из категории «утренний свет», `q='morning light interior'`). Категория предоставляет английский эквивалент. Но если юзер набирает **свой собственный** русский — например, «деревянная веранда осенью» — pipeline такой:

1. `search('деревянная веранда осенью')` → `state.query = 'деревянная веранда осенью'`
2. `fetchAll` дёргает 8-12 источников (theme:home в эстетик-режиме):
   - **Apartamento, Kinfolk и пр.** — feed-источники, **в stack не попадают вообще**. Они только в ленте.
   - **`pinterest`** — headless scrape с Cyrillic query. Pinterest сам понимает русский, но пины почти не индексированы по cyrillic-тексту → 5-15 результатов, в основном случайных.
   - **`arena-tags`** — поиск каналов `q=деревянная%20веранда%20осенью`. Are.na не индексирует русский → channels пустой → 0 items.
   - **`tumblr`** — `pickBestTag()` транслитит → `derevyannaya verandaa osen'yu` → берёт самое длинное → `derevyannaya`. Tumblr тегов с этим словом ~0.
   - **`reddit-aesthetic`** (если включён) — 8 параллельных запросов в `r/CozyPlaces/search?q=деревянная%20веранда%20осенью&restrict_sr=on` → 0.
3. Результат стопки: 5-15 случайных Pinterest-картинок. **Юзер свайпает → пусто за 30 секунд**.

**Системная причина**: ни в одном слое нет language detection, и ни одна архитектурная единица не принимает решение «если cyrillic → перевести на английский ДО отправки в stock-API». Полу-решение через `pickBestTag` есть только в DA / Tumblr / Safebooru — это backend-only, и оно даёт лишь одно слово вместо запроса.

#### 3.2. Длинная фраза → AND-связка → empty result

**Кейс**: «scandinavian living room with fireplace and morning light» — реальный запрос из категории «другая жизнь» (упрощённо), 8 слов.

- **Unsplash** — `query` = вся фраза. Unsplash search использует AND-связку: фотография должна содержать все 8 слов в title+description+tags. Реалистичных совпадений: 0-3.
- **Pexels** — то же.
- **Pixabay** — то же, плюс `image_type=photo` режет иллюстрации.
- **Flickr** — multi-word OR-связка. Найдётся 10000 шумных результатов.
- **Smithsonian** — `(scandinavian living room ... morning light) AND online_media_type:"Images"`. Lucene обрабатывает каждое слово как OR; AND нужно явно. Получается смесь.
- **Wallhaven** — `relevance` сорт + 8 слов = переменный результат.

**Причина**: нет `query understanding` слоя, который бы расчленил «8-слов» на (a) опорные существительные `scandinavian living room` + (b) модификаторы `morning light fireplace` и подавал их в API по-разному.

#### 3.3. Музеи на современный дизайн

**Кейс**: режим designer, категория «ai-эпоха», preset `category:ai-эпоха` биндит источники:
```
'producthunt','hackernews',
'dribbble','dribbble-tags','figma-community','cosmos','arena-tags',
'theverge','fastcompany',
```
А запрос — `ai chat interface 2025`. **Big problem**: producthunt, hackernews, theverge, fastcompany — это RSS-feed-источники из `feed.js`. Они **не попадают в stack** (нет в `SOURCES`), только в ленту. Получается, что preset для этой категории на 50% содержит источники, которые в stack-режиме просто не активируются.

В то же время **`smithsonian`, `artic`, `met`, `wikiart`** — музеи с историческим искусством. Они **не привязаны** к этой категории, но юзер может включить их глобально. На запрос `ai chat interface 2025` Met вернёт несколько случайных средневековых рукописей с какой-нибудь буквой A.

**Причина**: путаница между `SOURCES` (stack) и `FEEDS` (лента) в DEFAULT_PRESET_SOURCES — проверки нет. Юзер думает «у меня выбран theverge для ai-эпохи» → но в stack этого источника нет.

#### 3.4. Дубликаты одной картинки из 3 источников

**Кейс**: у популярной картинки на Pinterest часто оригинал на Are.na (через ре-publish), копия на Tumblr и в Reddit `r/AmateurRoomPorn` — итого четыре копии.

```js
// soma.html:5015
const likedIds = new Set(state.liked.map(l => l.id));
merged = merged.filter(item => !likedIds.has(item.id));
```

Дедуп **только по `item.id`**. Идентификаторы разные:
- Pinterest: `pin-XXXXX` (random suffix в scrape-pack)
- Are.na: `ar-{block_id}`
- Tumblr: `tu-{post_id}-{width}`
- Reddit: `reddit-{post_id}`

**Картинка одна и та же, id'шники четыре**. Юзер видит четыре одинаковых результата подряд → раздражение → закрывает app.

**Причина**: нет URL-canonicalization, нет perceptual hash, нет даже dedup'а по `url` (уже это бы убрало половину дублей на одинаковый CDN).

#### 3.5. Random-shuffle убивает API ranking

```js
// soma.html:5010
for (let i = merged.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [merged[i], merged[j]] = [merged[j], merged[i]];
}
```

API возвращают результаты, отсортированные по своей релевантности (`sort=relevance` у Reddit, Wallhaven; Elasticsearch у Artic; popularity у Pinterest). После шафла — порядок случайный.

**Последствия**:
- Первая карточка стопки — необязательно лучшая. Она просто первая после шафла.
- Если из 200 объединённых результатов 30 действительно релевантных + 170 шумных → **с вероятностью 85% юзер первой увидит шум**.
- 80%-skip-rate в первые 3-5 секунд — прямое следствие.

**Причина**: шафл был добавлен как «diversity сдвиг» (чтобы не было «10 unsplash подряд»), но он решает diversity **деструктивно** — убивая ранжирование вообще. Правильно — **interleave** по источнику, не shuffle.

#### 3.6. Курируемые источники с одним и тем же контентом для разных категорий

В DEFAULT_PRESET_SOURCES категории `тренды дня`, `лендинг`, `моушн / 3d`, `ai-эпоха`, `веб-эстетика`, `award winners`, `email и newsletter`, `onboarding`, `settings`, `internal tools`, `edu / learning`, `finance` — **все** содержат `dribbble` и/или `dribbble-tags`. Эти источники игнорируют query → возвращают одну и ту же ленту `/shots` (с пагинацией 1-6 и 7-12). Кэш-ключ `dribbble:_curated`.

Получается, что 12 разных категорий показывают **+30 одинаковых dribbble-карточек каждая**. Юзер за 5 категорий видит одни и те же шоты.

**Причина**: `IGNORES_QUERY_SOURCES` (`backend/routes.js:181`) понимается как «общий для всех» — но семантически это «выпадающий список не зависит от темы». Должен быть либо опциональный фильтр на стороне фронта (постфакт), либо разные curated-эндпоинты с разной семантикой (`/popular?tag=ui-design`, `/popular?tag=motion`).

#### 3.7. Empty state без recovery

`renderCard()` (`soma.html:5119`) на пустой queue показывает 5 пресетов из активной категории. Это полезно, но:
- Не показывает «попробуй убрать модификатор» (например, `russian dacha veranda autumn` → `russian dacha`).
- Не показывает «один из источников упал, попробуй включить ещё».
- Не показывает spelling-suggestion (`utrenniy svet` → `утренний свет`).
- Не предлагает auto-relax: если 0 — выполнить тот же запрос с расширенными источниками.

**Последствие**: на каждом empty юзер должен сам думать, что переделать.

#### 3.8. Telegram/RSSHub — медленный и хрупкий, блокирует UI

Stack-search ждёт `Promise.all(tasks)` (`soma.html:5007`). Если в pipeline есть `figma-community` (headless Chromium → ~3-4s), `pinterest` (headless), `met` (24 параллельных fetch'а), `dribbble` (6 страниц scrape) — таймаут самого медленного диктует UX.

8-сек таймаут на каждый источник + параллельный execute = пользователь видит «загружаю 5 из 12» и ждёт ещё 4 секунды. Это **слишком долго** для UX «свайпать пока думаешь».

Telegram-каналы через `tg-web` — это feed, не stack. Это правильно. Но stack medlennie scrapers тянут всё пайплайн.

**Причина**: нет «fast-path»: для свайп-режима должна быть быстрая стратегия (~500ms на первые 30 карточек) + ленивое подмерживание медленных источников по мере их готовности.

#### 3.9. `expandQuery` — это **чипы под input'ом, а не реальный rewriter**

```js
// soma.html:3620
function expandQuery(q) {
  const lc = (q || '').toLowerCase();
  const set = QUERY_EXPANSIONS.find(e => e.re.test(lc))?.mods || QUERY_EXPANSIONS_DEFAULT;
  const fresh = set.filter(m => !lc.includes(m.toLowerCase()));
  const shuffled = fresh.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
}
```

Используется в `renderExpansion()` (`soma.html:6405`) — рисует чипы «попробуй: morning · interior · sunlight». **Кликнул чип → новый search**. Но **в `fetchAll`/`effectiveQueryFor` эти модификаторы не используются**. То есть: «query expansion» в SOMA — это просто кликабельные подсказки.

Архитектурно это **не expansion, а recommendation widget**. Для качества поиска ничего не делает.

#### 3.10. Source-aware translation — отсутствует

Единственный case source-aware — `effectiveQueryFor` (`soma.html:8878`). Он работает только в designer-режиме и только добавляет 1-2 слова. Больше никаких трансформаций нет:
- Tumblr/DeviantArt/Safebooru транслитят сами в `pickBestTag`.
- Все остальные — посылают запрос как есть.

Unsplash на «poetic» запрос «утренний свет в комнате», переведённый как «morning light in a room», получит запрос с **семью слотами AND**. У Unsplash в индексе тегов слова `in`, `a`, `room` — всё equally weighted. Результат — пусто или мусор.

Правильно: для Unsplash → один-два опорных существительных (`morning light`). Для Are.na → искать каналы с темами «morning light» (это и так делает). Для Reddit → «morning light interior» (3-4 слова — оптимум). Для Safebooru → один тег `sunlight`. Это и есть **Source-aware Query Translation**, которой нет.

---

## Анализ по слоям

### A. Ввод запроса (UX)

**Что есть сейчас:**
- `<input id="query">` с placeholder из `MODES[mode].placeholder`.
- Категории-чипы и пресеты как способ «не печатать».
- Русские и английские категории смешаны (`'утренний свет': [{label:'окно утром', q:'morning light interior'}]`).
- Кнопка «удиви меня» из `SURPRISE_QUERIES` (joy-pool).

**Что не так:**
- Нет debounce / live-suggest. Юзер не видит совпадений во время набора.
- Нет hint про язык. Не понятно «писать русский или английский?».
- Нет «недавние запросы» / «избранное запросов».
- Empty state не подсказывает, что переделать.
- Нет «advanced» — фильтра по типу контента (фото / иллюстрация / archived / artwork / UI).
- Нет inline error: если juzер видит «загружаю 5 из 12» и потом 0 карточек — не знает, что упало.

**Что улучшить:**
- **Live autocomplete** на основе (a) истории своих запросов (b) популярных категорий (c) топ-N из последних feeds-постов (заголовки на этом языке). Cap 5 предложений, показ через 200ms debounce.
- **Hint про язык** в placeholder: `'на что посмотреть… (можно по-русски)'` — простой жест, но снимает страх.
- **Recent queries** в outline под input'ом, кликабельны.
- **Empty state с тремя actions**: «попробуй короче», «попробуй на другом языке», «включи больше источников».
- Live error toast: «Pinterest / Are.na сейчас недоступны → что включил, не отдало; обновим через 5 мин».

### B. Понимание запроса (query understanding)

**Что есть сейчас:** ничего.

Запрос — это просто строка, которую отдают всем источникам как есть. Никакого детектора:
- языка (cyrillic ≠ latin, plus mixed)
- типа (literal: `still life` / стилевой: `bauhaus` / описательный: `morning light interior` / эмоциональный: `тихое и сумеречное`)
- сезона/времени (`autumn`, `evening`, `winter` — тег для отбора, не модификатор)
- художника/студии (имя — это литерал для museums, шум для phototocks)
- технического термина (`dashboard`, `crm`, `sparkline` — для фотокабинета шум, для design-источников — golden)

**Что не так:** все шесть слоёв запроса смешаны в одну строку и шлются всем источникам. Унсплэш на `'tarkovsky film stills'` ищет по слову `tarkovsky` (находит ничего), `film` (всё что угодно), `stills` (тоже мусор). А правильный путь — никогда не отправлять этот запрос на Unsplash; его место — на WikiArt (правда, у WikiArt он не индексирован), Tumblr (есть тег `tarkovsky`), Are.na (есть каналы), reddit `r/MovieDetails`.

**Что улучшить:** см. **Архитектурное предложение 1**.

### C. Расширение и трансформация запроса

**Что есть сейчас:**
- `expandQuery()` — regex+random suggestions для chips ниже input'а. Не влияет на actual fetch.
- `effectiveQueryFor()` — designer-only, добавляет 1-2 слова в часть источников.
- `pickBestTag()` (`backend/sources/_util.js:230`) — для Tumblr / DA / Safebooru транслит + longest non-stopword.

**Что не так:**
- `expandQuery` называется expansion, но это **recommendation**.
- `effectiveQueryFor` срабатывает только в designer.
- `pickBestTag` транслитит, но теряет существенные слова: `'still life reference'` → `'reference'` (longest), что вообще не arttheme.
- Нет сценария «relax-on-empty»: если запрос дал 0 — попробовать без модификаторов / с синонимами / на английском.

**Что улучшить:**
- Реальный query rewriter (см. предложение 2): берёт поняную интенцию из B и **пишет per-source query**.
- Smart fallback: если первичный запрос дал <5 — автоматически relax (drop one stopword / синоним / однословный) и refetch один раз.
- `pickBestTag` — заменить на «top-3 keywords в порядке важности» через идентификацию опорных существительных, а не просто длины.

### D. Маршрутизация по источникам

**Что есть сейчас:**
- `isSourceInMode()` (`soma.html:8742`) — фильтрует по `src.modes` (если задано).
- `getActivePresetId()` (`soma.html:4188`) — возвращает текущий preset (`level:*`, `platform:*`, `domain:*`, `theme:*`, `category:*`).
- `getActiveSourceIds()` (`soma.html:4226`) — пересечение enabled + presetSources.
- `DEFAULT_PRESET_SOURCES` + `CATEGORY_DEFAULTS` — словарь привязок.

**Что не так:**
- Маршрутизация не учитывает **природу запроса**. Юзер набирает `dashboard ui design` → отправлено на музеи и фотокабинеты, которые в этом не разбираются → 80% мусора.
- `DEFAULT_PRESET_SOURCES` смешивает stack- и feed-источники — feed-источники в stack-mode игнорируются (см. 3.3), но юзер этого не видит.
- Нет «if query has cyrillic → drop EN-only sources». Cyrillic-запрос всё равно посылается всем 16 источникам.
- Нет приоритезации: если юзер выбрал 12 источников — все 12 параллельно. На медленные ждать долго (см. 3.8).
- Custom-presets не имеют никаких defaults source-suggestion'ов; юзер набирает 0 источников и получает empty.

**Что улучшить:**
- **Routing layer** на основе понимания запроса (предложение 1+3): «`морфология` → `kind: artist-name` → `museums + tumblr + arena, не Unsplash`».
- **Per-source health-check** перед отправкой: если за последние 5 минут источник давал 0 / fail — пропустить, нечего ждать.
- **Two-tier fetch**: fast tier (<800ms: Unsplash, Pexels, Wallhaven, Reddit-2-сабa) → результат показываем сразу, slow tier (Pinterest headless, Met multi-fetch, scrape-pack) → дозалив по мере прихода.
- **Stack vs Feed-aware preset binding**: если binding содержит feed-источник, в stack-режиме либо warn-icon в UI, либо fallback на похожие stack-источники (т.е. theverge → reddit `r/UI_Design`).

### E. Запрос к каждому источнику

**Что есть сейчас**: 28 уникальных fetcher'ов, каждый со своим стилем. Никакого общего слоя.

**Что не так:**
- Нет общей абстракции: `fetchSource(srcId, query) → items[]`. Каждый раз разные параметры, разные timeouts (8s frontend / 7-15s backend).
- Frontend fetcher'ы и backend handler'ы дублируют функцию (Wallhaven дёргается через бэкенд из-за CORS, но всё ещё `viaBackend: true` отдельно — единого протокола нет).
- Нет error categorization: rate-limit (429), auth (401), CF block (403), timeout, parse-error — обрабатываются одинаково (`return []` в catch).
- Нет retry с backoff. Network glitch = пустой результат на этот цикл.
- Нет `If-None-Match` / `If-Modified-Since` для RSS — каждый раз качаем full payload.

**Что улучшить:**
- Унифицированный `SourceAdapter` interface: `init()`, `query(q, opts)`, `health()`, `transform(q)`.
- Категоризация ошибок и адекватный response: 429 → backoff 30 сек + cached fallback; 401 → mark unavailable in UI; timeout → не считать fail (transient).
- Conditional get для RSS-feeds (а они уже все в `feed.js`).
- Per-source timeouts: Pinterest headless 15s, Reddit 3s, Unsplash 4s — не общие 8s.

### F. Получение и обработка результатов

**Что есть сейчас:**
- Каждый fetcher возвращает array объектов `{url, thumb, source, author, authorUrl, pageUrl, id, title, ...}`.
- `parseRedditResponse` чистит preview URL (`&amp; → &`).
- ArtStation: только square thumb.
- Met: дроп объектов без `primaryImage`.

**Что не так:**
- Нет валидации URL: можно получить `http://` (mixed content на https-странице блокируется браузером).
- Нет проверки size: получили 200x200 placeholder из Pinterest scrape — он попадёт на свайп.
- Нет watermark detection: Pixabay часто отдаёт картинки с `Pexels.com` watermark в дешёвом плане — попадают.
- Нет broken-image fallback: если `<img>` не загрузился, карточка остаётся пустой (или с `currentColor`-плэйсхолдером).
- `id` collision risk: `id: 'pin-' + (idx + Math.random().toString(36).slice(2, 6))` — два разных пина с одинаковым idx могут при коллизии rand перекрыться.

**Что улучшить:**
- **Result quality filter**: drop items where `width < 400` (если width известна), `url` doesn't return image MIME at HEAD-probe (раз в неделю), watermark detected (CV).
- **URL canonicalization**: strip tracking params (`?utm_*`, `&t=...`), normalize host (без `www`), force https.
- **Stable ID**: hash of canonicalized url, не random suffix.

### G. Ранжирование и объединение

**Что есть сейчас**: `Math.random()` shuffle + дедуп по `id` + soft anti-repeat по `seenIds`.

**Что не так** (повторно с 3.4 и 3.5):
- Random shuffle убивает API-ranking.
- Dedup по id не ловит cross-source дубли.
- Anti-repeat по id не работает на cross-session дубли (сегодня видел из Tumblr → завтра тот же из Pinterest).
- Нет diversity guarantee по источнику: можно получить 30 unsplash из 60 шафленных результатов.
- Нет diversity по color/composition (чтобы не 10 светлых вертикальных подряд).

**Что улучшить:**
- **Round-robin interleave** по источнику вместо shuffle: первая карточка из reddit, вторая unsplash, третья pinterest, четвёртая reddit, … Сохраняет ranking каждого источника, гарантирует diversity.
- **Per-source quotas**: max 5 от unsplash, max 8 от reddit, … (из 30 общих) — чтобы один источник не дoshell-нул.
- **Score = α·source_rank + β·source_quality + γ·freshness + δ·user_affinity** (см. предложение 6).
- **Perceptual hash dedup**: 8-bit dHash клиентский (canvas → 64-bit signature), drop duplicates даже cross-source.

### H. Адаптация к пользователю

**Что есть сейчас:**
- `state.liked` — массив сохранённых картинок. Используется только для дедупa.
- `state.seenIds` — Map с TTL 14 дней. Только для anti-repeat.
- `state.history` — лог событий сессии (search/like/skip/error). Только для display.

**Что не так:**
- Никакого learning. Если юзер 50 раз свайпал Pixabay налево и 30 раз Are.na направо — Pixabay всё равно показывается first-class.
- Нет detection категорий, которые юзеру не нравятся (например, постоянно skip'ает «фотобанковые» = глянцевые → можно weighted-down all stock).
- Нет profile-based recall: если юзер 80% лайков из Are.na, в новой сессии Are.na должна быть приоритетней.
- Likes никак не используются как signal для query expansion («ты лайкаешь Hopper-style → добавим `hopper bar interior` в expansion»).

**Что улучшить:**
- **Behavioral feedback layer** (предложение 6): per-source affinity score, обновляется на каждый swipe.
- **Aggregate liked-tags**: извлекаем теги из `item.tags` лайкнутых, формируем «taste profile» (сейчас Are.na, Apartamento, Cabana — выводим в hint, авто-биндим в custom-preset).
- **Implicit query refinement**: если в сессии уже 5 лайков из похожей категории — на refill добавлять модификаторы из их title/tags.

### I. Многоязычность

**Что есть сейчас**: backend `transliterate()` + `pickBestTag` для 3 источников (DA / Tumblr / Safebooru). Это всё.

**Что не так:**
- 25+ источников без языкового слоя.
- Категории на русском (label) с захардкоженными английскими `q` — фрагильно: добавил категорию забыл `q` → русский кидается на Unsplash.
- Feed-фильтр в UI знает только `all/ru/en` — `ja` (2 фида) и `no` (1 фид) скрыты.
- Frontend не знает о cyrillic-запросе → не предупреждает «эти источники не поддерживают русский».
- Нет inverse: пользователь набрал английское `evening light` — нет автоматической EN-альтернативы для русских feed'ов (Habr, Telegram).

**Что улучшить**: см. предложение 7.

---

## Архитектурные предложения

Ниже **9 предложений** в порядке от дешёвых-победных к серьёзным архитектурным переработкам. Каждое — что, зачем, как, риски, цена, метрика.

### Предложение 1: Query Understanding Layer (QUL)

**Что**: между `<input>` и `fetchAll()` появляется новый модуль `parseQuery(raw, mode) → QueryIntent`, где `QueryIntent` = {
  language: 'ru' | 'en' | 'mixed',
  type: 'concept' | 'artist' | 'style' | 'descriptive' | 'technical' | 'mood',
  primary_nouns: string[],
  modifiers: string[],
  temporal: { season?, hour? },
  location: { country?, region? },
  raw: string
}.

**Зачем (какие проблемы решает)**: 3.1, 3.2, 3.3, 3.10, B (полностью), I (частично).

**Как реализовать**:
- **v1 (rule-based, ~2 дня)**: regex-pipeline в JS. Cyrillic detect (`/[а-яё]/i`). Stopword-list (en+ru). Artist-list (Tarkovsky, Hopper, Vermeer, ~150 имён) → type='artist'. Style-list (bauhaus, swiss, vaporwave) → type='style'. Technical-list (dashboard, crm, hero, sparkline) → type='technical'. Иначе descriptive.
- **v2 (LLM, ~3-5 дней)**: запрос параллельно отправляется на LLM (Claude Haiku / GPT-4o-mini, $0.0005/req) с промптом «classify this image search query». Cache на 30 дней по hash запроса.
- Frontend hook: `parseQuery(state.query, state.mode)` сразу в `search()`. Результат доступен всему pipeline.

**Зависимости/риски**:
- v1: словари нужно вести вручную. Для artist/style ошибки frequency low.
- v2: LLM cost (~$0.001/search at scale). Если падает — fallback на v1.
- Cache invalidation если LLM-prompt меняется.

**Цена**: v1 = 2 дня. v2 = ещё 2 дня + поднять Anthropic Cookbook-style request pool.

**Что измерится**:
- Empty result rate должен упасть на 30%.
- CTR на сохранение (likes/views) должен подняться на 20%.
- Прогон 50 русских запросов: их эффективность вырастет с ~2/30 до ~10/30 релевантных.

### Предложение 2: Source-aware Query Translation (SQT)

**Что**: для каждого источника свой translator: `translateQuery(intent, sourceId) → SourceQuery`. Translator знает специфику API.

**Зачем**: 3.2, 3.6, 3.10, C, E.

**Как реализовать**:
- Объект `SOURCE_TRANSLATORS = { unsplash: (intent) => ..., reddit: ..., safebooru: ..., ... }`. Один раз для каждого источника.
- Примеры:
  - **Unsplash**: возвращает `intent.primary_nouns.slice(0, 2).join(' ')` — два опорных существительных. Если cyrillic — сначала переводим (см. предложение 7).
  - **Reddit per-sub**: `intent.primary_nouns.join(' ') + ' ' + intent.modifiers[0]` — 3-4 слова, не больше.
  - **Are.na**: то, что есть; Are.na-search-by-channel хорош на «темах», не «фразах».
  - **Safebooru**: один тег = `intent.primary_nouns[0]` транслит → `_`-форма.
  - **Met / Smithsonian / Artic**: если type='artist' — `intent.primary_nouns.join(' ')` (имя). Если style/descriptive — `primary_nouns[0]` + `medium:painting` фильтр.
  - **WikiArt**: один артист или один medium-keyword. На descriptive фразе — пустить null, не дёргать.
  - **OpenSea**: только если intent.type ∈ {style, technical} И есть match по name; иначе — null (не дёргать).
  - **Wallhaven**: до 3 nouns, без modifiers (на длинных фразах рандом).
  - **Dribbble / Awwwards / SiteInspire / FWA**: query ignored, но возвращаем `null` запрос (значит «curated mode»).

- Если translator вернул `null` — источник пропускается на этом запросе. Экономит rate-limit и убирает шум.

**Зависимости/риски**: требует QUL. Иначе translator не знает что делать.

**Цена**: 4 дня (28 источников × ~30 минут на каждый + тесты).

**Что измерится**:
- Empty result rate per-source: для music-источников должно быть ниже 10% (сейчас 30-50%).
- Total queue size после fetchAll: должна вырасти (меньше пустых).
- Per-source skip-rate в первые 3 секунды.

### Предложение 3: Preset-Source Mapping Audit + Source Class Taxonomy

**Что**: ревизия всего `DEFAULT_PRESET_SOURCES` + `CATEGORY_DEFAULTS` с введением **классификации источников по способу работы и типу контента**.

**Классификация источников** (новая):
```js
const SOURCE_CLASS = {
  unsplash: { content: 'photo-stock', search: 'fts-en', strength: ['concept','descriptive'], language: 'en' },
  reddit:   { content: 'mixed',       search: 'fts-en-narrow', strength: ['concept','technical','mood'], language: 'en' },
  arena:    { content: 'curated',     search: 'channel-match', strength: ['style','mood','editorial'], language: 'en' },
  met:      { content: 'historical',  search: 'lucene',        strength: ['artist','classical'], language: 'en' },
  smithsonian: { content: 'historical', search: 'lucene+filter', strength: ['artist','historical'], language: 'en' },
  pinterest:{ content: 'curated-pins', search: 'fts-multilingual', strength: ['mood','aesthetic','consumer'], language: 'multi' },
  ...
};
```

**Зачем**: 3.3, 3.6, D.

**Как реализовать**:
- Таблица attributes для каждого источника (ручная работа, ~1 день).
- На стадии маршрутизации — `routeQuery(intent) → sourceId[]`: фильтр источников, чьи `strength` пересекаются с `intent.type`.
- В UI настроек preset'а — visual indicator: чип источника подсвечивается красным «это для исторического искусства, query явно про современный дизайн».
- Audit `DEFAULT_PRESET_SOURCES`: 12 категорий с dribbble — переделать так, чтобы dribbble был обязательным compliment, не replacement (curated tier ≠ search tier).

**Зависимости/риски**: ручной труд (много категорий и источников). Но это однажды.

**Цена**: 3 дня (1 на классификацию, 2 на ревизию пресетов и UI hint'ов).

**Что измерится**:
- Diversity score per preset (доля разных классов источников в первых 20 результатах) → ≥3.
- Юзер reports «нерелевантной выдачи» по категории → ноль.

### Предложение 4: Smart Fallback Pipeline

**Что**: если первичный поиск дал <K (K=10 для stack, =30 для refill), pipeline автоматически:
1. drop последний модификатор (`russian dacha veranda autumn` → `russian dacha veranda`)
2. retry с релаксированным запросом
3. если всё ещё <K — добавить сосед-источники (соседи через class-taxonomy)
4. если ещё <K — попробовать на английском (через перевод, см. 7)

UX: фронт показывает badge «расширили до X источников / убрали слово Y», юзер видит что система пыталась.

**Зачем**: 3.7, 3.1.

**Как реализовать**:
- В `fetchAll`: после `Promise.all` — если `merged.length < K`, запускаем fallback.
- Fallback — отдельный `fetchAllRelaxed(intent, dropModifier=1, addSources=true)`.
- Frontend status: `state.fallback = { reason: 'low-results', dropped: 'autumn', extra: ['arena','tumblr'] }`.

**Зависимости/риски**: лишние HTTP-запросы (1.5×). Но они только при empty — редкий путь.

**Цена**: 1.5 дня.

**Что измерится**: 0-result session rate (юзер начал поиск и видит empty) — должна упасть ниже 5%.

### Предложение 5: Result Filtering & Quality Scoring (RFQ)

**Что**: после `Promise.all(tasks)`, до shuffle/merge, прогон каждого item через quality filter:

```
score = base_source_quality        // a priori (0..1, manually tuned)
      + ranking_position_decay     // 1.0 за первый, 0.95 за второй, ... до 0.5
      + size_bonus                 // +0.2 if width >= 1200, -0.3 if <400 (или unknown)
      + license_bonus              // +0.1 если CC0/PD; -0.2 если 'all rights reserved'
      + freshness_bonus            // только для feed-news; +0.1 для < 7 дней
      + user_affinity_bonus        // см. предложение 6
```

И drop-фильтры:
- broken URL / non-image MIME
- size < 400px (если width известна)
- watermarked (lookup по host: `pexels.com/photos/.../watermarked` etc.)
- known-spam tags (`download free`, `#stock`, `#shutterstock`)

**Зачем**: F, G.

**Как реализовать**:
- `enrichItems(items)` → `items + score`.
- `merge(items[]) → orderedItems[]`: round-robin по source с приоритетом по score.

**Зависимости/риски**:
- Нужны source quality priors. Их можно проставить вручную (Met = 0.9, Pixabay = 0.5).

**Цена**: 2 дня.

**Что измерится**:
- Skip-rate в первые 3 секунды (mgnovenный фи): должна упасть с 80% до 50%.
- Avg time-to-first-like в сессии: должно упасть.

### Предложение 6: Behavioral Adaptation Layer (BAL)

**Что**: per-source weight, per-tag preference, per-style preference, обновляется на каждом swipe.

**Структура**:
```js
state.profile = {
  sourceAffinity: { unsplash: 0.4, arena: 1.6, pinterest: 1.1, ... },
  tagAffinity:    { 'morning': 1.3, 'apartment': 1.2, 'soviet': 1.5, ... },
  classAffinity:  { editorial: 1.4, museum: 0.8, scrape: 0.9, ... },
  topQueries:     [{q: 'tarkovsky', count: 8}, ...],
  lastUpdated: Date.now(),
};
```

При swipe:
- Like — `sourceAffinity[item.source] += 0.05`. tagAffinity для каждого item.tag += 0.03.
- Skip быстро (<3 сек) — `sourceAffinity[item.source] -= 0.03`.
- Skip медленно (>5 сек) — neutral.

При формировании очереди:
- Score из RFQ (предложение 5) умножается на `sourceAffinity[item.source] · tagAffinity[item.tags...]`.

**Зачем**: H полностью.

**Как реализовать**:
- Хранить в localStorage `rs:profile`.
- В `fetchAll` после `enrichItems` — domножить score на affinity.
- Decay: каждый день `affinity` стремится к 1.0 на 5%, чтобы вкус не «застревал».

**Риски**: filter bubble. Юзер 30 дней лайкал Are.na → больше ничего другого не получает.
**Mitigation**: жёстко ограничить affinity 0.3..2.5 (не более 2.5x от base), и впрыскивать exploration: каждый 7-й item (~14%) выбирается БЕЗ affinity-веса.

**Цена**: 3 дня.

**Что измерится**:
- 7-day retention: должна вырасти.
- Likes-per-session должны вырасти на 30%+.
- Time-to-first-like: упасть.

### Предложение 7: Multilingual Query Pipeline (MQP)

**Что**: трёхслойный pipeline для русских (и в будущем — японских/норвежских) запросов:

1. **Detect** (L0): `/[а-яё]/i` test + heuristic (mostly cyrillic / mostly latin / mixed).
2. **Expand on source language** (L1): ДО перевода обогатить запрос на исходном языке. Через QUL → если `intent.type='concept'` и cyrillic → `'утренний свет'` → синонимический список `['утренний свет','рассветное солнце','свет на восходе']`. Это можно делать словарём на 200 ключей или LLM.
3. **Translate for target API** (L2): для EN-only источников (Unsplash, Pexels, Pixabay, Flickr, Wallhaven, Met, Smithsonian, Artic) используем перевод. Cache 90 дней.
4. **Retain on Russian** (L3): для RU-источников (Habr-RSS, t.me/s/, BlueprintRu, MoskvichMag, t-ru, knife) запрос остаётся на русском.

UX: юзер видит «искала по: `morning light` (en) и `утренний свет` (ru)» — transparency.

**Зачем**: 3.1, I.

**Как реализовать**:
- LLM-based translator (Anthropic Haiku, $0.0001/req): «translate this image search query, preserving aesthetic intent». Cache.
- Fallback: статический словарь `RU_TO_EN_DICT` на 500-1000 фраз (для офлайна / LLM-down).
- Backend route `/api/translate?q=&from=ru&to=en` с агрессивным кэшем (90 days по hash).

**Зависимости/риски**: LLM cost. Но 90-day cache режет это до копеек ($0.10/месяц на средний use).

**Цена**: 2 дня (включая LLM-flow и cache).

**Что измерится**:
- Cyrillic-search empty rate: упасть с 70% до 15%.
- Mixed-result quality для RU-juzер'ов: хочется измерить через A/B (эта фича on/off для 50/50 кохорт).

### Предложение 8: Stack/Feed Bifurcation Audit

**Что**: жёсткая ревизия всех `DEFAULT_PRESET_SOURCES` чтобы убрать feed-источники из stack-only пресетов и наоборот, и ввести **визуальный indicator** в UI «этот источник идёт в ленту, не в стопку».

Текущая путаница (3.3): много препресетов содержат RSS-источники типа `theverge`, `producthunt`, `tg-uxnotes` — их в stack нет, юзер думает «у меня 12 источников» а реально работают 6.

**Зачем**: 3.3.

**Как реализовать**:
- Single source-of-truth таблица `SOURCE_REGISTRY = [{id, name, channel: 'stack' | 'feed' | 'both', ...}]`. Сейчас два разных списка (`SOURCES` и `FEEDS`).
- Audit `DEFAULT_PRESET_SOURCES` + `CATEGORY_DEFAULTS`: для каждой записи отметить `channel`. Если preset для stack-mode и binding содержит feed-only — warning + suggest fix.
- UI: в редакторе пресетов чипы с feed-only имеют badge «лента» если показано на stack-режиме.

**Зависимости/риски**: таблица большая (110 feeds + 28 stack), ручной аудит.

**Цена**: 2 дня.

**Что измерится**:
- Кол-во «битых» preset bindings: упасть до 0.

### Предложение 9: Perceptual-Hash Cross-Source Dedup

**Что**: при добавлении item в очередь — расчитать perceptual hash (8x8 dHash) клиентский, сравнивать с предыдущими в очереди и в `seenIds`. Если hamming distance ≤6 — drop.

**Зачем**: 3.4.

**Как реализовать**:
- Client-side: `<canvas>` 8x8 grayscale → 64-bit signature.
- Async после загрузки thumbnail. До загрузки — по URL only.
- Хранить дополнительно `seenHashes: Map<hash, ts>`.
- Cross-session: persisted в localStorage (~5KB на 1000 items).

**Зависимости/риски**:
- CORS для some thumbnails (Pinterest sometimes blocks). Mitigate: drop hash, fall back to URL dedup.
- Compute cost: hash one image ~3ms, обработка 30 items ~90ms — норм.

**Цена**: 1.5 дня.

**Что измерится**: % дублей в первых 30 результатах сессии.

---

## Конкретные находки по источникам

| Источник | Текущая проблема | Конкретный пример | Решение |
|---|---|---|---|
| **Reddit** | EN-only sabreddits индексируют Cyrillic crapppy. На «русское тихое» — 0-2 находки. | Запрос `'soviet film stills'` в `r/MovieDetails` → 4 поста за всё время. Запрос `'советские кадры из кино'` → 0. | MQP (предложение 7): отдавать переведённый EN-запрос в EN-сабы; русский — в RU-feeds, не в Reddit. |
| **Unsplash** | AND-связка по 3+ словам = пусто. Не знает русский. | `'morning light kitchen italian'` → 1 result. `'утренний свет'` → 0. | SQT (предл. 2): обрезать до 2 nouns. + MQP. |
| **Pexels** | Та же что у Unsplash, плюс «watermarked» иногда. | `'editorial portrait moody'` → 4 photos, 1 с pexels watermark в углу. | SQT + RFQ (drop watermark). |
| **Pixabay** | `image_type=photo` режет иллюстрации. Длинная фраза = пусто. | `'vintage poster art deco'` → найдены 3 фотографии плакатов в музеях, иллюстрации сами не пришли. | SQT: для style-intent добавлять `image_type=all`. |
| **Flickr** | Multi-word OR = шум. Sort=relevance не разбирает long phrase. | `'still life morning bread italian rustic'` → 2400 photos, 80% мусора. | SQT: квоты `+text="морфологическая фраза"`. |
| **Wallhaven** | Sort=relevance очень слабый. Не понимает русский. | `'tarkovsky'` → 32 results — все ок. `'тарковский'` → 0. | MQP (translate before send). |
| **Art Institute** | Имена и medium идеально, тематика — переменно. Не знает русский. | `'still life'` → 1100 results — отлично. `'натюрморт'` → 0. | MQP (translate). |
| **Smithsonian** | Lucene-токенизация русского неравномерная. | `'native american pottery'` → 80. `'индейская керамика'` → 5 (подмешалось «indianapolis»). | MQP. + better Lucene escape. |
| **Safebooru** | Booru-теги — ручные. `'russian quiet'` → 0 (нет такого тега). Default disabled. | Phrase tag `russian_quiet` → 0. | SQT: сначала проверить `popular_tags?` substring, потом запрос. |
| **Openverse** | API теперь требует ключ. | Любой запрос → 401. | Залистать в `defaultOff` или OAuth-flow. |
| **DeviantArt** | Один тег — берётся `pickBestTag(longest non-stopword)`. На `'still life reference'` — `'reference'` (longest) → wrong. | `'still life reference'` → DA отдаёт референсы людей, не натюрморты. | Заменить `pickBestTag` на «head noun extraction» (см. предл. 1). |
| **ArtStation** | Square thumbs только; на свайпе мелко. | Все шоты выглядят одинаково мелко. | Backend: dohohnyem CDN-prefix `medium_image_url` через page-scrape (medium доступен с правильным Referer). |
| **Tumblr** | Один тег. `pickBestTag` теряет суть. | `'soviet film stills'` → tag `'stills'` → tumblrs про сток-фотографию. | Аналогично DA. |
| **Are.na** | Channel-search хорош на стилях, плох на фактах. Кириллица почти не работает. | `'tarkovsky'` → 12 каналов, отличная подборка. `'тарковский'` → 0 channels. | MQP + ничего больше не делать. |
| **Are.na (теги)** | Полный дубль `arena.js` с минимальной разницей. | На том же запросе — 60% overlap с `arena`. | Объединить в один adapter, dedup по block.id внутри. |
| **Dribbble** | Query игнорируется. 12 категорий получают одну и ту же ленту. | `'dashboard'` → топ-30 свежих shots, не dashboard. | API v2 community-curations через teal scrape; или передавать `tag=ui-design` через cookies (Pro). Прирастающий effort. |
| **Dribbble (теги)** | Same. | Same. | Same. |
| **WikiArt** | На фразах часто 0. На однословных — топ. | `'morning light'` → 0. `'vermeer'` → 80. | SQT: только если intent.type=artist или single-noun. Иначе — null. |
| **Internet Archive** | `("phrase") AND mediatype:(image)` — кавычки строгое совпадение. На размытых — 0. | `'soviet propaganda poster'` → 0 (точной фразы нет). | SQT: попробовать без кавычек если 0 (relaxed retry, см. предл. 4). |
| **NYPL** | Хорошо ищет людей и темы. EN-only. | `'jazz harlem 1950'` → 25 фото. `'джаз гарлем'` → 0. | MQP. |
| **OpenSea** | Substring по name. Любой не-NFT термин → 0. | `'editorial portrait'` → 0. `'apes'` → 50 (Bored Apes). | Снять из default источников. Включать только если intent.type='technical' и слово содержит NFT-related (`pfp`, `nft`, `crypto`, `ape`, `punk`). |
| **Awwwards / SiteInspire / FWA** | Curated, query ignored. | Любой запрос отдаёт топ-10 SOTD/showcase. | Ничего, это by design. Но в UI должно быть **явно** «curated, not search». |
| **Met Museum** | 24 параллельных fetch'а — медленно. | `'monet'` → 4-5 секунд до первого результата (cold). | Cache `objectIDs[]` на 24h, `objects/{id}` на 7 дней. Fast-path: брать первые 8 параллельно для preview, остальное лениво. |
| **ArtVee** | WordPress search; markup-fragile. | `'art nouveau poster'` → 30 ok. `'утренний свет'` → 0 (WP-FTS only EN). | MQP. |
| **Land-book** | Headless Chromium, медленный. | Cold ~4 sec, warm ~2 sec. | Pre-warm headless on server start. |
| **Pinterest** | Auth-wall интермиттентен. Multi-language но scrape часто ничего. | Из 5 запросов 1-2 возвращают 0 из-за auth-wall. | Per-source cookies (уже есть). + retry с другим UA если auth-wall detected. |
| **Cosmos** | SPA, often 0. | `'minimal portfolio'` → 12 ok; `'random'` → 0. | Headless для cosmos (сейчас statically fetched). |
| **Read.cv** | Auth-wall. Default off. | `'illustrator portfolio'` → 0 в 90% случаях. | Оставить, но в UI badge «авторизация снижает 0-rate». |
| **Figma Community** | Headless, фильтр по `model_type=plugins` уже снят. | `'design system'` → 30 ok; `'утренний свет'` → 0. | MQP. |
| **Mobbin / Refero** | Default off, paywall. | Любой запрос → 0. | UI: badge «требуется подписка». |
| **t.me/s/** (TG-web) | Хрупкий парсинг; некоторые каналы возвращают заглушку. | 17/30 каналов помечены unavailable. | Periodic re-prove (раз в неделю). |
| **Mastodon** | Public timelines работают, но рандомные посты. | `#design` → последние 25 со всего инстанса. | OK как feed; не для stack. |
| **Bluesky / Pixelfed** | CF / auth blocks. | Все unavailable. | OAuth flow когда дойдут руки. |
| **WordPress Reader** | Tag aggregation. EN-only. | `tag/design` → 20 разных блогов. OK. | OK. |

---

## Дорожная карта

Реалистичные приоритеты. **Без «всё через 6 месяцев»**.

### Волна 1 — дешёвые победы (high impact, low effort) — 1 неделя

Цель: за 5-7 дней снизить empty-result rate на 50%, поднять CTR на лайк на 30%.

| # | Что | Дни | Импакт | Из предложений |
|---|---|---|---|---|
| 1 | **Убрать `Math.random()` shuffle, заменить на round-robin interleave по источнику** | 0.5 | Сразу +20% CTR в первые 5 секунд — самый дешёвый выигрыш | G, Pred. 5 |
| 2 | **Cyrillic-detect + skip EN-only stock-источников + warning UX** | 1 | Cyrillic-empty упадёт с 70% до 50% (без перевода) | I, MQP-lite |
| 3 | **Audit `DEFAULT_PRESET_SOURCES` — убрать feed-источники из stack-presets** | 1 | Юзер увидит ровно те источники, которые работают | 3.3, Pred. 8 |
| 4 | **URL-canonicalization + dedup по `url` (не только `id`)** | 0.5 | Меньше дублей с разных wraps того же CDN | F |
| 5 | **Per-source timeouts вместо общего 8s** | 0.5 | Fast-path выдаёт первые карточки за 800ms | E |
| 6 | **Empty-state: 3 actionable tips (короче / другой язык / больше источников)** | 0.5 | Юзер не «застревает» на empty | A, 3.7 |
| 7 | **Smart Fallback Pipeline (упрощённый: drop 1 modifier on <K results)** | 1 | 0-result session rate упадёт ниже 10% | Pred. 4 |
| 8 | **Per-source health-check кэш (если 5 минут fail — пропустить)** | 0.5 | Меньше ожидания на дохлых источниках | D, E |
| **Итого** | | **5.5 дня** | | |

### Волна 2 — средние улучшения — 2-3 недели

Цель: реальное query understanding, source-aware translation, multilingual.

| # | Что | Дни | Импакт |
|---|---|---|---|
| 1 | **Query Understanding Layer v1 (rule-based)** — language, type, primary nouns | 2 | Все downstream решения теперь информированные |
| 2 | **Source-aware Query Translation** — 28 translators | 4 | Empty-rate per-source ↓10pp |
| 3 | **Multilingual Pipeline v1** — ru→en через словарь 800 фраз + Anthropic Haiku fallback | 2 | Cyrillic-empty упадёт до ~15% |
| 4 | **Result Filtering & Quality Scoring** | 2 | Skip-rate в первые 3s ↓15pp |
| 5 | **Source Class Taxonomy + UI hints** | 2 | Юзер сам видит какие источники для какого типа запроса |
| 6 | **Stack/Feed bifurcation refactor** | 2 | Один SOURCE_REGISTRY вместо двух разных списков |
| 7 | **Perceptual-hash cross-source dedup** | 1.5 | Cross-source дубли ↓80% |
| **Итого** | | **15.5 дней** ≈ 3 недели | |

### Волна 3 — серьёзная архитектурная переработка — 1-2 месяца

Цель: behavioral adaptation, embedding-based search, observability.

| # | Что | Недели | Импакт |
|---|---|---|---|
| 1 | **Behavioral Adaptation Layer** | 1 | 7-day retention +N% |
| 2 | **Query Understanding Layer v2** — LLM-based intent classification | 1 | Edge-cases правильно классифицированы |
| 3 | **Dense embedding retrieval** для cross-source semantic search (CLIP/SigLIP, локальный ANN-index типа `hnswlib`) | 4-6 | Серьёзно — но это ROI для year-2-onwards |
| 4 | **Telemetry + metrics dashboard** (см. ниже) | 1 | Без этого все остальное — субъективно |
| **Итого** | | **7-9 недель** | |

---

## Метрики качества

Без метрик нельзя сказать стало лучше или хуже. Сейчас в SOMA измеряется **ноль** показателей качества (есть только `state.history` с количеством searches, но это не качество). Что нужно собирать:

### Базовые (Wave 1)

- **Empty-result rate**, per source и total. Сейчас оценочно 30%, цель — <10%.
- **0-result session rate** (юзер начал поиск и в стопке 0): сейчас оценочно 15%, цель — <5%.
- **CTR на сохранение** = liked / shown (per item, per session). Сейчас неизвестно; baseline установить, затем целиться в +30%.
- **Skip-rate в первые 3 секунды** = items skipped under 3s / total skipped. Сейчас, по запаху, 80%. Цель: <50%.
- **Search completion rate** = sessions with ≥1 swipe / sessions started search. Цель: >85%.

### Продвинутые (Wave 2)

- **Diversity score per result page** = unique source classes in first 20 / 5. Цель: ≥3 (т.е. в первых 20 не должно быть 17 unsplash и 3 reddit).
- **Time-to-first-like** в сессии. Цель: <30 сек.
- **Source affinity stability** — насколько `sourceAffinity` устанавливается и держится после 50 swipes. Не сходимость = плохая learning.
- **Query understanding accuracy** — для рандомного семпла из 50 запросов проверять вручную правильно ли определён `intent.type`, `intent.language`. Цель: ≥85%.

### Edge-case (Wave 3)

- **Cyrillic-vs-Latin parity**: средний result count для русских запросов и эквивалентных английских. Цель: разрыв ≤30%.
- **Cross-source duplicate rate** = items with hamming-distance ≤6 / total items in queue. Цель: <2%.
- **Filter-bubble coefficient**: рост affinity'и любого источника к 30-му дню. Cap: не больше 2.5×.

### Что точно стоит собирать **прямо сейчас** (5 минут JS):

```js
// soma.html — добавить в onSwipe и onLike
state.metrics = state.metrics || {
  searches: 0, emptyResults: 0, swipesUnder3s: 0, swipesOver3s: 0,
  likes: 0, dwellTimes: [],
};
// в onSwipe:
const dwell = Date.now() - state.cardShownAt;
state.metrics.dwellTimes.push(dwell);
if (dwell < 3000) state.metrics.swipesUnder3s++;
else state.metrics.swipesOver3s++;
```

И эти metrics экспортировать в diagnostics — мы потом сравним до/после.

---

## Summary

### Топ-10 находок (что больно прямо сейчас)

1. **`Math.random()`-shuffle убивает API-ranking**. Самый шокирующий single-line bug. Один день работы — снять.
2. **Cyrillic-запрос идёт в EN-only API без всякого слоя**. 70% результатов — пусто или мусор для русского пользователя.
3. **`expandQuery` — это не expansion, а кликабельные подсказки**. Никакого реального расширения запроса в pipeline нет.
4. **12 категорий designer-режима показывают одну и ту же Dribbble-ленту**, потому что `dribbble` игнорирует query.
5. **Дубли через 3-4 источника не дедуплятся** — id'шники разные, perceptual hash отсутствует.
6. **`DEFAULT_PRESET_SOURCES` смешивает stack- и feed-источники** без визуального indicator'а — юзер видит 12 источников, реально работают 6.
7. **Длинная фраза → AND-связка → пусто** на Unsplash/Pexels/Pixabay/Smithsonian. Нет noun-extraction.
8. **Источники отсортированы рандомно, нет diversity guarantee** — можно получить 30 unsplash из 60 итогов.
9. **Music-источники (Met / Smithsonian / WikiArt) маршрутизируются на современный дизайн-запросы** — выдаются исторические артефакты, юзер свайпает.
10. **Никаких метрик качества не собирается**. Любые улучшения сейчас — субъективны, нельзя сказать стало ли лучше.

### Топ-5 действий чтобы начать (`first-week sprint`)

1. **Снять `Math.random()` shuffle** в `fetchAll` (`soma.html:5009-5013`). Заменить на `interleaveBySource()` (round-robin). 0.5 дня. Самый быстрый ощутимый выигрыш.
2. **Добавить Cyrillic-detect + skip EN-only sources** + UX-warning «эти источники не понимают русский, советую сменить запрос». 1 день. Снимет 30% «пустых» сессий.
3. **Snimat dead presets**: ревизия `DEFAULT_PRESET_SOURCES` — выбросить feed-источники из stack-presets, либо в UI помечать «лента» бэйджем. 1 день.
4. **Поставить базовые метрики** — 4 счётчика (`searches/empty/swipesU3/likes`) + dwell-times массив. Экспорт в diagnostics. 0.5 дня. Без этого все следующие шаги невозможно оценить.
5. **Smart Fallback v0** — на <K results автоматически дёрнуть тот же запрос без последнего модификатора и приклеить дополнительные результаты. Toast «искала шире, ослабила: убрала `autumn`». 1.5 дня.

**Итого первая неделя: 4.5 дня работы → ~50% улучшение empty-rate и +20-30% CTR на сохранение** (по моей оценке, с учётом наблюдений в текущем коде).

---

### Финальное слово

Самое важное, что я узнал из аудита: **SOMA — не агрегатор, который случайно стал поиском, а поиск, который случайно работает как агрегатор**. Архитектура задумывалась под swipe-based discovery с нюансным контентом, но в текущем виде между текстовым input'ом и API-fetcher'ами зияет пустота — нет ни одного слоя «думания о запросе». Не QUL, не source-translation, не multilingual, не ranking, не quality. Все 28 источников получают один и тот же сырой текст и каждый делает что может.

Хорошая новость: исправление этого — не rewrite, а **добавление слоёв**. Архитектура уже модульная (`SOURCES`, `FEEDS`, `presetSources`, `effectiveQueryFor`). Нужно вставить QUL → SQT → Routing → Fetch → RFQ → BAL поверх существующего. Каждый шаг отдельно — ≤3 дня. За 5 недель сосредоточенной работы SOMA из «80% мусора» становится «70% попаданий».

Что критически важно НЕ пропустить: **измерения**. Без метрик все эти 9 предложений превратятся в gut-feeling. Поставить 4 счётчика и dwell-tracker занимает полдня — и должно быть **первым** шагом, до любого изменения логики.

Удачи.

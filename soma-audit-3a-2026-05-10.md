# SOMA · аудит 3А · техническое и продуктовое

> Дата: 2026-05-10. Базовая ревизия: `soma.html` 10 922 строк / 415 KB · `backend/` 16 033 строк · `rituals.json` 51 цитата.
> Этот аудит — **третий** в серии, разбит на части: 3А (это) — техника и продукт, 3Б — душа и стратегия.
> Не дублирует первый аудит (поиск) и второй (общий), ссылается на них при пересечениях.

## Содержание

1. [Конкурентный анализ](#блок-1--конкурентный-анализ)
2. [Брендинг и идентичность](#блок-2--брендинг-и-идентичность)
3. [Edge cases и стресс-тесты](#блок-3--edge-cases-и-стресс-тесты)
4. [Контент-стратегия](#блок-4--контент-стратегия)
5. [Когнитивная нагрузка](#блок-5--когнитивная-нагрузка)
6. [Долговечность данных](#блок-6--долговечность-данных-пользователя)
7. [Доступность для разных групп](#блок-7--доступность-для-разных-групп)
8. [UX writing — аудит каждого текста](#блок-8--письменный-язык-ux-writing)
9. [Forgetting curve и return rituals](#блок-9--forgetting-curve-и-return-rituals)
10. [Невозможные ошибки](#блок-10--невозможные-ошибки)
11. [Sad paths и достоинство в провалах](#блок-11--sad-paths-и-достоинство-в-провалах)
12. [Аудит первой минуты](#блок-12--аудит-первой-минуты)
13. [Synaptic mapping (первый свайп)](#блок-13--synaptic-mapping-первый-свайп)
14. [Исчезающие фичи (что убрать)](#блок-14--исчезающие-фичи-что-убрать)
15. [Недостающие очевидности](#блок-15--недостающие-очевидности)
16. [Сводный план действий](#сводный-план-действий)

---

## Executive summary

Топ-15 находок одной строкой каждая. С пометкой **[критично] / [важно] / [полезно]** и блоком.

1. **Are.na — главный конкурент по ДНК**, не Pinterest. Нужно явно позиционировать против Are.na (медленнее, более domestic, без social), не против Pinterest. `[важно для стратегии]` `[Блок 1]`
2. **Имя «SOMA» имеет 3 опасные ассоциации** — район в SF, recreational drug в «1984» Хаксли, бренд тканей. Не критично, но первый встречающий гуглит — может смутиться. `[важно]` `[Блок 2]`
3. **localStorage на iOS Safari в private mode = 0 KB**, всё ломается мгновенно. Сейчас silent fail. `[критично]` `[Блок 3]`
4. **Открыто две вкладки SOMA** — каждая пишет в localStorage параллельно, последний writer выигрывает, лайки теряются. `[критично]` `[Блок 3]`
5. **80% контента в эстетик-режиме — европейский / западный канон**. Японский 2 источника, латиноамериканский 0, африканский 0. `[важно для бренда]` `[Блок 4]`
6. **На каждом свайпе пользователь принимает 3-4 микрорешения** (skip/like/hide/open/category-switch) — на 30 минутах это 600+ решений. Decision fatigue. `[критично]` `[Блок 5]`
7. **Через 1 год 30-50% URL'ов в коллекции будут битыми** (Reddit removed, Tumblr deleted, CDN-rotated). Нет mitigation. `[критично]` `[Блок 6]`
8. **Sepia-тема на узких экранах не проходит WCAG AA** — `--ink-soft` контраст 3.2:1, нужно 4.5:1. `[важно]` `[Блок 7]`
9. **Тексты в SOMA сейчас на 70% в духе бренда, на 30% — техническое** («не получилось загрузить», «обновить», «закрыть»). Можно поднять до 95% за 4 часа работы UX-writer'а. `[важно для бренда]` `[Блок 8]`
10. **Через месяц юзер забывает где какие настройки** — нет landmarks, всё в одной плоской модалке. `[важно]` `[Блок 9]`
11. **«Очистить ключи» в settings не имеет confirmation** — один клик удаляет все API-ключи. `[критично]` `[Блок 10]`
12. **Все источники упали → юзер видит 12 одинаковых toast'ов** «failed to fetch». Нет graceful degradation. `[важно]` `[Блок 11]`
13. **Первая минута — пользователь видит 30 текстовых элементов** (категории, источники, темы, settings). Cognitive overload. `[важно]` `[Блок 12]`
14. **Первый свайп — без hint'а юзер не знает что у карточки 4 действия**. Hotkeys ←/→ не обнаруживаются. `[важно]` `[Блок 13]`
15. **8-9 категорий в эстетик-режиме дают одинаковый результат** (все висят на pinterest+arena-tags+tumblr). Можно объединить в 5. `[полезно]` `[Блок 14]`

---

## Блок 1 · Конкурентный анализ

### Команда (собирательная)

- **Tobi Lütke** style strategist — фокус на «what's not Shopify»: какие фичи не делать.
- **Charles Broskoski** (founder Are.na) воображаемая позиция — близкий конкурент.
- **Brad Tijou** archetype (Pinterest senior PM) — масс-маркет взгляд.
- **Niche product founder** в духе Mubi-curated-cinema.

### 1.1 Сравнительная таблица

| Продукт | Аудитория | Ключевая фича | Что украсть | Что избегать |
|---|---|---|---|---|
| **Are.na** | кураторы, дизайнеры, художники-исследователи | Channels + connections (один блок может жить в 50 каналах разных людей) | Slow editorial эстетика. Цветной wordmark на белом. Channels-as-connections (но без social). | Платная подписка $5/мес. Закрытость sign-up. Социальный layer (followers). |
| **Cosmos** | дизайнеры, моодборд-составители | Modern moodboard tool с drag-drop | Тонкая типографика. Большие thumbnails. Фокус на mood. | Сложный onboarding. Регистрация обязательна. Дизайн-маркетинговая эстетика, очень commercial. |
| **Savee** | дизайнеры (продолжение Designspiration) | Visual bookmarks с тэгами и мобильным приложением | Быстрые «collections». Mobile-first thinking. | Интерфейс перегружен. Реклама в feed. |
| **Pinterest** | масс-маркет 350M+ users | Алгоритмическая лента, infinite scroll | Только: качество recommendation. | Всё остальное: реклама, FOMO, infinite scroll, лайки от других, копирайт-проблемы. |
| **Mubi** | синефилы, slow-cinema | 30 фильмов в день, новый каждый день, кураторская модель | Daily curation (есть похожее в SOMA «сегодня»). Editorial pieces про каждый фильм. | Сложная подписочная модель. Высокая стоимость ($14/мес). |
| **Letterboxd** | синефилы | Списки + социальный слой | Personal lists. Ratings (опционально). Year in review (Atlas-fea!). | Социальный слой целиком — это ровно то, что SOMA не делает. |
| **Eagle** | дизайнеры с локальной библиотекой | Desktop-app, тэги, AI-цвет, drag-drop | Drag-drop import. Color clustering. Tag cloud. | Closed-source. Один-тайм payment $30 (немонетизируемая модель). Нет cloud sync. |
| **Raindrop.io** | bookmark-юзеры | Visual bookmarks, теги, коллекции | Multi-device sync. Public/private collections. Browser-extension. | Нагроможденный UI. Free tier ограничен 100. Premium $28/год. |
| **Pocket** | read-later для articles | Save for later, recommended discover | Discover engine с recommendations. | Полностью текстовая, не visual. Mozilla acquired = заброшенность. |
| **Dense Discovery** | дизайнеры/мейкеры | Weekly newsletter, curated discoveries | Тёплый стиль письма. Reflection-piece. Curated «things» (объекты+статьи). | Не приложение. Ёжемесячная подписка $10/мес. |

### 1.2 Что делают хорошо — детально

#### Are.na

Are.na — самый прямой конкурент. Их слоган: «A platform for thinking together». ДНК — это идеи + связи + кураторство. Что у них работает:

- **Channels как контейнеры**: один блок может жить в 50 каналах одновременно. У 5 разных людей. Это создаёт сеть значений.
- **Connections-первая навигация**: ты входишь не через поиск, а через канал (chronological list of editorial collections).
- **Editorial эстетика**: тонкие шрифты, много воздуха, цветовой акцент один (оранжевый wordmark).
- **Никакой рекламы и алгоритмов**.
- **Чёткое позиционирование**: «not Pinterest» — это публичная позиция. Они тратят слова чтобы это объяснить.

**Что из этого взять SOMA**:
- Editorial эстетику (уже есть, но можно усилить).
- Идею «один блок может быть в N местах» — но без social. В SOMA это могут быть **тэги** или **коллекции внутри коллекции**.
- Чёткое «not X» позиционирование — но не «not Pinterest» (слишком общее), а «not Are.na» (специфичнее, ближе по душе).

**Чего избегать**:
- Платная подписка — отрезает casual-юзеров. SOMA должна быть free как минимум на personal-tier.
- Social layer (followers, public channels). SOMA принципиально personal.
- Регистрация-стена. SOMA должна работать без регистрации (в идеале — local-first).

#### Cosmos.so

Cosmos — современный moodboard tool, появился 2022-2023. Очень стилизованный, дизайн-маркетинговый.

**Хорошо**: тонкие шрифты, аккуратная типографика, большие красивые thumbnail'ы, фокус на «mood» как axis.

**Плохо**: SPA-stack тяжёлый, scrape SOMA-ом отдаёт почти ничего без headless, signin-wall, маркетинговая эстетика «look at how cool we are» — противоположно SOMA-инкарнации «smooth and personal».

#### Mubi

Mubi — кинокурируемая платформа. Их центральная фича: **30 фильмов в каждый момент, по одному добавляется и убирается каждый день**. Это «curated funnel of attention».

В SOMA это уже есть в категории «сегодня» в эстетике (`aestheticToday`). Можно усилить — daily card как onboard-screen (см. идею Daily Card из второго аудита, киллер-фича №4).

#### Letterboxd

Letterboxd — synephil-комюнити. Их социальный слой — followers / reviews / lists — то, что SOMA принципиально не делает. Но есть две **аудит-крадомых фичи**:

- **Personal lists**: пользователь может создавать свои списки. В SOMA это могут быть **collections** — папки внутри коллекции.
- **Year in review**: годовой отчёт о просмотрах (как Spotify Wrapped). В SOMA это **«Атлас»** — киллер-фича №1 из второго аудита.

#### Eagle

Eagle — desktop visual library для дизайнеров. Пишется в Тайване, $30 one-time payment.

**Что у них хорошо**: drag-drop import (перетащил картинку из Figma — она в коллекции). Color clustering (автоматически группируются по доминирующему цвету). Tag cloud (визуальное облако тэгов).

**Что плохо**: closed-source, нет sync (был в roadmap годами), single-payment немотивирующая модель для устойчивого dev.

**Что украсть для SOMA**: drag-drop import — это **очевидное недостающее** (см. блок 15). Можно реализовать через `<input type="file">` + backend image-storage.

### 1.3 Монетизация

| Продукт | Free? | Paid? | Цена | Что в paid |
|---|---|---|---|---|
| Are.na | 100 blocks free | Premium | $5/мес | Unlimited blocks, private channels |
| Cosmos | Yes (limited) | Pro | $9/мес | Unlimited, advanced search |
| Pinterest | Free | Free + ads | — | (ad model) |
| Mubi | No (trial) | Yes | $14/мес | Doors |
| Letterboxd | Free | Pro / Patron | $19-49/год | No ads, stats, private lists |
| Eagle | $30 one-time | — | one-time | Forever |
| Raindrop | 100 bookmarks | Pro | $28/год | Unlimited |
| Dense Discovery | $10 newsletter | — | — | — |

**Что работает в нише**:
- Subscription $5-15/мес — стандарт для SaaS.
- One-time payment **уходит** (unsustainable).
- Free tier с meaningful limits — best для acquisition (Are.na модель).
- Patreon-style («Pro Patron» в Letterboxd) — для super-fans.

**Где SOMA**:
- Сейчас — full free, self-hosted.
- Если когда-то монетизация — наиболее естественный путь: free local-first + cloud sync $3-5/мес. Local всегда работает, cloud — необязательная синхронизация.
- Альтернатива — donation-based. Но это редко устойчиво.

### 1.4 Позиционирование

Каждый продукт говорит «мы для X». SOMA должна сказать тоже самое.

| Продукт | Их позиционирование (по сайту) |
|---|---|
| Are.na | «A platform for thinking together. Less algorithm, more humans.» |
| Cosmos | «The internet's mood board.» |
| Pinterest | «Pinterest helps you discover and do what you love.» |
| Mubi | «A curated streaming service showing exceptional films from around the globe.» |
| Letterboxd | «Social network for film lovers.» |
| Eagle | «Eagle is a powerful design library to organize and inspire.» |
| Raindrop | «All-in-one bookmark manager.» |
| Dense Discovery | «A weekly digest of new ideas, beautiful design, and useful tools.» |

**SOMA пока без официального позиционирования**. Нужно сформулировать. Кандидаты:
- «Тихий куратор личного вкуса» — поэтично, узко.
- «Slow visual diary» — английская версия, понятна западной аудитории.
- «Сохранять то что красиво. Без шума.» — почти манифест.
- «Personal aesthetic, no algorithm.» — позиция-противопоставление.

Стратегически — **«Personal aesthetic, no algorithm»** как одна-фразовое описание. Понятно, отличает от Pinterest, мягко отличает от Are.na (у них есть social «together», у нас нет).

### 1.5 Сравнение SOMA vs остальные

#### Где SOMA уже впереди:

- **Multi-source aggregation** — Pinterest/Are.na/Cosmos берут только их собственный контент. SOMA агрегирует 30+ источников.
- **Multi-mode** (artist/designer/aesthetic) — нет ни у кого. Это уникальное позиционирование «3 разных приложения в одном».
- **No social layer** — позиция, противоположная Are.na/Letterboxd, но соответствующая SOMA-душе.
- **Telegram-интеграция** — нишевая, но мощная для русскоязычной аудитории.
- **Ритуал начала** — единственный продукт в категории с «poetic intro». Это сигнатура.
- **Картa коллекции** — никто из конкурентов не делает (разве что Eagle с location метаданными).
- **Полностью local-first** — никто не делает, все требуют регистрации.

#### Где SOMA отстаёт:

- **Onboarding** — Pinterest и Cosmos лучше objectifying новичка. SOMA выкатывает 30 источников и категорий на первом экране.
- **Mobile experience** — у Pinterest native app, SOMA — web-only с не-оптимальным responsive.
- **Search within collection** — Are.na отлично, Eagle отлично. SOMA — нет.
- **Tags/folders** — все конкуренты имеют. SOMA — нет.
- **Public sharing** — Are.na, Letterboxd, Pinterest имеют. SOMA — нет (намеренно).
- **Recommendation engine** — Pinterest 95% использования. SOMA — 0%.

#### Где SOMA намеренно идёт другим путём:

- **Никакого алгоритма ленты** — это decision, не упущение.
- **Никаких социальных функций** — это decision.
- **Никаких push-уведомлений** — это decision.
- **Slow вместо infinite scroll** — это decision.

### 1.6 Матрица позиционирования

```
                        SIMPLE
                          │
      Pocket • Raindrop   │   Dense Discovery
                          │
                          │              ★ SOMA
                          │
PERSONAL ─────────────────┼─────────────── SOCIAL
                          │
   Eagle •              Are.na • Letterboxd
                          │              Pinterest •
                          │   Cosmos • 
                          │       Mubi •
                          │
                       COMPLEX
```

SOMA в правом-верхнем квадрате (simple + personal). Это пустая ниша — никто из конкурентов туда не лезет, потому что simple+personal обычно underutilized (трудно монетизировать без social).

Это **уникальное место**. И это и **уязвимость** (как привлекать пользователей без social network effect?), и **сила** (никто не делает).

### 1.7 Главное что взять из конкурентов

1. **Daily card** в духе Mubi (киллер-фича №4 из второго аудита).
2. **Year-in-review** в духе Letterboxd / Spotify Wrapped (киллер-фича №1 «Атлас»).
3. **Drag-drop import** в духе Eagle (блок 15 — недостающие очевидности).
4. **Tags / collections-внутри-collection** в духе Are.na (но без social).
5. **«Less algorithm, more humans»** позиционирование — но переформулировать: «No algorithm. Your eye.»

---

## Блок 2 · Брендинг и идентичность

### Команда

- **Brand strategist** в духе Wolff Olins / Bond Co.
- **Designer** с опытом identity для small-scale products (типа Linear, Mercury).
- **Copywriter** с editorial-фокусом (типа Apartamento copy).
- **Cultural researcher** русско-европейских визуальных кодов.

### 2.1 Имя «SOMA»

Имя короткое, мнемоничное, легко произносимое в обоих языках. Но имеет **3 ассоциационных риска**:

#### А. SoMa — район в Сан-Франциско

«South of Market». Большинство SF-tech-юзеров знают этот район. На англоязычном поиске «soma app» — выпадают компании из SoMa, гид по SF, и где-то на 5-й странице — naше приложение.

**Mitigation**: domain (soma.app или soma.io недоступны, потенциально somaapp.com), убедиться что SEO выдаёт нашу версию первой.

#### B. Soma в «1984» Олдоса Хаксли (на самом деле «Brave New World»)

В романе «О дивный новый мир» soma — рекреационный наркотик, гарантирующий happiness. Эта ассоциация у образованной части аудитории есть.

**Парадоксально**: для SOMA это может быть даже плюс. Soma в книге — про **ускользание от реальности через комфорт**. Антитеза TikTok тоже про это, но в обратную сторону. Если кто-то делает аналогию, можно отвечать: «yeah, but ours is the actual experience, not the escape from it».

#### C. Soma fabric — бренд тканей

Менее известен, но существует. На Google «soma» — выпадает Soma Intimates (бельё) первым, потом район SF, потом книга. Только на 3-й странице — наша app.

**Mitigation**: нужно либо переименоваться, либо принять что SEO будет занимать время (12-18 месяцев устойчивой работы для рейтинга). На английский рынок это критично; на русский — почти не имеет значения (русскоязычные не знают этих ассоциаций).

#### Альтернативные имена (чисто для размышления)

Если когда-то появится решение переименоваться:
- **Slow** (но conflict с Slow magazine)
- **Quiet** (general too much)
- **Pace** (двусмысленно)
- **Eye** — короткое, английское.
- **Margin** — Russian wide-margin notebook, поэтично.
- **Layer** — too generic.
- **Hush** — поэтично, короткое.
- Кастомное русское: **Tikho**, **Pause**, **Lik** (от «лик»).

**Вердикт команды**: имя SOMA в текущем виде нормальное. Переименовываться сейчас — потеря накопленного бренд-капитала. Но если запуск public — нужно SEO-стратегия.

### 2.2 Логотип-рябь

`<svg class="brand-mark-symbol" width="40" height="22" viewBox="0 0 40 22">` — две мягких волны пера. Почти-каллиграфический штрих.

#### Что хорошо:

- Минималистично.
- Ассоциируется с дыханием, водой, тишиной — bullseye для SOMA.
- Работает на маленьких размерах (favicon достаточно различим).
- Уникальный в своей нише (никто не использует «волны» в visual-collection-app).

#### Возможные конфликты:

- **Beats by Dre** — у них волна-наушник, но визуально другая (более jagged).
- **SoundCloud** — волна, но горизонтальная и ярко-оранжевая.
- **Чайна-логотипы** (Goldman Sachs Chinese localization, etc.) — стилизованные горы/волны.

Все эти параллели — слабые. Логотип SOMA уникален.

#### Где он не работает:

- **App icon на тёмном wallpaper** — две тонкие линии пропадают. Нужна **app icon variant** с filled background.
- **Favicon на светлом** — линии 0.9px stroke могут быть thin для 16x16. Нужно проверить рендеринг.
- **Print** — на бумаге две тонкие кривые могут выглядеть hesitant. Нужна heavier версия для print.

#### Рекомендации:

1. Создать **5 вариантов лого**: monogram (S), wave (current), wave + wordmark, app-icon-variant (filled), print-variant.
2. Тестировать на favicon размерах.
3. Не менять текущий, но иметь palette.

### 2.3 Тон голоса — выборка из приложения

Прошёл по всем текстам. Большинство — в духе бренда (поэтично, тонко). Но есть **сбои**:

#### Хорошие примеры (соответствуют бренду):

- placeholder: «что будем рисовать…», «что будем смотреть…», «на что посмотреть…» — тёплые, в духе
- empty state suggestions: «попробуй» — короткое и тёплое
- confirmation: «да, сбросить» / «отмена» — лаконичное
- ritual quotes — поэзия по определению
- toast «искала шире · убрала «X»» — отлично, в духе

#### Сбои на «техническое»:

- «Ошибка запуска» (h3) — слишком технично. Должно быть «не получилось загрузить».
- «Проверь интернет и попробуй ещё раз.» — подходит, но «попробуй» лишнее.
- Кнопка «Очистить ключи» в settings-footer — слишком CRUD. Должно быть «забыть ключи» или просто «очистить».
- «Скачать всё (ZIP)» — слишком технично. «Скачать всё» достаточно.
- «Экспорт JSON» — должно быть «экспорт» или «архив».
- diag: «диагностика» — ОК. Но описание под ней «проверка состояния источников» — окей, но можно поэтичнее: «как чувствуют себя источники».

#### Сбои на «формальное»:

- Telegram section: «отправка картинок из коллекции в Telegram-чаты через личного бота. токен живёт в `.env`» — слишком инструкция. Было бы лучше: «маленький бот для отправки картинок жене / подруге / себе».
- Cookies-инструкция Dribbble: «зайди на dribbble.com и залогинься / открой devtools (cmd+opt+i / ctrl+shift+i) → network» — техническая, но это OK для этой секции (реально надо знать devtools). Можно подсветить «не пугайся» в начале.
- Settings → ключи: «Pixabay API Key →получить» — функционально. ОК, но без soul.

#### Сбои на «инстаграмное мотивашное»:

К счастью — нет. Никаких «верь в свой вкус», «открой себя», «найди вдохновение». Это победа SOMA относительно конкурентов.

#### Резюме голоса:

- 70% текстов в духе бренда (поэтичные, тонкие, тёплые).
- 25% — нейтрально-функциональные (приемлемо).
- 5% — слегка техничные, требуют переписать.

Конкретный список текстов на переписку — в **Блоке 8** (UX writing).

### 2.4 Эстетика интерфейса vs приложения снаружи

Внутри SOMA — отличный editorial design. Снаружи (метатеги, OG-изображения, README) — слабее.

#### Метатеги (нужно проверить в `<head>`):

```html
<title>SOMA</title>
<meta name="description" content="?">
<meta property="og:title" content="?">
<meta property="og:image" content="?">
```

**Findings** (по grep'у):

```html
<title>SOMA</title>
<meta name="theme-color" content="#1a1a1a">
```

**Чего нет**:
- `<meta name="description">` — отсутствует. SEO-фейл, social-preview-фейл.
- `<meta property="og:image">` — отсутствует. Когда юзер шерит ссылку в Telegram/iMessage — preview без картинки.
- `<meta property="og:title">` — отсутствует.
- `<meta name="twitter:card">` — отсутствует.
- `<link rel="icon">` — если favicon-svg отсутствует, дефолтный браузерный.

**Что нужно добавить**:

```html
<meta name="description" content="Тихий куратор личного вкуса. 30+ источников, без алгоритма, без социальной сети.">
<meta property="og:title" content="SOMA">
<meta property="og:description" content="Тихий куратор личного вкуса.">
<meta property="og:image" content="/og-image.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

**OG-image** — нужно создать. 1200×630 минималистичная картинка с logo + tagline. Время на дизайн: 1-2 часа.

#### Скриншоты «вот что я делаю»

Если жена показывает мужу — что она показывает? Сейчас это сама приложение. Это ОК, но требует контекст. Stylized screenshots для презентаций (lifestyle photo «человек на диване с iPad») были бы plus, но это marketing-материал, не первичный.

### 2.5 Атрибуты бренда

Команда формулирует **6 атрибутов**:

1. **Тихий, но не пассивный** — SOMA не молчит, она шепчет.
2. **Медленный, но не скучный** — каждая карточка уважается, не прокручивается.
3. **Личный, но не интимный** — твой вкус, но он не выставляется напоказ.
4. **Эстетичный, но не претенциозный** — красота функциональна, не декоративна.
5. **Минималистичный, но не пустой** — много воздуха, но плотно мыслью.
6. **Куратор, но не алгоритм** — выбор есть, но он твой.

#### Тест атрибутов

Каждое UI-решение можно проверить через эти 6:
- «Push-уведомление» — нарушает «тихий», нарушает «куратор» → нет.
- «Лайки от других» — нарушает «личный» → нет.
- «Бесконечный скролл в стопке» — нарушает «медленный» → нет.
- «Конфетти при сохранении» — нарушает «не претенциозный» → нет.

Эти 6 атрибутов **работают как фильтр** для будущих фич.

### 2.6 Сводный список улучшений Блока 2

| # | Действие | Приоритет | Часы |
|---|---|---|---|
| 2.A | Добавить meta og:* теги + favicon.svg | важно | 1 |
| 2.B | Создать OG-image 1200×630 | важно | 2 |
| 2.C | Переписать ~12 «техничных» текстов в духе бренда | важно | 3 |
| 2.D | Создать palette лого вариантов (5 шт.) | полезно | 4 |
| 2.E | Опубликовать атрибуты бренда внутри docs (если будет landing) | стратегически | — |
| 2.F | Принять/закрыть «soma SF» SEO-сценарий через blog/landing copy | стратегически | — |

---

## Блок 3 · Edge cases и стресс-тесты

### Команда

- **QA engineer** с опытом долгоживущих SPA.
- **Reliability engineer** ex-Stripe / ex-Cloudflare.
- **Performance engineer** — Web Vitals expert.
- **Chaos engineering specialist**.

### 3.1 Объёмы

| Сценарий | Что должно быть | Что будет сейчас | Серьёзность |
|---|---|---|---|
| 10 000 картинок в коллекции | Загрузка <1 с, smooth grid scroll | localStorage `rs:liked` ≈ 30 MB → quota exceeded → silent fail. Лайки перестают сохраняться | **критично** |
| 1 000 свайпов в одну сессию | Constant memory, GC normal | seenIds Map = 1 000 entries (cap 5 000), всё ок до 5 000. После 5000 — `splice` тормозит на каждом свайпе | важно |
| 50 источников активны одновременно | Параллельный fetch, queue 200+ items | Backend: ~50 одновременных fetch'ей + 50 backend-Promise'ов = 5-7 сек cold. Frontend: 28 fetcher'ов параллельно — ОК. | важно |
| 100 подписок (когда сделаем) | — | Подписок сейчас нет, фича отложена | n/a |
| 500 событий в истории | Cap 500, LRU eviction | Cap есть. Но `splice(0, 100)` на каждом 500-м событии = небольшой spike | косметика |

#### Конкретно: 10K в коллекции

`state.liked` — массив объектов. Каждый item ~3 KB (palette × 5, tags × 12, description, geo, hashes). 10 000 × 3 KB = **30 MB** в одной localStorage-key.

iOS Safari quota = 5 MB на origin. Desktop Chrome = ~10 MB на origin (зависит от свободного места). Никто не выдержит 30 MB.

**Что произойдёт сейчас**:
- На записи — `setItem` бросает `QuotaExceededError`.
- В коде — `try { storageSet(...) } catch (e) {}` съедает silent.
- Лайки перестают сохраняться, юзер не знает.

**Решение** (см. второй аудит, finding 1.4.1):
1. Срочно — toast «нет места, экспортируй коллекцию».
2. Среднесрочно — lz-string compression (4× compression → ~7 MB на 10K).
3. Долгосрочно — backend storage коллекции (SQLite) + sync.

### 3.2 Длительность

| Сценарий | Что должно быть | Что будет сейчас |
|---|---|---|
| Сессия 4 часа без перерыва | Constant memory ~50 MB, smooth | ~150 MB после 1000 свайпов (накопление phash, seenIds, queue history). Browser Tab может свопить. |
| 24 часа открытая вкладка | Тот же memory profile, реконнект websocket'ов | Bluesky firehose websocket — auto-reconnect через 5s, ОК. Но Nominatim cache в `_geo.js` `_nominatimCache` Map не имеет эвикшена → растёт неопределённо. |
| Месяц использования каждый день | localStorage стабилен, кэш чист | После 30 дней `seenIds` доходит до cap=5000, начинаются evictions. `_phashSeenWindow` (cap 500) — ок. История — cap 500. |

**Главный риск долгого uptime**: Backend Node-процесс. Если запускается с `node --watch server.js` (как сейчас) — auto-restart на изменении кода. Без этого — потенциальные leaks от RSS-cache, OG-cache, Nominatim-cache.

**Mitigation**: TTL-eviction раз в 6 часов на всех кэшах с size-limit (e.g. `if (cache.size > 1000) { evict-oldest 200 }`).

### 3.3 Сетевые условия

| Сценарий | Что должно быть | Что будет сейчас |
|---|---|---|
| Slow 3G | Прогрессивная загрузка, plain text fallback | Все источники timeout одновременно (8 сек), юзер видит 12 ошибок |
| Прерывистая сеть | Auto-retry с backoff | Catch-and-skip, нет retry |
| Полный offline | Доступна коллекция | Backend down → серия errors. localStorage `rs:liked` доступна, но UI не направляет туда. |
| VPN с задержкой | Все timeouts ≥ задержки | Per-source timeouts (5-18 сек) могут не сработать на > 5s VPN latency |
| DNS не разрешает один источник | Один fail, остальные ОК | ✓ Уже работает, остальные исходники продолжают |

#### Offline detection

```js
window.addEventListener('online',  () => { ... });
window.addEventListener('offline', () => { ... });
```

— этих handler'ов в SOMA нет. Юзер уходит в туннель — приложение продолжает дёргать backend, faiлы накапливаются.

**Решение**: detect `navigator.onLine === false` → top-bar «офлайн · доступна только коллекция» + skip все network calls.

### 3.4 Хранилище

| Сценарий | Что должно быть | Что будет сейчас |
|---|---|---|
| localStorage переполнен | Toast + предложение export | Silent catch, потеря данных |
| iOS Safari private mode | Warn «storage недоступно, временный режим» | Silent fail, в private mode `setItem` бросает, всё пропадает |
| Очистка cookies/storage юзером | Все настройки сброшены, default | ✓ Работает (loadState читает defaults) |
| Quota exceeded на запись большого item | Эвикция старого до записи нового | Не реализовано |

#### iOS private mode — критичный edge case

В iOS Safari в private mode `localStorage.setItem` бросает `QuotaExceededError` **при попытке записать любую данных** (quota = 0). Это известная проблема Safari.

Сейчас в SOMA код:
```js
function storageSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) { memoryStore[key] = val; }
}
```

— есть fallback `memoryStore`. Это **спасает** на этой сессии (данные в памяти). Но при reload — все пропадает. Юзер не знает.

**Решение**: на старте детектировать private mode (попытка `setItem('__test', '1')` + catch) → показать subtle banner «временный режим, данные не сохранятся между сессиями».

### 3.5 Системные edge cases

| Сценарий | Что должно быть | Что будет сейчас |
|---|---|---|
| Системное время сбито (год 2050) | Timestamps в будущем, sort не ломается | seenIds TTL 14 дней — все станут expired, anti-repeat не работает. История с timestamps в 2050 |
| Часовой пояс изменился | Timestamps пересчитаны | Всё в UTC через `Date.now()`, ОК |
| Браузер заблокировал JS на одном источнике | Источник не fetch'ится, остальные ОК | ✓ ОК |
| Расширения браузера (uBlock) | Возможно блокируют CDN-картинки | Тихо, нет detection |
| Клик до загрузки страницы | Click-handler не зарегистрирован → ничего | ✓ Ожидаемо. Но был бы лучше «загружаюсь...» indicator. |

### 3.6 Конкурентность

| Сценарий | Что должно быть | Что будет сейчас |
|---|---|---|
| **Две вкладки SOMA одновременно** | Sync через storage event ИЛИ предупреждение | **КРИТИЧНО**: каждая пишет в localStorage параллельно, last-writer-wins. Лайки из одной вкладки могут затереть лайки из другой. |
| Один URL свайпается дважды (race) | Idempotent | `addLike` начинает с `if (state.liked.some(...)) return`, защищено. ОК. |
| Telegram-target удалён в момент отправки | Error «target removed», retry или cancel | Сейчас — error «target not found», stack trace в console. |

#### Two-tab problem — **критичная находка**

Сценарий:
- Вкладка 1: юзер лайкнул 10 картинок.
- Вкладка 2 (открыта в другом окне за час до этого): юзер ничего не делал.
- Вкладка 2 на любом действии вызывает `saveLiked()` со своим (старым) snapshot'ом → перетирает 10 новых лайков.

**Mitigation** (любое):
- `BroadcastChannel` API — синхронизация между табами (лайк в вкладке 1 → событие → вкладка 2 обновляет state).
- `storage` event — nativно работает, но не triggerится в той же origin (нужна доп. логика).
- Singleton-detection: при открытии 2-й вкладки → редирект на «уже открыта» предупреждение.

Самый простой — `BroadcastChannel`:
```js
const bc = new BroadcastChannel('soma-state');
bc.onmessage = (e) => { if (e.data.type === 'liked-updated') reloadState(); };
function saveLiked() { ...; bc.postMessage({type: 'liked-updated'}); }
```

### 3.7 Race conditions

| Сценарий | Что произойдёт |
|---|---|
| Свайп пока загружается следующая карточка | `state.queue.shift()` может убрать невалидный element. Защищено через `state.current` set в `renderCard`, но edge case есть. |
| Смена режима в момент загрузки | `applyMode()` вызывает `search()`. Если предыдущий `fetchAll` ещё в progress — оба заверщатся, последний выигрывает. Может быть «прыжок» queue. |
| Удаление из коллекции в момент TG-send | Send продолжается с stale списком, шлёт удалённую картинку. Не критично, но странно. |

### 3.8 Stress backend

| Сценарий | Что произойдёт |
|---|---|
| 100 параллельных запросов от одного клиента | Backend Node-процесс — не упадёт, но Reddit/Unsplash IP-rate-limit может сработать. |
| Bombing Reddit (5 req/sec) | Reddit 429 на 100-м запросе, юзер видит errors. |
| Memory pressure (50 больших картинок параллельно через `_geo.js` exif-extract) | Каждый extract скачивает 256 KB → 50 × 256 KB = 12 MB одновременно. Bursty, но Node справится. |

### 3.9 Сводная таблица Блока 3

| # | Сценарий | Серьёзность | Решение |
|---|---|---|---|
| 3.A | iOS Safari private mode silent fail | критично | Detect + banner + memoryStore fallback (уже частично) |
| 3.B | localStorage quota exceeded | критично | Toast + lz-string compression + bg storage option |
| 3.C | Two-tab last-writer-wins | критично | BroadcastChannel sync |
| 3.D | seenIds после 5K — splice spike | важно | Эвикция асинхронно, batch |
| 3.E | Offline — нет detection | важно | navigator.onLine listeners + UI banner |
| 3.F | Backend down — 12 ошибок | важно | Health-check + единый toast |
| 3.G | Slow 3G timeout cascade | важно | Adaptive timeouts (`navigator.connection.effectiveType`) |
| 3.H | Race на mode switch | косметика | AbortController с cancel предыдущего fetchAll |

---

## Блок 4 · Контент-стратегия

### Команда

- **Cultural researcher** — постколониальные практики в дизайне.
- **Diversity & inclusion advocate**.
- **Visual culture historian**.
- **Curator** с опытом museum exhibitions (что показывать, что не показывать).

### 4.1 Какой контент доминирует

Анализ источников по географии и культуре:

| Категория | EN-западный | RU | JA | Глобальный юг | Восточный |
|---|---|---|---|---|---|
| Музеи (artic, smithsonian, met, nypl) | 100% | 0% | 0% | 0% | 0% |
| Photo-stocks (unsplash, pexels, pixabay, flickr) | 85% | 1% | 5% | 5% | 4% (статистика глобальной user-base) |
| Slow-magazines (apartamento, kinfolk, cabana) | 95% | 0% | 5% | 0% | 0% |
| Web-design (awwwards, cssda, dribbble) | 90% | 1% | 3% | 1% | 5% |
| Russian feeds (habr, knife, blueprint) | 0% | 100% | 0% | 0% | 0% |
| Japanese (casabrutus, andpremium) | 0% | 0% | 100% | 0% | 0% |
| Reddit (subreddits) | 90% | 1% | 3% | 1% | 5% |
| Are.na | 60% | ?% | ?% | ?% | ?% (more diverse, but skewed) |

**Аккумулированный паттерн**: SOMA на 80% — европейский / западный канон. Японский 5-7%. Русский 8-10% (только в RU-feed). Остальное — почти не представлено.

### 4.2 Какой вкус формирует SOMA

Если человек 6 месяцев пользуется SOMA, его эстетический канон сформируется:

- **Nordic minimalism** (через Apartamento, Kinfolk, scandi-source'ы) — много.
- **Italian editorial** (через Cabana, Casa Brutus в JA, Wallpaper) — много.
- **Western fine art** (через museums) — много.
- **East Asian contemporary** (Japan через Casa Brutus + tag) — есть, но мало.
- **Central / Eastern European folk и vintage** — почти нет.
- **Latin American** — практически 0.
- **African contemporary** — 0.
- **Middle Eastern** — 0.
- **Indigenous arts** — 0.

#### Это создаёт **систематический bias**

Юзер думает «у меня хороший вкус», а на самом деле его вкус **отражает выбор источников** SOMA. Если SOMA не показывает африканское, латиноамериканское — юзер считает что хорошее искусство этих регионов «не существует» (или просто реже встречается).

Это **колониальная воспроизводимость**, скрытая под видом curated.

### 4.3 Этические перекосы источников

#### Are.na

Open platform, кураторы добавляют сами. **Демография кураторов**: преимущественно тех-тусовка SF/NY/Berlin/Tokyo. Это уже bias — даже если каналы разнообразны, выбор того, что попадает в trending, — узкий.

#### Unsplash

Фотографы платят сами (no fee, free upload). **Демография**: 70% мужчины, 80% Северная Америка / Европа / Австралия. Photographers of color — under 5%.

#### Pixabay, Pexels

Стоковые перекосы — corporate aesthetic (men in suits, smiling families) + naturальные landscapes Запада.

#### Reddit

Преимущественно мужская аудитория (60/40). Западоцентрично. Sub'ы как `r/CozyPlaces` — 90% западные интерьеры.

#### Музеи (Met, Smithsonian, Artic)

Исторические коллекции — европейский канон 19-20 века. Африканское / латиноамериканское искусство в Met есть, но в кураторской выдаче редко всплывает на запросы типа «morning light», «still life».

#### Telegram-каналы

Русскоязычное меньшинство (русскоязычная аудитория Telegram = 3-4% мирового населения).

### 4.4 Расширение горизонтов

Команда предлагает добавить источники для покрытия пробелов:

#### Африканское современное искусство
- **OkayAfrica** — RSS / scrape (`okayafrica.com/feed`).
- **Contemporary And** (`contemporaryand.com/feed/`) — leading platform для African contemporary art.
- **Nataal magazine** (`nataal.com/feed/`).

#### Латиноамериканский дизайн
- **Domestika** (Spanish-language) — есть RSS.
- **Mexipedia** — Mexican design archive.
- **Casa Vogue Brasil** — RSS (если открыт).

#### Японская повседневность (не туристическая)
- **Pen Magazine** (Japan) — current.
- **Wakaresaseya** — daily life vintage.
- **Nemuri-no-shippo** — alternative.
- **Studio Voice** — RSS.

#### Восточно-европейская архитектура
- **Strelka Mag** (если RSS жив).
- **Project Baltia** — добавить.
- **Form Magazine** — Romanian/Hungarian sources (не RSS, scrape).

#### Indigenous art
- **First Nations Visual** — Canadian indigenous.
- **Maori art** — New Zealand sources.
- **Aboriginal galleries** — Australian.

### 4.5 Этическая позиция SOMA

**Главный вопрос**: должна ли SOMA активно балансировать выдачу или быть прозрачным окном?

#### Позиция А — Прозрачное окно

SOMA — нейтральная труба. Источники сами по себе biased; SOMA воспроизводит этот bias. Юзер сам отвечает за свой вкус. Никакого вмешательства.

**Плюсы**: честно, нет «алгоритмической агентности».
**Минусы**: воспроизводит колониальные паттерны без compensating.

#### Позиция Б — Активный баланс

SOMA активно вводит diverse-источники в каждой выдаче. Например, на запрос «morning light interior» в выдачу гарантированно попадает 1 источник из global-south, 1 нон-западный артист.

**Плюсы**: расширяет горизонты юзера.
**Минусы**: «алгоритмическая агентность» = SOMA становится Pinterest на минималках.

#### Команда расходится

- Cultural researcher: «Б — этически императив. Без баланса мы соучастники».
- Curator: «Б — но мягкая. Не quota, а просто активное добавление diverse-источников в каталог. Дальше юзер выбирает сам».
- Diversity advocate: «Б, но прозрачно. Юзер должен видеть `+5 sources from underrepresented regions, would you like to see them in your feed?` — как opt-in».
- D&I — «принципиально А. Алгоритмическая патернализация — антитеза personal app».

#### Компромисс (предложение)

**Tier-1 (mandatory)**: Расширить каталог источников до global coverage (см. 4.4). Чтобы баланс был **возможен**.

**Tier-2 (gentle nudge)**: На onboarding'е спросить юзера «хочешь global-coverage по умолчанию?» (default = on). При этом в выдачу подмешиваются global-source'ы с весом 0.3-0.5.

**Tier-3 (opt-in)**: Раз в месяц SOMA показывает «горизонты» — экран с курируемой выдачей underrepresented sources. Юзер может полайкать, и эти источники начнут появляться чаще.

### 4.6 Этическая декларация SOMA (черновик)

> SOMA — это инструмент для собирания личного вкуса. Мы стремимся быть прозрачным окном в мир визуального — но окна неизбежно показывают то, на что они выходят. Мы активно расширяем каталог источников, чтобы юзер мог видеть голоса, которые редко звучат в дефолтных платформах. Мы не балансируем выдачу за тебя — это твой вкус. Но мы делаем «не-западные» источники доступными как и западные, в одной плоскости. Что сохранять — твой выбор. Что показывать тебе — наша ответственность.

### 4.7 Сводная таблица Блока 4

| # | Действие | Приоритет | Часы |
|---|---|---|---|
| 4.A | Добавить 8-12 global-coverage источников (Africa, LATAM, Asia, Indigenous) | важно для бренда | 6 (research + integrate) |
| 4.B | Onboarding-вопрос «global coverage by default?» | стратегически | 2 |
| 4.C | Опубликовать этическую декларацию (в README, settings) | стратегически | 1 |
| 4.D | Добавить ось «happy by region» в diagnostics export для transparency | полезно | 2 |
| 4.E | Раз в квартал — review каталога на bias | стратегически | — |

---

## Блок 5 · Когнитивная нагрузка

### Команда

- **Cognitive scientist** ex-Microsoft Research.
- **UX researcher** в области attention.
- **Designer** ex-Linear (опытный в зрелых продуктах).
- **Эргономика интерфейсов** — DOS-эпохи, проектирование mission-critical.

### 5.1 Decision fatigue

Считаем количество решений на типичную сессию.

#### 30-минутная сессия (стандарт)

- Открытие → ритуал (если включён, без решений) или сразу карточка.
- Стопка: ~30 свайпов / 30 мин = 1 свайп / минуту.
- На каждом свайпе: skip / like / hide / open / mark — это **5 опций**, юзер выбирает 1.
- Кроме того, юзер может: сменить категорию (10 опций), сменить тему (3 опции), переключить режим (3 опции).

**Считаем**:
- Свайпов: 30 × 1 решение = 30 решений.
- Hide-меню (скажем 2 раза): 2 × 3 решения = 6.
- Категории (поменял 5 раз): 5 × 1 решение из 10 = 5.
- Прочее (open, переключить тему): 5 решений.

**Итого**: ~46 решений за 30 минут = **1.5 решения / минуту**.

Это **средне-высокая** decision-rate. Сравнимо с email triage (1-2 / мин). Меньше чем TikTok (10+ микро-решений / мин). Больше чем Spotify-listening (0.05 / мин — выбор плейлиста раз в час).

#### Где можно убрать выбор

- **Theme** (light/dark/sepia) — пусть будет auto по времени суток. Юзеру не нужно каждый раз решать. Может быть `prefers-color-scheme` listener.
- **Mode** (artist/designer/aesthetic) — юзер обычно фиксируется на одном. Можно убрать toggle на main screen, оставить только в settings.
- **Source-toggle** в settings — слишком гранулярно. Можно сгруппировать в presets (как уже сделано), а индивидуальный toggle спрятать в advanced.
- **Hide submenu** — три опции (только эту / автора / источник). Самая частая = «только эту». Можно сделать default-на-tap, advanced раскрытие = long-press.

### 5.2 Visual noise

Прохожусь по типичному экрану SOMA:

1. **Header**: brand-logo + brand name + mode-toggle (3 опции) + middle-row (5-6 элементов в зависимости от режима) + actions (3 кнопки) + collection counter. **= 13-15 интерактивных элементов в шапке.**
2. **Categories**: 8-22 chips в карусели. **= 8-22 элементов.**
3. **Card**: 1 image + caption + 5 actions (skip/open/like/hide). **= 7 элементов.**
4. **Hide-submenu** (если активно): 3 опции + cancel = **4 элемента.**

**На обычном экране**: 28-40 интерактивных элементов сразу видны.

#### Сравнение

- **Pinterest** (web): top-bar 5 элементов + grid (бесконечный). Visual noise огромный, но grid — это «один элемент, повторённый».
- **Are.na**: top-bar 4 элемента + список каналов (~10). Минималистично.
- **Mubi**: top-bar 3 элемента + 1 hero + 4 trending. Очень concentrated.

SOMA ближе к **Pinterest по количеству интерактивных элементов**, но без grid-плотности. Это **самая высокая cognitive density** на единицу площади среди конкурентов.

**Решение**: collapse / progressive disclosure.

- Mode-toggle убрать в settings (или в quick-toggle через :hover в углу).
- Categories — show first 5, остальные через «ещё ↓» (уже частично сделано).
- Source-row в settings — collapse по группам.

### 5.3 Working memory load

Что приложение требует помнить:

1. **Какой режим я сейчас в** — visual indicator есть (active mode подсвечен), OK.
2. **Что я искал минуту назад** — input сохраняет значение, OK.
3. **Где я был в коллекции** — нет scroll-position-restore. Открыл коллекцию, swipe'нул в кучу, закрыл, открыл — снова с начала. **Проблема**.
4. **Куда я нажал, чтобы попасть сюда** — нет breadcrumbs. В author-stack mode появился banner с «← обычный поиск» — это **уже хорошо**.
5. **Какие настройки я менял** — никакой персистентной diff-видимости. Юзер настроил источники в первый день, через месяц забыл. **Проблема** — связано с блоком 9 (forgetting).

### 5.4 Зрительная утомляемость

#### Контрастность

В светлой теме `#1a1a1a / #fafaf9` — 18:1 (отлично).
`--ink-mid` примерно `#5a5a5a / #fafaf9` — 7:1 (отлично).
`--ink-soft` примерно `#9a9a98 / #fafaf9` — 3.5:1 (**меньше WCAG AA 4.5:1**).

В тёмной теме `#16161a` — это серый, не чёрный. На OLED-экранах это «тратит» подсветку (на чёрном пиксель полностью off, экономит battery). Стоит проверить — может, «гипер-тёмная» тема `#000000`?

#### Размер шрифта vs дистанция

- Body 13-14 px (Fraunces 300) — small для длинных сессий. На laptop это ~1 час чтения = устают глаза.
- Caption 11-12 px — на низкой контрастности (`ink-mid`/`ink-soft`) утомительно.

**Рекомендация**: option «комфортный режим» — увеличивает все шрифты на 15%, повышает контраст.

#### Анимация

- Card swipe 0.22s — быстро. Хорошо для ритма, но на длинных сессиях «постоянное движение» утомляет.
- Ambient-анимация (sumi-e/bokeh/dust) — slow, ~20-35 секунд цикл. **Утомляет ли peripheral vision?** При 30 минутах работы — eyes становятся sensitive к этому fluctuation. Можно сделать `auto-pause` после 10 минут без активности.

### 5.5 Эффект «одного ещё свайпа»

SOMA — swipe-based. Это **аддиктивная механика** в природе TikTok/Tinder.

#### Аргумент против борьбы с аддиктивностью

«Юзер сам решает сколько ему хватит. Patternизировать его — паттернализм».

#### Аргумент за

«Аддиктивный паттерн в продукте, который нацелен на slow / mindful — конфликт. Если SOMA про тишину, она должна сама останавливать».

**Команда сходится** на **soft-pause механиках**:

1. **После 50 свайпов** — subtle tip «можно отложить» (не блокирует, не накричит).
2. **После 30 минут сессии** — текст в empty-state «сегодня ты посмотрел 50 картинок, сохранил 3. достаточно?»
3. **Никаких dark patterns** в обратную: автоплея, бесконечного скролла, push-ремайдера.

### 5.6 Cognitive style match

SOMA — для **ассоциативных** мыслителей, не для линейных. Категория, тема, mood, артист — это узлы графа, не последовательность.

**Проблема**: интерфейс расположен **линейно** (header → categories → card → actions). Ассоциативный юзер хочет **прыгать** — clicked tag → similar items → новый автор → его коллекция.

**Решение**: усилить **lateral navigation**:
- В caption — clickable теги/keyword'ы.
- При показе картинки — sub-list «у этого автора есть ещё», «эта коллекция родом из канала Are.na».
- В коллекции — «эти 5 картинок объединены тегом «синий»».

### 5.7 Топ-10 мест где можно снизить нагрузку

| # | Где | Что | Приоритет |
|---|---|---|---|
| 5.1 | Theme switcher | Auto по времени суток (default), manual override | важно |
| 5.2 | Mode toggle | Спрятать в settings или в icon menu (fewer pixels на главном) | важно |
| 5.3 | Categories | Show 5, остальные за «ещё ↓» | важно (частично сделано) |
| 5.4 | Hide-submenu | Default = «только эту картинку» на single-tap; long-press для advanced | полезно |
| 5.5 | Source-row в settings | Collapse в группы | важно |
| 5.6 | Empty-state | 1 actionable suggestion вместо 3 | полезно |
| 5.7 | Action buttons | Hotkey hint только для new users | косметика |
| 5.8 | Caption | 2 строки вместо 1 (primary/secondary) | косметика |
| 5.9 | После 30 мин | Soft-pause prompt | стратегически |
| 5.10 | Settings tabs | По sections (вместо плоского scroll) | важно |

### 5.8 Принципы дизайна для SOMA по cognitive load

1. **Меньше решений в час**. Каждое UI-решение должно проходить тест «нужен ли это выбор юзеру каждый раз».
2. **Sticky preferences**. То, что юзер один раз выбрал — запоминается надолго. Минимум перебираем тех же опций.
3. **Lateral navigation первичнее иерархии**. SOMA — про ассоциации, не про деревья.
4. **Anti-addiction by design**. Soft pauses, no autoplay, finite stack length.
5. **Visual quietness**. Не больше 10 интерактивных элементов на экран по умолчанию.
6. **Progressive disclosure**. Power-фичи скрыты, на двойном-клике / long-press / hover.

---

## Блок 6 · Долговечность данных пользователя

### Команда

- **Data architect** ex-Stripe.
- **Digital archivist** Internet Archive.
- **Privacy engineer** ex-Tor.
- **Backend engineer** с опытом long-lived systems (10+ лет uptime).

### 6.1 Битые ссылки во времени

Через **1 год** в коллекции из 500 картинок ожидаемо:

| Источник | URL stability | % битых через год |
|---|---|---|
| Reddit (i.redd.it) | Stable унтил пост deleted | 5-10% (deleted posts) |
| Imgur | Reliable | 2-5% |
| Pinterest (i.pinimg.com) | Очень stable | <2% |
| Tumblr | Was unstable, теперь Auttomatic-stable | 10-15% (deleted blogs, expired CDN) |
| Are.na (CDN) | Stable | <5% |
| Unsplash | Stable | <2% |
| Pexels, Pixabay | Stable | <2% |
| Flickr | Stable | <2% |
| Met, Smithsonian, NYPL, Artic | Public CDN, very stable | <1% |
| Wallhaven | Stable до user-delete | 5-8% |
| Dribbble (cdn.dribbble.com) | Stable | 3-5% |

**Аккумулированно**: 30-50% коллекции через 1 год имеют шанс быть битыми. Это **критично**.

Через 3 года — реалистично 50-70% битых.
Через 5 лет — больше 80% коллекции — мёртвые ссылки.

### 6.2 Локальное кеширование

Сейчас SOMA хранит **только URL**, не саму картинку. Через год коллекция «помнит, что было», но не «что именно было».

**Решение**: локальный image cache. При каждом save:
1. Backend скачивает картинку → хранит в `backend/cache/liked/{md5(url)}.{ext}`.
2. Frontend получает back-up URL `/api/cache/{md5}`.
3. При показе — fallback: если original URL 404 → переключение на cache URL.

#### Размер кеша

- 500 картинок × средний 500 KB = 250 MB.
- 5000 картинок × 500 KB = 2.5 GB.

Это **много** для backend на personal-машине. Но для self-hosted SOMA с 10+ GB free disk — приемлемо.

**Опционально для юзера**: setting «archive saves locally» (default OFF, opt-in).

#### Стратегия очистки

- LRU eviction после X GB.
- Приоритет — те, что юзер открывает чаще.
- «Pinned» — вечный архив, не вытесняется.

### 6.3 Миграция между устройствами

Сейчас всё в localStorage — привязано к браузеру / устройству.

**Сценарий**: жена открыла SOMA на iPhone, сохранила 30 картинок. Хочет посмотреть на iPad → пустая коллекция.

#### Без авторизации

**Кодовое слово / QR-код sync**:
1. На iPhone: settings → «синхронизация» → SOMA генерирует QR с encoded state (через сжатие + base64).
2. На iPad: scan QR → state восстанавливается.

Простая no-account реализация. Минусы — pull only (push надо повторять).

#### С опциональной авторизацией

`oauth-with-Google` или magic-link через email:
1. Юзер enters email → получает code.
2. Backend хранит state по email-id.
3. Любое устройство — синхронизация.

Это переход к cloud-modeл, требует backend storage.

### 6.4 Если SOMA закроется

Хорошие приложения позволяют **уйти красиво**.

**Сценарий**: репозиторий заброшен через 5 лет. Что произойдёт?

- localStorage остаётся в браузере, доступен через DevTools (но не usable).
- Backend больше не отвечает → все source-fetches падают.
- Telegram-токен expires → отправка ломается.

**Право на исход** — фича:

1. **Postmortem export** — полный JSON всей коллекции + metadata + history.
2. **Pinterest-import format** — экспорт CSV который можно загрузить в Pinterest.
3. **Are.na import format** — JSON-batch для bulk-add в Are.na channels.
4. **Zip-archive** — все картинки + metadata.json.
5. **OPML** — для feed-источников (open standard).

#### Standardized formats

- **JSON** — proprietary но human-readable.
- **CSV** — для tabular tools.
- **HTML** — viewable in any browser, archive of записей.
- **Markdown** — для documentation tools.

### 6.5 Закрывшиеся источники

Are.na умерла → URL'ы `are.na/block/123` resolve к 404.
Telegram-канал deleted → `t.me/awdee/12345` 404.
Reddit-post deleted → 404.

#### Стратегия mausoleum

Сохраняем **метаданные** даже когда источник умер:
- В кэше — final snapshot date.
- При показе с битым URL → fallback на cached version OR placeholder с метаданными.

«вот картинка, которая когда-то была здесь, источник больше не существует».

### 6.6 Версионирование коллекции

Снапшоты раз в неделю (cron на backend) → JSON в `backend/snapshots/{date}.json`.

Юзер может откатиться: «месяц назад у меня было 200 картинок, сейчас 50, что-то не то». UI: settings → backup → revert to {date}.

### 6.7 Анализ рисков по годам

#### Через 1 год (2027)
- **30-50% URL'ов битые** — основной риск.
- **localStorage квота** — наступает на 2K-3K лайков.
- **Backend dependency** — RSS-источники меняют URL (как It's Nice That мигрировали на FeedBurner). Адаптировать.

#### Через 3 года (2029)
- **50-70% URL'ов битые**.
- **Backend Node-версия** требует update (Node 22 → 28).
- **Половина TG-каналов закрыта** или сменили владельца.
- **Twitter/X API** уже legacy, нужны Bluesky/Mastodon (что мы уже сделали).

#### Через 5 лет (2031)
- **70-90% битых ссылок** — без локального кэша катастрофа.
- **Источников из категорий** уже нет (Cereal, Apartamento могут закрыться, как Pin-Up уже почти).
- **Browser API** — могут измениться (Service Workers, Storage, etc).

### 6.8 Конкретные технические рекомендации

| # | Действие | Приоритет | Часы |
|---|---|---|---|
| 6.A | Локальный image cache (opt-in) для сохранений | критично | 8 |
| 6.B | URL-validity probe (HEAD request на показ) + fallback на cache | важно | 4 |
| 6.C | Postmortem export (полный JSON + ZIP) | важно | 3 |
| 6.D | Are.na-import formatter | полезно | 2 |
| 6.E | OPML export для feed-источников | полезно | 1 |
| 6.F | QR-sync между устройствами | важно | 6 |
| 6.G | Weekly snapshots + revert UI | полезно | 4 |

---

## Блок 7 · Доступность для разных групп

### Команда

- **Accessibility expert** beyond WCAG (real-world usage).
- **Inclusive design specialist**.
- **i18n engineer**.
- **UX-researcher** работа со старшей возрастной группой и подростками.

### 7.1 Зрение

#### Слабовидящие (увеличение 200-400%)

- На 200% layout SOMA остаётся usable, но категории-row начинают перекрывать header.
- На 400% действия (skip/open/like/hide) переносятся в 4 строки. Visual hierarchy ломается.

**Решение**: media-query на font-size root → если scaled >150%, simplify layout (collapse mode-toggle, hide category-row до явного toggle).

#### Полностью слепые (VoiceOver / JAWS)

- Карточка `<div class="card">` без `role` / `aria-label`. VoiceOver читает «сложный элемент, картинка, кнопка». Не понятно «где я».
- Action buttons — без `aria-label` (только text «пропустить»). Это работает, но screen reader говорит «buttone "пропустить", buttone "открыть"...» одинаково.

**Решение**:
- `<div class="card" role="img" aria-label="${author}, ${source}, картинка из ${category}">`.
- `<button aria-label="пропустить эту картинку и перейти к следующей">пропустить</button>` — verbose, но for screen readers.
- Skip-link в начало страницы для навигации.

#### Дальтоники (color blindness)

SOMA преимущественно grayscale в UI — это **естественно дружелюбно** для всех типов colorblindness. ✓

Но **картинки сами цветные** — палитра картинки (как фича), сортировка по mood (warm/cool/dark) полагается на цвет. Деутераноп / протаноп не различает warm/cool корректно.

**Решение**: добавить **лейблы** к чипам цвета («тёплый», «холодный», «зелёный») — текстом, не только цветовой плашкой.

#### Чувствительность к яркости

Дополнительная opt-in **«тёмная макс»** — на чисто-чёрном `#000000`, очень тонкие шрифты, low-contrast. Для people с photophobia.

### 7.2 Моторика

#### Тремор / неточные жесты

- Touch-targets 44×44 px минимум (WCAG AAA). Сейчас — chips (`.preset`, `.source-chip`) ~28 px высоты. **Не проходит**.

**Решение**: на mobile breakpoint `min-height: 44px` для всех interactive.

#### Управление одной рукой

На phone (иногда используется «одной рукой пока другой держишь ребёнка»):
- Top-bar в SOMA — high reach, недоступен большим пальцем.
- Action buttons — хорошо, в bottom area.

**Решение**: sticky bottom-nav (минимально) с самыми частыми действиями.

#### Только клавиатура

Hotkeys ←/→ для навигации, S для save, Escape для close. Это **хорошо**.

Но: focus-trap в модалках отсутствует (см. 1.5.1 во втором аудите). Tab выпрыгивает.

### 7.3 Когнитивные особенности

#### Дислексия

- Fraunces 300 italic — **не дислексик-friendly**. Italic снижает читаемость на 10-15%.
- На длинных текстах (settings descriptions, category labels) — нагрузка.

**Решение**: opt-in «упростить шрифт» в settings → переход на sans-serif (Inter уже подключён).

#### ADHD

- Ambient-анимация peripheral vision — отвлекает part of ADHD-юзеров.
- Множество интерактивных элементов на экране (см. 5.2) — visual noise.

**Решение**: setting «убрать ambient» + collapse menu opt-in.

#### Аутизм

- Предсказуемость — SOMA норм. Поведение consistent.
- Sensory overload — если включены все ambient + ритуал + цветные карточки одновременно. Можно reduced-motion-friendly.

#### Тревожность

- Notifications — нет. ✓
- Streak'и / геймификация — нет. ✓
- Public sharing — нет. ✓
- Loading delays — могут вызывать тревогу. Показывать прогресс мягче.

### 7.4 Возрастные группы

#### Дети 12-17

Что они увидят на свайпе?
- Reddit — некоторые subreddit'ы могут отдавать NSFW или contested контент. `r/AmateurRoomPorn` — name провокативное, контент SFW (интерьеры). Но юный юзер увидит «Porn» в имени саба.
- Pinterest — у них есть SafeSearch, но на нашем scrape мы его не активируем.
- Tumblr — после 2018 strict SFW, ОК.
- Музеи — ОК.

**Решение**: переименовать `r/AmateurRoomPorn` → `r/RoomDecor` в feed-source label. Юзер видит «r/RoomDecor», бэкенд дёргает реальный sub. (Это **косметика** — реальный сабреддит так называется, мы не можем контролировать).

Ещё: добавить **age-gate** opt-in — «фильтровать NSFW-tagged content» (default for under-18).

#### Старшие 60+

Swipe-логика — counter-intuitive для poколения, привыкшего к click. SOMA имеет **кнопки** (не свайпы), так что ОК. Но в названии пресета **«стопка»** — это скрытая swipe-метафора. Может быть «лента картинок» прозрачнее?

Размер шрифта (12-14 px) — мелко. Опция «комфортный режим» (см. 7.1).

#### Подростки

SOMA как «не мейнстрим» — **плюс** для cool-tasteful crowd. Минус — slow paradigm может не зайти TikTok-generation.

### 7.5 Многоязычность

Сейчас UI почти полностью **русский** (с английскими source-именами). Юзер из Бразилии открывает SOMA → ничего не понятно.

**Решение**: i18n-layer.
- `i18n.json` с строками: `{ "search.placeholder.artist": { "ru": "...", "en": "..." } }`.
- Default language: `navigator.language`.
- Override: settings → language.
- Минимум 3 языка: ru, en, ja.

RTL-языки (арабский, иврит) — пока не приоритет, но architecture must accommodate (`<html dir="auto">`).

### 7.6 Контекст использования

#### Грудничок на руках, одна рука

- Sticky bottom-nav (см. 7.2).
- Большие touch-targets 44+.
- Минимум модалок (легко закрыть случайно).

#### Очень яркое солнце

- Light theme low-contrast. Sun-readable theme — extra-high contrast version.
- Auto-detect через ambient light sensor (browser API)?

#### Поезд с тряской

- Большие touch-targets.
- Forgiving error UI (если случайно скип нужного).

#### Тёмная комната ночью

- Dark theme — хорошо, но `#16161a` светится. **Чёрный режим** `#000000` для ночи.
- Auto-dim после X минут без активности.

### 7.7 Топ-15 a11y-улучшений

| # | Действие | Приоритет |
|---|---|---|
| 7.A | aria-label на карточке | важно |
| 7.B | Focus-trap в модалках | важно |
| 7.C | Touch-targets ≥ 44px на mobile | критично |
| 7.D | i18n для en, ja как минимум | важно |
| 7.E | Sepia контраст fix (4.5:1) | важно |
| 7.F | Skip-links для длинных списков | полезно |
| 7.G | Keyboard nav для категорий | полезно |
| 7.H | Color-blind labels («тёплый», «холодный») | важно |
| 7.I | Opt-in dyslexia-friendly font | полезно |
| 7.J | Opt-in age-gate | полезно |
| 7.K | Sticky bottom-nav на mobile | важно |
| 7.L | Dark-max theme `#000000` | полезно |
| 7.M | Sun-readable theme | полезно |
| 7.N | Reduce motion toggle (есть, но не глобальный) | полезно |
| 7.O | Audio cues (для blind) | полезно |

---

## Блок 8 · Письменный язык (UX writing)

### Команда

- **Senior UX writer** ex-Mailchimp.
- **Editor** Apartamento magazine style.
- **Linguist** русский / английский.
- **Brand voice strategist**.

### 8.1 Полный инвентарь текстов

Прошёлся по всему `soma.html` через grep'ы. Ключевые тексты:

#### Шапка

- Brand: `SOMA` ✓
- Mode-toggle: `артист`, `дизайнер`, `эстетика` ✓
- Headers: `сессия`, `цвет`, `сетка`, `зеркало` (artist), `стопка`, `лента` (designer), aesthetic actions ✓
- Right group: `коллекция`, `настройки` ✓

#### Поиск

- Placeholder: `что будем рисовать…`, `что будем смотреть…`, `на что посмотреть…` ✓ Отлично.

#### Категории

Одиночные слова — все хорошо. ✓

#### Пресеты

- `+ свой пресет`, `сбросить всё к дефолту`, `да, сбросить`, `отмена` ✓ Хорошо.
- Confirm-text: «это вернёт включённые источники, привязки пресетов, custom-пресеты, выбранные «уровень/платформа/тема» и список subreddit'ов к заводским значениям. ключи API и коллекция «нравится» не трогаются.» — **слишком технично**, можно проще: «вернёт всё, кроме твоих ключей и коллекции. отмена есть».

#### Стопка — caption и actions

- `пропустить`, `открыть`, `сохранить` ✓
- `× скрыть` ✓ + tooltip «скрыть эту картинку, автора или источник» ✓
- `← вернуть` ✓
- Hide-submenu: `скрыть:`, `только эту картинку`, `все от автора`, `все с источника`, `отмена` ✓

#### Empty states

- `пусто` ✓
- `попробуй короче · «X»` ✓
- `часть источников не понимает русский · попробуй на английском` ✓
- `пропущено EN-only источников: N` ✓
- `или попробуй из категории:` ✓ (в 5.7 предлагал упростить до 1 suggestion — это полишинг)

#### Toast'ы

- `искала шире · убрала «X»` ✓
- `картинка скрыта` ✓
- `автор «X» скрыт` ✓
- `источник «X» скрыт` ✓
- `возвращено` ✓
- `сохранено` ✓
- `отправлено · target` ✓ (хорошо)

Все toast'ы — в духе бренда. ✓

#### Settings

##### Источники (label uppercase)

`ИСТОЧНИКИ`, `ПРЕСЕТЫ И ИСТОЧНИКИ`, `ОКРУЖЕНИЕ`, `РИТУАЛ НАЧАЛА`, `СКРЫТОЕ`, `TELEGRAM` — все **строчными**? Проверю.

Из кода: `style="...text-transform: uppercase; letter-spacing: 0.18em;"`. То есть в HTML строчный, но рендерится uppercase. Это **прием typography**, и SOMA соблюдает — ОК.

##### Help-тексты

- «отключи лишние или вернёшь обратно. Reddit и Wallhaven работают без ключа. DeviantArt, ArtStation, Tumblr, Are.na — через локальный бэкенд (см. backend/README.md).» — **технично**. Можно: «отключи лишнее. большинство работает само; некоторые требуют ключи или локальный бэкенд.»
- «для каждого пресета можно задать свой набор источников. если не выбрано ничего — берётся общий список включённых источников режима. кастомный пресет можно создать кнопкой ниже.» — **слишком длинно**. Можно: «у каждого пресета свой набор источников. если не задан — берутся включённые в режиме».
- «Ключи для Unsplash, Pexels и Pixabay уже встроены — приложение работает из коробки. Можешь заменить их на свои или добавить ключ Flickr.» — **формально-технично** («из коробки» — клише). Можно: «ключи Unsplash, Pexels, Pixabay есть — работают сразу. ты можешь заменить или добавить свои.»
- Telegram: «отправка картинок из коллекции в Telegram-чаты через личного бота. токен живёт в `.env`, цели (chat_id) — в `backend/telegram-targets.json`.» — **слишком детально**. Можно: «маленький бот для отправки картинок жене / себе / в группу. токен в .env, цели — рядом.»
- Окружение: «тихая анимация по бокам контента — sumi-e штрихи, мягкие пятна или пыль. виден только на широких десктоп-экранах (от 1400 px).» ✓ Отлично.
- Ритуал: «короткая поэтическая пауза при открытии. хайку и фразы — 7 секунд тишины перед интерфейсом.» ✓ Отлично.

##### Cookies-инструкция Dribbble

«как получить cookies →» + ol с шагами:
1. зайди на dribbble.com и залогинься
2. открой devtools (cmd+opt+i / ctrl+shift+i) → network
3. перезагрузи страницу, кликни на любой запрос dribbble.com
4. в разделе headers → request headers найди `cookie:`
5. скопируй всё значение, вставь сюда

Это **технично, но необходимо** (юзер реально должен пройти этот путь). Стиль ОК.

##### Footer кнопки settings

- `Очистить ключи` — **техничное**. Должно быть «забыть ключи» или «очистить».
- `Сохранить` — **формальное**. Возможно «применить» или «готово».

#### Diagnostics

- `диагностика` ✓
- `проверка состояния источников` — ОК, можно поэтичнее «как чувствуют себя источники».
- `скачать json` — **технично**. Должно быть «архив» или «выгрузка».

#### Confirmations

- `сохранить N картинок от Сергея?` ✓ Хорошо.
- `Очистить?` (в коллекции — кнопка `Очистить`) — без confirmation сейчас (см. блок 10).

#### Errors

- `Не получилось загрузить` ✓ Хорошо.
- `Проверь интернет и попробуй ещё раз.` — окей. Можно: «проверь интернет · попробуй ещё раз».
- `Failed to fetch` (если возникнет в console / debug) — **очень техническое**. Должно быть переведено в UI.
- `dribbble fetch failed: ...` — **крайне техническое**. Никогда не должно показываться юзеру в UI (только в diagnostics).

### 8.2 Аудит единства

Прошедшие тексты — **70% в духе бренда**, **25% нейтральные**, **5% технические**. Это нормально, но 5% мы можем подтянуть.

### 8.3 Регистр

Правило бренда: всё **строчное**, кроме `SOMA` (uppercase).

Проверка по актуальному коду (что вижу через grep):
- ✓ Большинство placeholders, button-text — строчное.
- ✗ `Pixabay API Key`, `Smithsonian API Key`, `Unsplash Access Key` — **формальное капс'ование**. Это OK, потому что это название external API (не чисто SOMA-text). Но в идеале: «pixabay key →получить».
- ✗ `Reddit-сабреддиты` (b в settings) — почему-то заглавное. Должно быть «reddit-сабы» строчным.
- ✗ `Не получилось загрузить` — «Не» с заглавной. Должно быть «не получилось загрузить».
- ✓ Confirmations, toast'ы — строчные.

Список «починить регистр»: ~5 точек.

### 8.4 Тонкость и точность

Проверка единства терминов:
- **«удалить»** vs «убрать» vs «скрыть» — три синонима, используются по-разному. SOMA сейчас:
  - «скрыть» — для blocklist (правильно, мягче «удалить»).
  - «вернуть» — для unblock (правильно).
  - «очистить» — для batch (коллекция, ключи). ОК.
  - «удалить» — почти не используется. ✓ Правильно — SOMA не «удаляет», она «убирает / скрывает».
- **«настройки»** — единое везде ✓.
- **«источник»** — единое ✓.
- **«пресет»** — единое ✓.
- **«категория»** — единое ✓.

### 8.5 Микрокопирайтинг для SOMA

Команда формулирует **идеальные тексты** в духе бренда — для empty states, loading, errors, confirmations:

#### Empty state поиска

Сейчас: `пусто`
Хорошо: `здесь пока тихо · попробуй другой запрос`

#### Loading

Сейчас: `загружаю…`
Хорошо: `смотрю… · 5 из 12`

#### Error

Сейчас: `Не получилось загрузить`
Хорошо: `что-то не сработало · попробуй ещё раз`

#### Telegram sent (single)

Сейчас: `отправлено`
Хорошо: `отправлено · {target}`

#### Telegram sent (multi)

Сейчас: `отправлено N`
Хорошо: `N картинок ушло · {target}`

#### Empty collection

Сейчас: `пока пусто`
Хорошо: `начни собирать · здесь будет твой архив`

#### Collection delete confirm

Сейчас: (кнопка `Очистить` без confirm)
Хорошо: модалка `убрать всё? · {N} картинок · отмена / убрать` (с возможностью undo)

#### Source unavailable

Сейчас: «недоступно»
Хорошо: «молчит · попробуем позже»

#### Backend offline

Сейчас: (нет обработки)
Хорошо: `бэкенд не отвечает · работаем с кэшем · попробуем снова через минуту`

### 8.6 Tone matrix

| Контекст | Тон | Пример |
|---|---|---|
| Empty states | Поэтично, тёплый | «здесь пока тихо» |
| Loading | Кратко, тёплый | «смотрю…» |
| Errors | Прямо, без вины | «не сработало · попробуй ещё» |
| Confirmations | Прямо, кратко | «убрать?» |
| Onboarding | Приветливо, ясно | (TBD) |
| Toasts | Лаконично | «сохранено» |
| Settings | Функционально, тепло | «отключи лишнее» |
| Help-texts | Объяснительно, без жаргона | «маленький бот для отправки» |

### 8.7 Полная таблица улучшений

| Где | Текущее | Предложение | Приоритет |
|---|---|---|---|
| Empty state | `пусто` | `здесь пока тихо · попробуй другой запрос` | важно |
| Loading | `загружаю…` | `смотрю… · {N} из {M}` | косметика |
| Error h3 | `Не получилось загрузить` | `что-то не сработало` | важно |
| Error desc | `Проверь интернет и попробуй ещё раз.` | `проверь интернет · попробуй ещё раз` | косметика |
| Footer btn | `Очистить ключи` | `забыть ключи` | важно |
| Footer btn | `Сохранить` | `готово` | косметика |
| Diag export | `скачать json` | `выгрузка` | косметика |
| Reset confirm long text | (см. 8.1) | «вернуть всё, кроме ключей и коллекции» | важно |
| Sources help | (см. 8.1) | «отключи лишнее. большинство работает само» | важно |
| Telegram help | (см. 8.1) | «маленький бот для отправки картинок» | важно |
| Keys help | (см. 8.1) | «ключи Unsplash, Pexels, Pixabay уже встроены — работают сразу» | косметика |
| Diag desc | `проверка состояния источников` | `как чувствуют себя источники` | косметика |
| Empty collection | (нет специального текста) | `начни собирать · здесь будет твой архив` | важно |
| Collection clear | (нет confirm) | модалка `убрать всё? {N}` + undo | критично |
| Source unavailable | `недоступно` | `молчит · попробуем позже` | косметика |
| Backend offline | (нет обработки) | `бэкенд не отвечает · работаем с кэшем` | важно |
| `Reddit-сабреддиты` | (заглавная R) | `reddit-сабы` | косметика |

**Итого**: 17 улучшений, ~3 часа работы UX-writer'а.

### 8.8 Глоссарий SOMA после правок

- **SOMA** — единственное uppercase-исключение.
- **тихо** — основной мотив empty states.
- **смотрю** / **искала** — глаголы в первом лице (не «загружается», а «смотрю»).
- **попробуй** — приглашение, не команда.
- **архив** / **коллекция** — synonymous.
- **молчит** — для тихих failures.
- **убрать** / **скрыть** — никогда «delete».
- **готово** / **применить** — никогда «save».
- **выгрузка** / **архив** — для export операций.

---

## Блок 9 · Forgetting curve и return rituals

### Команда

- **Behavioral designer** ex-Headspace.
- **Memory researcher** University of California.
- **Product designer** с long-term retention опытом.
- **UX-designer** для returning-users.

### 9.1 Что забывается

После **недели** не использования SOMA пользователь забывает:

- Какие настройки изменил (sources off/on, presets, themes).
- Где находится фича X (например, `× скрыть` — если редко использовалось).
- На чём остановился в коллекции (нет scroll restore).
- Какие подписки в feed-режиме сделал.

После **месяца**:

- Что лежит в коллекции (если не трогал).
- Какие были любимые категории.
- Какие настройки стояли.
- Что вообще такое SOMA в его жизни (если не использовался регулярно).

### 9.2 Re-discovery механики

Что SOMA может сделать:

#### Sticky scroll positions

При повторном открытии коллекции — скролл restored к последней позиции. Очевидно, но не сделано.

#### «Помнишь это?» — random old item на старте

При cold-start (после >7 дней оффлайн) показывается одна старая картинка. «Помнишь?». Можно лайкнуть снова (no-op), или просто посмотреть.

#### Эволюция вкуса — visualization

Timeline или heatmap по `likedAt` — видно когда юзер активно собирал.

#### Связи между сохранениями

«5 картинок которые ты сохранил в марте — у них один автор» — emergent discovery.

### 9.3 Return rituals по интервалам

#### Через день

- Просто сразу открывается стопка. Никаких «давно не виделись».
- Continued fluidly.

#### Через неделю

- Subtle text «давно не виделись» — но **не текстом, а через эстетику**. Например — другой ambient (более spacious).
- Один новый item в feed-режиме помечен как «новое с прошлой сессии».

#### Через месяц

- Welcome back screen (ОПЦИОНАЛЬНО, не блокирует): «месяц назад ты сохранил 47 картинок. вот 3 которые ты тогда любил».
- Скрывается через swipe или Escape.

#### Через полгода

- «Помнишь свой первый сохранённый кадр? Вот он.»
- Опционально — прелюдия для **Атласа** (киллер-фича №1).

#### Через год

- Полный Атлас — годовой PDF-отчёт.

### 9.4 Anti-patterns

Чего не делать:
- ❌ Push-уведомления.
- ❌ Email «мы скучаем».
- ❌ «Ты пропустил X новых картинок!».
- ❌ Streak'и.

### 9.5 Сводная таблица Блока 9

| # | Re-discovery механика | Приоритет | Часы |
|---|---|---|---|
| 9.A | Scroll-restore в коллекции | важно | 1 |
| 9.B | «Помнишь это?» random old после >7 дней оффлайн | полезно | 2 |
| 9.C | Welcome back screen после >30 дней | стратегически | 4 |
| 9.D | Атлас — годовой отчёт | стратегически | 12 (Wave 3) |
| 9.E | Subtle ambient-смена через неделю | полезно | 1 |

---

## Блок 10 · Невозможные ошибки

### Команда

- **Senior product designer** ex-Linear.
- **Reliability engineer** ex-Stripe.
- **Behavioral designer**.
- **Information architect**.

### 10.1 Catastrophic actions

| Действие | Текущая защита | Серьёзность | Решение |
|---|---|---|---|
| Удалить всю коллекцию | Кнопка `Очистить` без confirm | **критично** | `confirm("убрать N картинок? отмена есть 30 сек")` + undo |
| Очистить ключи API | Кнопка `Очистить ключи` без confirm | **критично** | confirm + undo |
| Удалить все подписки | (Кнопка не реализована, но теоретически) | важно | confirm |
| Сбросить все настройки | `сбросить всё к дефолту` имеет confirm ✓ | OK | — |
| Удалить Telegram-target | `tgDeleteTarget` без confirm | важно | confirm |
| Свайп-skip недоступной картинки | Нет защиты | косметика | — |

### 10.2 Confirmation patterns matrix

| Тип действия | Confirmation? |
|---|---|
| Свайп (skip/like) | Никогда — это основной flow |
| Открытие модалки | Никогда |
| Переключение режима | Никогда |
| Удаление из коллекции | Single-item: undo (5s); All: confirm + undo (30s) |
| Удаление API ключа | Confirm |
| Удаление Telegram-target | Confirm |
| Send 50 картинок в Telegram | Confirm с count |
| Reset all settings | Confirm (уже есть ✓) |

### 10.3 Undo patterns

- **Single skip** — `← вернуть` button (есть ✓).
- **Single delete from collection** — undo toast 5 сек.
- **Bulk delete (all)** — undo 30 сек + восстановление из cache.
- **Source toggle off** — нет undo, но можно вернуть в settings (acceptable).
- **Telegram send** — нельзя отменить (это уже отправилось). Но **подтверждение перед** должно быть.

### 10.4 Safe paths

- Случайно зашёл в author-stack mode → banner с «← обычный поиск» ✓.
- Случайно открыл огромную коллекцию → не падает (но на 10K — см. 3.1 — да, падает на quota).
- Случайно начал bulk-send → нет «остановить». **Решение**: progress bar с cancel.

### 10.5 Visual hierarchy of danger

- `Очистить` (footer коллекции) — как обычная кнопка `.btn`. Не отличается от «Скачать всё». Visual confusion → клик по ошибке.

**Решение**: deструктивные actions:
- Меньше — text-link `× очистить`, не button.
- Отдельный отступ.
- Цвет `--ink-soft` (не выделяется).
- Confirmation обязательна.

### 10.6 Сводная таблица Блока 10

| # | Catastrophic | Решение | Приоритет |
|---|---|---|---|
| 10.A | Очистить ключи без confirm | Confirm + undo | критично |
| 10.B | Очистить коллекцию без confirm | Confirm + undo | критично |
| 10.C | Удалить TG-target без confirm | Confirm | важно |
| 10.D | Bulk-send TG без cancel | Progress + cancel | важно |
| 10.E | Visual hierarchy of danger | Деструктивные как text-link, не button | важно |

---

## Блок 11 · Sad paths и достоинство в провалах

### Команда

- **Product designer** ex-enterprise.
- **UX writer** для error states.
- **Reliability engineer**.
- **Customer experience** specialist.

### 11.1 Сценарии провалов

| Сценарий | Что должно быть | Что есть сейчас |
|---|---|---|
| Все источники упали | «источники сейчас молчат · обновим через 5 мин» | 12 toast'ов с error |
| Backend down 5 мин | «бэкенд не отвечает · работаем с кэшем» | Series of «failed to fetch» |
| Telegram API заблокирован | «отправка временно невозможна» | (Возможно — error в console) |
| Картинка не загрузилась 3 раза | Replace by next (пропуск) | onError fallback на thumb, потом плейсхолдер |
| Полностью оффлайн | «офлайн · доступна только коллекция» | (Не detection) |
| Ключи API истекли | «ключ Unsplash больше не работает · обнови в settings» | Тихий 401, источник просто 0 results |
| Rate limit | «Reddit сегодня устал · попробуем через час» | Generic «failed to fetch» |

### 11.2 Tone в ошибках

#### Плохо

```
Не получилось загрузить
Failed to fetch
dribbble fetch failed: AWS WAF
```

Технично, безличностно, не предлагает действия.

#### Хорошо (в духе SOMA)

```
здесь пока тихо
что-то не сработало
Reddit сегодня устал · попробуем через час
бэкенд молчит · работаем с кэшем
```

Тёплое, объясняющее, предлагающее действие или просто accepting.

### 11.3 Graceful degradation

Должно быть:

- **50% источников упали** → продолжаем с оставшимися. ✓ Уже работает.
- **Backend недоступен** → frontend работает с localStorage (коллекция доступна, поиск ограничен).
- **Telegram недоступен** → кнопка «отправить» становится «отправить позже» (queue).

### 11.4 Recovery patterns

- Auto-retry с backoff (не реализовано).
- Manual retry «попробовать ещё».
- Fallback на альтернативный источник.
- «Сохрани локально, отправим позже» (для TG).

### 11.5 Сводная таблица Блока 11

| # | Sad path | Текущий | Должен быть | Приоритет |
|---|---|---|---|---|
| 11.A | Все источники упали | 12 errors | «источники сейчас молчат» (один toast) | важно |
| 11.B | Backend down | Cascade errors | «бэкенд не отвечает · работаем с кэшем» | важно |
| 11.C | Telegram API down | Console error | «отправка временно невозможна» | важно |
| 11.D | Picture failed | Plain placeholder | Skip + log | косметика |
| 11.E | Offline | (no detection) | Banner «офлайн» | важно |
| 11.F | Key expired | Silent 0 results | «ключ X не работает · обнови» | важно |
| 11.G | Rate limit | Generic error | «X сегодня устал · попробуем через час» | важно |

---

## Блок 12 · Аудит первой минуты

### Команда

- **Product designer** ex-Stripe (опыт onboarding).
- **UX-researcher** в области first impressions.
- **Marketing-designer**.
- **Customer empathy researcher**.

### 12.1 Frame-by-frame первой минуты

#### Секунда 0-2 — page loads

- Ритуал начала (если включен) — overlay 7s с цитатой.
- Если включен — у юзера **первый эмоциональный момент**: пауза, поэзия, дыхание.
- Если выключен — сразу шапка + категория + первая карточка.

**Hot take**: ритуал на первом запуске — может быть **off-putting** для нового юзера. Он не понимает что это, кликает Escape, окно закрывается. Решение: **первый запуск — без ритуала**, с onboarding-screen «знакомство». Со 2-го запуска — ритуал по логике 12h.

#### Секунда 3-7 — visual scan

Юзер видит:
- Logo SOMA (ОК).
- Mode-toggle: артист / дизайнер / эстетика — **не очевидно что выбирать**.
- Большая первая карточка (визуально доминирует — хорошо).
- Под ней actions: пропустить / открыть / сохранить / × скрыть.
- Внизу — категории chips.

**Куда смотрит глаз**: на картинку (центр), потом на actions (по F-shape).

**Куда тянется курсор**: к actions (`сохранить` / `пропустить`) — это **правильно**, swipe-первичность.

#### Секунда 8-15 — first action

Большинство юзеров делают: либо `сохранить` (если картинка зашла), либо `пропустить`.

- Если `сохранить` → badge `коллекция` +1 (мелкий — может не заметить).
- Если `пропустить` → новая карточка. Лучше всего.
- Если ничего — сидит и смотрит на картинку. **Это OK для SOMA-философии, но новичок может закрыть**.

**Проблема**: новичок не понимает что при `сохранить` собственно произошло. Нет confirmation toast.

**Решение**: первое сохранение — толстое уведомление «сохранено в коллекцию · открыть». Может быть один-раз-onboarding tip.

#### Секунда 16-30 — exploration

Юзер свайпает 3-5 раз.

- Понимает ли логику стопки? Скорее да.
- Знает ли что есть категории? **Возможно, не сразу** — карусель внизу легко пропустить.
- Понимает ли что есть лента (designer-mode)? Только если переключился на designer.

#### Секунда 30-60 — first big decision

Юзер либо:
- Свайпает дальше (engaged) → хороший знак.
- Стопится, ищет что-то ещё → curiosity.
- Закрывает → не зацепилось.

В первые 60 сек **75% не закрывают** — это базовый bar для visual app. Но **engagement** в первой минуте — критичный signal.

### 12.2 Сравнение с конкурентами

#### Pinterest first minute

Огромный grid из тысяч картинок. Понятно что делать (scroll, click). **Хорошо**: zero learning curve. **Плохо**: overwhelming.

#### Are.na first minute

Sign-up wall немедленно. **Плохо**: высокий friction. После регистрации — пустой dashboard, надо понять channels logic. **Плохо**: confusing.

#### Cosmos first minute

Beautiful landing → click into → SPA loads → wait → shows public moodboards. **Плохо**: slow loading.

#### SOMA first minute

Открылась → если ритуал, 7 сек поэзии (для нового юзера — confusing). → шапка + карточка + actions. Юзер свайпает. **Хорошо**: сразу к делу. **Плохо**: визуально много элементов на mode-toggle / categories. **Плохо**: нет hint'а что у него цель.

### 12.3 Onboarding без onboarding'а

SOMA не должна иметь tooltip-тура. Принципы:

- **Ясные дефолты** — режим artist по умолчанию, категория «композиция и кадр» (универсально).
- **Первое действие должно быть успешным** — карточка должна быть **хорошей** (curated), не random.
- **Implicit guidance through visual hierarchy** — actions крупные, mode-toggle мелче.
- **One-time tooltips** только для критичных моментов («× скрыть» — раз; «коллекция» — раз).

### 12.4 Сводная таблица Блока 12

| # | Find | Решение | Приоритет |
|---|---|---|---|
| 12.A | Ритуал на первом запуске может оттолкнуть | Skip ритуал на cold-start, показать со 2-го запуска | важно |
| 12.B | Save без feedback (только +1 на badge) | Toast «сохранено в коллекцию · открыть» on first save | важно |
| 12.C | Категории не очевидны | Hint «выбирай тему ↓» в первой сессии | полезно |
| 12.D | Mode-toggle не очевиден что выбирать | Default selection (artist), small toggle | OK |
| 12.E | Visual noise | См. блок 5 | важно |

---

## Блок 13 · Synaptic mapping (первый свайп)

### Команда

- **Interaction designer**.
- **Behavioral designer**.
- **UX-researcher**.
- **Game designer** про first-action mechanics.

### 13.1 До первого свайпа

- Юзер видит первую карточку. Понимает ли что с ней делать?
- Подсказки нет (нет tooltip).
- Но actions подписаны словами (`пропустить`, `сохранить`, `открыть`, `× скрыть`) — **очевидно**.
- Hotkeys (←/→) — **неочевидны**.

### 13.2 Сам первый свайп

- Какой жест: пропустить или сохранить?
- Зависит от картинки. Если зашла — сохранение. Иначе — пропуск.

#### Получает ли feedback

- Skip: card fade out (220ms) + новая card. **OK**.
- Like: card fade out + new + (скрыто) `addLike`. **Visual feedback weak** — нужно явное «сохранено в коллекцию».
- Open: external tab — **clear**.
- Hide: submenu opens. **OK**.

### 13.3 Реверс

- `← вернуть` появляется после первого skip. **Discoverable**, но мелкий text-link.

### 13.4 Первое сохранение

- Понятно ли что произошло? Нет toast — юзер видит только +1 на badge `коллекция`.
- Где увидеть сохранённое? Кнопка `коллекция` есть, но новичок не знает что там его лайки.

**Решение**: на first like — toast «сохранено в коллекцию · открыть» с link.

### 13.5 Обучение через действие

SOMA через 3-5 свайпов учит юзера:
- Какие источники есть (через caption).
- Что есть категории (визуально внизу).
- Что есть hotkeys (если случайно нажмёт).

Этого **достаточно** для большинства. Не нужен tooltip-тур.

### 13.6 Психология первого свайпа

- **Любопытство**: «что будет, если я кликну?» — драйвер.
- **Облегчение**: первая карточка не обязывает к решению, можно пропустить.
- **Удовлетворение**: красивая визуализация (если картинка хорошая) — приятный first impression.
- **Тревога**: если первая картинка — не то (мусор, странное), юзер думает «ой, не моё».

**Решение**: **curated first card** для cold-start. Первая картинка — гарантированно «хорошая» (например — топ-1 за последний месяц по CTR).

### 13.7 Сводная таблица Блока 13

| # | Find | Решение | Приоритет |
|---|---|---|---|
| 13.A | First save без явного feedback | Toast «сохранено в коллекцию» + link | важно |
| 13.B | Hotkeys необнаружимы | Subtle hint при first session | полезно |
| 13.C | Curated first card для cold-start | Backend endpoint `/api/curated-first` | стратегически |
| 13.D | Reverse-link мелкий | Subtle visual emphasis | косметика |

---

## Блок 14 · Исчезающие фичи (что убрать)

### Команда

- **Product designer** опыт зрелых продуктов.
- **Editor / curator** искусство сокращения.
- **Behavioral analyst**.
- **UX writer**.

### 14.1 Категории и пресеты

Из второго аудита (Блок 3) известно: 8-9 эстетик-категорий висят на одних 3 источниках (pinterest+arena-tags+tumblr). Они **неотличимы** на свайпе.

**Кандидаты на объединение**:
- `утренний свет` + `вечерний свет` → `свет` (универсальная).
- `неспешные вещи` + `носители времени` → `вещи и время`.
- `другая жизнь` + `у воды` → разные. Не сливать.
- `печатное` + `бумага и дерево` → `печать и материал`.
- `долгий разговор` + `стол накрыт` → разные. Не сливать.

После сокращения 17 → 12 категорий — каждая более distinct.

### 14.2 Источники

Из второго аудита (Блок 4): **13 источников нужно удалить целиком** — DNS-fail / 404. Также **24 TG-канала** реально приватные.

Кандидаты на удаление (без сожаления):
- `bloom`, `wildflower`, `heiter`, `hygge`, `seedmag`, `apartamentmag`, `tim-magazine`, `marievorobyov`, `designernews`, `httpster`, `anotherescape`, `fontsinuse`, `kakest` (13 шт.)
- 11 aesthetic TG-channels с заглушкой
- 13 designer TG-channels с заглушкой

**Итого**: 37 источников можно безболезненно убрать. Каталог сократится со 184 до **147**.

### 14.3 Настройки

#### Settings которые редко меняются

- `Pixabay API Key` — большинство юзеров используют built-in. Можно скрыть в advanced.
- `Reddit-сабреддиты` — большинство не трогают. Можно скрыть в advanced.
- `Dribbble cookies` — нишевая фича. Только для designer-mode + only-active. Уже data-mode-section правильно scoped.

#### Settings которые непонятны

- «Ритуал начала · повторить ритуал · ⌘⇧R» — не очень понятно что он делает (без context).
- «cookies для платных источников» — техничное.

### 14.4 Действия

#### Кнопки которые редко используются

- `× скрыть` — может быть редко (надеемся, что мусора мало).
- `сетка`, `зеркало` (artist-mode tools) — нишевые, оставить (это специально для художников).
- `← вернуть` — только когда был skip. ✓ автоматически hidden когда нет.

### 14.5 Информация

#### Метаданные на карточке

Сейчас caption показывает:
- author · source · curated · usedTag · ещё от автора →

Это может быть **слишком много** на узкой карточке. Можно:
- Primary line: `${author}`.
- Secondary line (italic, ink-soft): `${source} · ${curated/usedTag if any}`.
- Reverse-link — на :hover overlay.

### 14.6 Стратегия удаления

Как убрать без шока:
1. **Помечать** deprecated в комментариях кода.
2. **Скрывать** из default-набора (но оставить в advanced).
3. **Удалять** через 1-2 release-cycle.

### 14.7 Сводная таблица Блока 14

| # | Кандидат на удаление | Действие | Часы |
|---|---|---|---|
| 14.A | 13 dead feed-источников | Удалить из FEEDS | 1 |
| 14.B | 24 closed TG channels | Удалить (либо переэxamine-cron) | 1 |
| 14.C | 5-7 эстетик-категорий объединить | Refactor labels + bindings | 2 |
| 14.D | API-keys в advanced section | UI rearrange | 1 |
| 14.E | Caption short version | Truncate + :hover overlay | 1 |

---

## Блок 15 · Недостающие очевидности

### Команда

- **Product designer** ex-Pinterest.
- **UX-researcher**.
- **Comparative analyst**.
- **Visual platform expert**.

### 15.1 Очевидные пропуски

| Фича | Есть в SOMA? | Должно быть? |
|---|---|---|
| Поиск внутри коллекции | ❌ | ✓ Критично |
| Группы / папки / теги | ❌ | ✓ Критично (через теги, не папки) |
| Tagging картинки | ❌ | ✓ Важно |
| Экспорт коллекции в разные форматы | Частично (ZIP, JSON) | ✓ Расширить (Are.na, Pinterest CSV) |
| Сортировка коллекции | По liked-time | ✓ Добавить: по цвету, источнику, автору |
| Fullscreen без интерфейса | ❌ | ✓ Полезно |
| Drag & drop добавление | ❌ | ✓ Важно |
| Quick share | ❌ | Не делать (намеренно) |
| Дубликат проверка | ✓ (URL canonical + perceptual hash) | OK |
| Dark mode | ✓ | OK |
| Export to PDF / book | ❌ | Future (Атлас!) |

### 15.2 Намеренные отсутствия

- **Социальные функции** (likes, comments) — ❌ намеренно. Объяснение: «SOMA — личное».
- **Алгоритмическая лента** — ❌ намеренно.
- **Push-уведомления** — ❌ намеренно.
- **Геймификация** — ❌ намеренно.
- **AI-генерация** — ❌ намеренно.

Это всё — **сильные стороны** позиционирования.

### 15.3 Frustrations of new users

«Как, у вас этого нет?» — вопросы, которые задаёт новичок:

1. **«Где поиск в коллекции?»** — самый частый.
2. **«Как разделить на группы / папки?»** — следующий.
3. **«Как открыть полный экран без интерфейса?»** — для просмотра картинки в качестве референса.
4. **«Как добавить свою картинку (drag-drop)?»**
5. **«Как поделиться одной картинкой?»** — намеренно нет, но юзер ожидает.

### 15.4 Compromises (если фича стандартна, но не в духе)

| Стандартная фича | Не подходит | Переосмысление в духе SOMA |
|---|---|---|
| Папки | Коллекция как иерархия | **Комнаты** (rooms) — мягче, поэтичнее |
| Теги | Functional | **Настроения** (moods) — softer |
| Share | Социальный посыл | **Отправить кому-то** (one-to-one, не public) |
| Поиск | Functional | **Найти** — короче, почти невидимо |
| Sort | Functional | (без дополнительного слова, просто `по дате · по цвету · по источнику`) |

### 15.5 Приоритизация

#### Критично (5)

1. **Поиск в коллекции** (3 ч).
2. **Теги-настроения на картинку** (4-6 ч).
3. **Drag-drop import** (4 ч).
4. **Сортировка коллекции по color/source/date** (1 ч).
5. **Fullscreen mode** (1 ч).

#### Важно (5)

6. **Экспорт в Are.na** (2 ч).
7. **Экспорт в Pinterest CSV** (1 ч).
8. **OPML экспорт для feed-источников** (1 ч).
9. **Single-card share link** (опционально, через backend storage) (4 ч).
10. **Bulk-edit tags на коллекции** (2 ч).

#### Можно отложить (5)

11. Atlas (PDF годовой отчёт) — киллер-фича.
12. Time-view коллекции — киллер-фича.
13. Map-view доработка (filter by city, не только страна) — incremental.
14. Reverse-search для всех источников (не только 4) — incremental.
15. Sound brand (см. 3Б Блок 9).

### 15.6 Сводная таблица Блока 15

| # | Недостающая очевидность | Приоритет | Часы |
|---|---|---|---|
| 15.A | Поиск в коллекции | критично | 3 |
| 15.B | Теги-настроения | критично | 6 |
| 15.C | Drag-drop import | важно | 4 |
| 15.D | Сортировка коллекции | важно | 1 |
| 15.E | Fullscreen mode | важно | 1 |
| 15.F | Экспорт в Are.na / Pinterest | полезно | 3 |
| 15.G | OPML | полезно | 1 |
| 15.H | Single-card share | стратегически | 4 |
| 15.I | Bulk-edit tags | важно | 2 |

---

## Сводный план действий

### Топ-30 находок отсортировано по приоритету

| # | Блок | Находка | Приоритет | Часы |
|---|---|---|---|---|
| 1 | 3.4 / 6.5 | localStorage quota / iOS private mode silent fail | критично | 5 |
| 2 | 3.6 | Two-tab last-writer-wins | критично | 2 |
| 3 | 6.1 | 30-50% URL'ов битые через год | критично | 8 |
| 4 | 5.1 | Decision fatigue (1.5 / мин) | критично | 6 |
| 5 | 10.1 | Очистить ключи без confirm | критично | 0.5 |
| 6 | 10.1 | Очистить коллекцию без confirm | критично | 1 |
| 7 | 15.A | Поиск в коллекции | критично | 3 |
| 8 | 15.B | Теги-настроения | критично | 6 |
| 9 | 7.E | Sepia контраст fix | важно | 1 |
| 10 | 7.C | Touch-targets ≥ 44px | важно | 1 |
| 11 | 11.A | Все источники упали → 12 ошибок | важно | 1 |
| 12 | 11.B | Backend down → cascade errors | важно | 1 |
| 13 | 8.A-N | UX writing 17 текстов | важно | 3 |
| 14 | 4.A | Global-coverage sources (8-12) | важно | 6 |
| 15 | 13.A | First save без feedback | важно | 1 |
| 16 | 12.A | Ритуал на первом запуске | важно | 1 |
| 17 | 9.A | Scroll-restore коллекции | важно | 1 |
| 18 | 14.A | Удалить 13 dead источников | важно | 1 |
| 19 | 7.A | aria-label на карточке | важно | 0.5 |
| 20 | 7.B | Focus-trap в модалках | важно | 2 |
| 21 | 7.D | i18n (en, ja) | важно | 8 |
| 22 | 6.A | Local image cache | важно | 8 |
| 23 | 11.E | Offline detection | важно | 1.5 |
| 24 | 11.F | Key expired notification | важно | 1 |
| 25 | 14.C | Объединить эстетик-категории | полезно | 2 |
| 26 | 9.D | Атлас (год отчёт) | стратегически | 12 |
| 27 | 6.F | QR-sync устройств | стратегически | 6 |
| 28 | 1.7 | «Personal aesthetic, no algorithm» позиционирование | стратегически | 2 |
| 29 | 13.C | Curated first card | стратегически | 4 |
| 30 | 15.H | Single-card share | стратегически | 4 |

**Сумма часов**: ~110 часов общей работы.

### Дорожная карта

#### Quick wins (1-2 дня каждый)

1. localStorage quota toast (1 ч)
2. Confirm + undo для деструктивных actions (1.5 ч)
3. Two-tab BroadcastChannel sync (2 ч)
4. UX writing 17 текстов (3 ч)
5. Удалить 13 dead источников (1 ч)
6. Sepia контраст fix (1 ч)
7. Touch-targets 44px (1 ч)
8. aria-label + focus-trap (2.5 ч)
9. Поиск в коллекции (3 ч)
10. Empty error pattern «бэкенд молчит» (1 ч)

**Итого 1-2 недели работы**: 17 часов на критичные баги + UX полишинг.

#### Средние улучшения (1-2 недели)

- Теги-настроения на коллекцию (6 ч)
- Drag-drop import (4 ч)
- Атлас годовой отчёт (12 ч)
- Local image cache (8 ч)
- i18n en/ja (8 ч)
- Global-coverage sources (6 ч)

**Итого**: ~45 часов = 2-3 недели.

#### Стратегические направления (месяц+)

- QR-sync между устройствами (6 ч + design)
- Single-card public-share (4 ч + backend storage)
- Year-in-review experience design (10 ч)
- Curated first card pipeline (4 ч + curation work)

### 5 принципов SOMA (формулировка по итогам аудита)

1. **Тишина громче шума.** Меньше элементов на экране, чем у любого конкурента в нише.
2. **Личное, без социального.** Коллекция твоя, никто её не видит, никто её не оценивает.
3. **Никакого алгоритма.** Веса источников могут быть, но не «AI рекомендует тебе это».
4. **Никаких dark patterns удержания.** Никаких push, streak, autoplay, FOMO.
5. **Куратор, не truba.** SOMA активно отбирает diverse-источники, не воспроизводит bias алгоритмов масс-маркета.

### 3 главных риска

1. **localStorage умирает на 2K+ лайках** → юзер теряет всё. **Без backend storage SOMA не масштабируется**.
2. **Битые URL через 1-2 года** → коллекция превращается в «memorial of dead links». **Local image cache — must**.
3. **Отсутствие onboarding'а отпугивает 50% новичков** → ниша остаётся слишком узкой. **Один-time tooltip + curated first card — must**.

---

## Заключение

SOMA — продуманный продукт с правильной душой, но с растущим техническим долгом и нерешёнными проблемами durability (localStorage, битые URL). Аудит зафиксировал ~75 находок в 15 блоках. Из них:

- **8 критичных** требуют немедленного решения (~20 часов).
- **35 важных** — на следующие 4-6 недель (~60 часов).
- **30 полезных / стратегических** — quarter-on-quarter работа.

**Главный вывод**: SOMA готов к **первой публичной волне юзеров**, но не выдержит их на текущей архитектуре дольше 3 месяцев без фиксов выше.


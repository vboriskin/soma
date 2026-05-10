// Aggregated RSS / Reddit feed for SOMA's "лента" view.
// Each source is fetched in parallel, parsed via regex (no new deps), cached
// in memory, and merged into a single time-sorted stream. Posts without any
// usable image are dropped — RSS-only text feeds aren't shown.

import { fetchXml, parseRssItems, stripTags, firstImgSrc, BROWSER_UA, decodeFeedBody, fetchInsecure, fetchWithWaybackFallback } from './_util.js';
import { fetchMastodonFeed } from './_mastodon.js';
import { fetchBlueskyFeed } from './_bluesky.js';
import { fetchWpReaderFeed } from './_wp_reader.js';
import { fetchSitemapFeed } from './_sitemap.js';
import { fetchBlueskyFirehoseFeed, shutdownFirehose } from './_bluesky_firehose.js';

// ---------- feed catalogue ----------

const DESIGNER_SUBS = ['UI_Design', 'userexperience', 'web_design', 'webdev', 'design', 'graphic_design', 'typography', 'logodesign'];
const AESTHETIC_SUBS = ['CozyPlaces','AmateurRoomPorn','MostBeautiful','RoomPorn','MovieDetails','AccidentalRenaissance','EarthPorn','VillagePorn'];

// Helper — превращает массив сабов в массив feed-сорсов (по одному на саб).
// id = `r-{sub}`, label = `r/{sub}`. Так фильтр ленты показывает каждый
// саб отдельным чипом, и пресет может ссылаться на конкретный саб.
function expandSubs(subs, mode, idPrefix = 'r-') {
  return subs.map(sub => ({
    id: idPrefix + sub,
    label: 'r/' + sub,
    lang: 'en',
    modes: [mode],
    kind: 'reddit',
    subs: [sub],
  }));
}

// Each feed declares: lang ('en'|'ru'), modes (array — which app modes show
// it in the feed view), an optional kind (rss / rsshub / reddit), and an
// optional status:'unavailable' for sources we know are dead.
export const FEEDS = [
  // ============== EN · designer ==============
  { id: 'awwwards',      label: 'Awwwards',          lang: 'en', modes: ['designer'], url: 'https://www.awwwards.com/feed' },
  { id: 'fwa',           label: 'FWA',               lang: 'en', modes: ['designer'], url: 'https://thefwa.com/rss' },
  { id: 'cssda',         label: 'CSS Design Awards', lang: 'en', modes: ['designer'], tlsRelax: true, url: 'https://www.cssdesignawards.com/feed/' },
  { id: 'onepagelove',   label: 'One Page Love',     lang: 'en', modes: ['designer'], url: 'https://onepagelove.com/feed' },
  // httpster удалён 2026-05-10 — стабильный 404, fontsinuse тоже удалён.
  { id: 'siteinspire',   label: 'SiteInspire',       lang: 'en', modes: ['designer'], url: 'https://www.siteinspire.com/showcase.rss' },

  { id: 'brandnew',      label: 'Brand New',         lang: 'en', modes: ['designer'], textOnly: true, url: 'https://www.underconsideration.com/brandnew/atom.xml' },
  // It's Nice That перенесли RSS на FeedBurner — старый /rss/feed.xml = 404.
  { id: 'itsnicethat',   label: "It's Nice That",    lang: 'en', modes: ['designer','aesthetic'], url: 'https://feeds.feedburner.com/itsnicethat' },
  { id: 'creativereview',label: 'Creative Review',   lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.creativereview.co.uk/feed/' },
  { id: 'designmilk',    label: 'Design Milk',       lang: 'en', modes: ['designer','aesthetic'], url: 'https://design-milk.com/feed/' },
  { id: 'sidebar',       label: 'Sidebar.io',        lang: 'en', modes: ['designer'], url: 'https://sidebar.io/feed.xml' },

  { id: 'smashing',      label: 'Smashing Mag',      lang: 'en', modes: ['designer'], url: 'https://www.smashingmagazine.com/feed/' },
  { id: 'codrops',       label: 'Codrops',           lang: 'en', modes: ['designer'], url: 'https://tympanus.net/codrops/feed/' },
  { id: 'alistapart',    label: 'A List Apart',      lang: 'en', modes: ['designer'], textOnly: true, url: 'https://alistapart.com/main/feed/' },

  // EN · architecture/interior — релевантно и дизайнеру, и эстетике
  { id: 'archdaily',     label: 'ArchDaily',         lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.archdaily.com/feed' },
  { id: 'dezeen',        label: 'Dezeen',            lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.dezeen.com/feed/' },
  { id: 'archdigest',    label: 'Archi Digest',      lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.architecturaldigest.com/feed/rss' },

  // EN · art & culture — обоим
  { id: 'hyperallergic', label: 'Hyperallergic',     lang: 'en', modes: ['designer','aesthetic'], url: 'https://hyperallergic.com/feed/' },
  { id: 'colossal',      label: 'Colossal',          lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.thisiscolossal.com/feed/' },
  { id: 'aeon',          label: 'Aeon',              lang: 'en', modes: ['designer','aesthetic'], url: 'https://aeon.co/feed.rss' },

  // EN · tech / product — только дизайнеру
  { id: 'hackernews',    label: 'Hacker News',       lang: 'en', modes: ['designer'], url: 'https://news.ycombinator.com/rss' },
  { id: 'producthunt',   label: 'Product Hunt',      lang: 'en', modes: ['designer'], textOnly: true, url: 'https://www.producthunt.com/feed' },

  // Reddit per-sub: разворачиваем массив сабов в N feed-источников, каждый
  // со своим чипом в фильтре ленты. Старые id `reddit` / `reddit-aesthetic`
  // больше не существуют — их места заняли r-UI_Design, r-CozyPlaces и т.д.
  // Старые ID разворачиваются в migration-aliases в getFeedItems (см. ниже).
  ...expandSubs(DESIGNER_SUBS,   'designer'),
  ...expandSubs(AESTHETIC_SUBS,  'aesthetic'),

  // ============== EN · aesthetic ==============
  { id: 'apartamento',   label: 'Apartamento',           lang: 'en', modes: ['aesthetic'], url: 'https://www.apartamentomagazine.com/feed/' },
  { id: 'pinup',         label: 'Pin-Up Magazine',       lang: 'en', modes: ['aesthetic'], url: 'https://archive.pinupmagazine.org/feed/' },
  { id: 'sightunseen',   label: 'Sight Unseen',          lang: 'en', modes: ['aesthetic'], url: 'https://www.sightunseen.com/feed/' },
  { id: 'wallpaper',     label: 'Wallpaper*',            lang: 'en', modes: ['aesthetic'], url: 'https://www.wallpaper.com/rss' },
  { id: 'fvf',           label: 'Freunde von Freunden',  lang: 'en', modes: ['aesthetic'], url: 'https://www.freundevonfreunden.com/feed/' },
  { id: 'monocle',       label: 'Monocle',               lang: 'en', modes: ['aesthetic'], url: 'https://monocle.com/rss' },
  { id: 'parisreview',   label: 'The Paris Review',      lang: 'en', modes: ['aesthetic'], textOnly: true, url: 'https://www.theparisreview.org/blog/feed/' },
  // Не отдают валидный RSS — пометить как недоступные
  // Cereal/Gentlewoman без публичных HTML-страниц с картинками — оставляем unavailable.
  // Cereal / Gentlewoman: RSS не отдают. Sitemap-механизм рабочий
  // (см. _sitemap.js), но конкретно у этих сайтов sitemap отдаёт сервисные
  // страницы (/confirmation, /docs, /), а не статьи — невозможно найти контент
  // через og:image. Оставлено unavailable; механизм пригодится для других
  // источников где sitemap содержит /articles/* или /journal/*.
  { id: 'cereal',        label: 'Cereal',                lang: 'en', modes: ['aesthetic'], kind: 'sitemap', url: 'https://readcereal.com/sitemap.xml', slow: true, status: 'unavailable' },
  { id: 'gentlewoman',   label: 'The Gentlewoman',       lang: 'en', modes: ['aesthetic'], kind: 'sitemap', url: 'https://thegentlewoman.co.uk/sitemap.xml', slow: true, status: 'unavailable' },
  // Kinfolk/Cabana — без RSS, но HTML-страница с превью статей; делаем scrape.
  { id: 'kinfolk',       label: 'Kinfolk',               lang: 'en', modes: ['aesthetic'], kind: 'scrape', url: 'https://kinfolk.com/',                          pageUrl: 'https://kinfolk.com/' },
  { id: 'cabana',        label: 'Cabana',                lang: 'en', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.cabanamagazine.com/blogs/news',     pageUrl: 'https://www.cabanamagazine.com/blogs/news' },

  // ============== EN · aesthetic · slow magazines (доп. волна) ==============
  { id: 'magnum',          label: 'Magnum Photos',        lang: 'en', modes: ['aesthetic'],            textOnly: true, url: 'https://www.magnumphotos.com/feed/' },
  { id: 'remodelista',     label: 'Remodelista',          lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://www.remodelista.com/feed/' },
  { id: 'gardenista',      label: 'Gardenista',           lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://www.gardenista.com/feed/' },
  { id: 'readingtealeaves',label: 'Reading My Tea Leaves',lang: 'en', modes: ['aesthetic'],            textOnly: true, url: 'https://www.readingmytealeaves.com/feed' },
  { id: 'holeandcorner',   label: 'Hole & Corner',        lang: 'en', modes: ['aesthetic','designer'], slow: true, url: 'https://www.holeandcorner.com/feed' },
  { id: 'aperture',        label: 'Aperture',             lang: 'en', modes: ['aesthetic'],            textOnly: true, url: 'https://aperture.org/feed/' },
  { id: 'theselby',        label: 'The Selby',            lang: 'en', modes: ['aesthetic'],            url: 'https://theselby.com/feed/' },
  { id: 'lodestars',       label: 'Lodestars Anthology',  lang: 'en', modes: ['aesthetic'],            url: 'https://www.lodestarsanthology.co.uk/blog?format=RSS' },

  // ============== JA · aesthetic · японские журналы ==============
  // lang='ja' — пока не отображаются в фильтре ru/en, видны только при «все»
  { id: 'casabrutus',      label: 'Casa Brutus',          lang: 'ja', modes: ['aesthetic'], url: 'https://casabrutus.com/feed/' },
  { id: 'andpremium',      label: '& Premium',            lang: 'ja', modes: ['aesthetic'], url: 'https://andpremium.jp/feed/' },

  // ============== RU · designer ==============
  // Хабр — рабочие хабы (ui_ux/interface_design не существуют, заменены на usability/ui)
  { id: 'habr-design',     label: 'Хабр · Дизайн',       lang: 'ru', modes: ['designer'], url: 'https://habr.com/ru/rss/hub/design/all/' },
  { id: 'habr-webdesign',  label: 'Хабр · Веб-дизайн',   lang: 'ru', modes: ['designer'], url: 'https://habr.com/ru/rss/hub/web_design/all/' },
  { id: 'habr-usability',  label: 'Хабр · Юзабилити',    lang: 'ru', modes: ['designer'], url: 'https://habr.com/ru/rss/hub/usability/all/' },
  { id: 'habr-ui',         label: 'Хабр · Интерфейсы',   lang: 'ru', modes: ['designer'], url: 'https://habr.com/ru/rss/hub/ui/all/' },
  { id: 'habr-typography', label: 'Хабр · Типографика',  lang: 'ru', modes: ['designer','aesthetic'], url: 'https://habr.com/ru/rss/hub/typography/all/' },

  { id: 'vcru',          label: 'VC.ru',                  lang: 'ru', modes: ['designer'], url: 'https://vc.ru/rss' },
  { id: 'tan-ru',        label: 'Art Newspaper Russia',   lang: 'ru', modes: ['designer','aesthetic'], url: 'https://www.theartnewspaper.ru/rss/' },
  // Бюро — text-only источник: новости без картинок. Покажется минималистичной
  // текстовой карточкой во фронте, без thumb.
  { id: 'bureau',        label: 'Бюро Горбунова',         lang: 'ru', modes: ['designer'], textOnly: true, url: 'https://bureau.ru/news/rss/' },
  { id: 'snob',          label: 'Сноб',                   lang: 'ru', modes: ['designer','aesthetic'], tlsRelax: true, url: 'https://snob.ru/rss' },
  { id: 'archi',         label: 'Архи.ру',                lang: 'ru', modes: ['designer','aesthetic'], url: 'https://archi.ru/rss.xml' },
  { id: 'afisha',        label: 'Афиша Daily',            lang: 'ru', modes: ['designer','aesthetic'], url: 'https://daily.afisha.ru/rss' },
  { id: 'hightech',      label: 'Хайтек',                 lang: 'ru', modes: ['designer'], url: 'https://hightech.fm/feed' },
  // Т—Ж теперь требует auth на articles (`t-j.ru/*` → 401), og:image fallback
  // не достаёт картинки. Текстовый режим — хотя бы заголовки попадут в ленту.
  { id: 'tinkoff',       label: 'Tinkoff Журнал',         lang: 'ru', modes: ['designer'], textOnly: true, url: 'https://journal.tinkoff.ru/feed' },
  { id: 'knife',         label: 'Нож',                    lang: 'ru', modes: ['designer','aesthetic'], url: 'https://knife.media/rss' },

  // ============== RU · aesthetic ==============
  { id: 'blueprint',     label: 'The Blueprint',          lang: 'ru', modes: ['aesthetic'], textOnly: true, url: 'https://theblueprint.ru/rss' },
  { id: 'seasons',       label: 'Seasons of life',        lang: 'ru', modes: ['aesthetic'], slow: true, url: 'https://seasons-project.ru/feed/' },
  { id: 'moskvichmag',   label: 'Москвич Mag',            lang: 'ru', modes: ['aesthetic'], textOnly: true, url: 'https://moskvichmag.ru/feed/' },
  // Wonderzine/Buro — без RSS, но HTML главной с превью.
  { id: 'wonderzine',    label: 'Wonderzine',             lang: 'ru', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.wonderzine.com/', pageUrl: 'https://www.wonderzine.com/' },
  { id: 'buro',          label: 'Buro 24/7',              lang: 'ru', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.buro247.ru/',     pageUrl: 'https://www.buro247.ru/' },
  // kakest удалён 2026-05-10 — пустой URL, никогда не работал.

  // RSSHub-bridge — Telegram-каналы. Публичная инстанция rsshub.app возвращает
  // 403, поэтому по умолчанию `unavailable`. Если в env задан RSSHUB_BASE
  // (свой instance), функция rsshubUrl() ниже подставит его и помечает источники
  // как доступные. См. backend/README.md → «свой RSSHub».
  // Конвертированы с `kind: 'rsshub'` на `kind: 'tg-web'` — прямой scrape
  // t.me/s/{channel} надёжнее, чем зависимость от внешнего rsshub.app/инстанса.
  { id: 'tg-awdee',       label: 'Awdee · TG',         lang: 'ru', modes: ['designer','aesthetic'], kind: 'tg-web', tgChannel: 'awdee',        url: 'https://t.me/s/awdee' },
  { id: 'tg-designdrafts',label: 'Дизайн-кабак · TG',  lang: 'ru', modes: ['designer'],             kind: 'tg-web', tgChannel: 'designdrafts', url: 'https://t.me/s/designdrafts' },
  { id: 'tg-uxnotes',     label: 'UX Notes · TG',      lang: 'ru', modes: ['designer'],             kind: 'tg-web', tgChannel: 'uxnotes',      url: 'https://t.me/s/uxnotes' },

  // Известно дохлое: Skillbox без публичного RSS
  { id: 'skillbox',      label: 'Skillbox Media',         lang: 'ru', modes: ['designer'], url: 'https://skillbox.ru/media/', status: 'unavailable' },

  // ============== Seasons-аналоги · EN aesthetic (RSS) ==============
  // Все URL прозвонены 2026-05-09 — отдают валидный RSS с 10+ записями.
  { id: 'magazine91',    label: '91 Magazine',            lang: 'en', modes: ['aesthetic'], url: 'https://91magazine.co.uk/feed/' },
  { id: 'modernfarmer',  label: 'Modern Farmer',          lang: 'en', modes: ['aesthetic'], url: 'https://modernfarmer.com/feed/' },
  { id: 'suitcase',      label: 'Suitcase Magazine',      lang: 'en', modes: ['aesthetic'], url: 'https://suitcasemag.com/feed' },
  { id: 'countryliving', label: 'Country Living UK',      lang: 'en', modes: ['aesthetic'], url: 'https://www.countryliving.com/uk/rss/all/' },
  { id: 'flow',          label: 'Flow Magazine',          lang: 'en', modes: ['aesthetic'], url: 'https://www.flowmagazine.com/feed/' },
  // Squarespace site — RSS живёт по нестандартному пути ?format=RSS на /blog
  { id: 'simplethings',  label: 'The Simple Things',      lang: 'en', modes: ['aesthetic'], url: 'https://www.thesimplethings.com/blog?format=RSS' },

  // ============== Seasons-аналоги · NO aesthetic ==============
  // Норвежские издания пока почти все без публичного RSS (DNF/404/403).
  // Norwegian Arts (UK org) — единственный живой; остальные помечены unavailable.
  { id: 'norwegianarts', label: 'Norwegian Arts',         lang: 'no', modes: ['aesthetic'], url: 'https://norwegianarts.org.uk/feed/' },

  // ============== Seasons-аналоги · TG (через t.me/s/, kind: tg-web) ==============
  // Каналы прозвонены 2026-05-09 — публичные, t.me/s/ отдаёт widget messages.
  // tg-web-парсер берёт превью-картинки из <a class="tgme_widget_message_photo_wrap">.
  { id: 'tg-modern-art',     label: 'Modern Art & Aesthetic · TG', lang: 'ru', modes: ['aesthetic'], kind: 'tg-web', tgChannel: 'modern_art_only',     url: 'https://t.me/s/modern_art_only' },
  { id: 'tg-russian-art',    label: 'Русское искусство · TG',      lang: 'ru', modes: ['aesthetic'], kind: 'tg-web', tgChannel: 'big_russian_art',     url: 'https://t.me/s/big_russian_art' },
  { id: 'tg-art-xx',         label: 'Art & Aesthetic XX · TG',     lang: 'ru', modes: ['aesthetic'], kind: 'tg-web', tgChannel: 'art_and_aestheticXX', url: 'https://t.me/s/art_and_aestheticXX' },
  { id: 'tg-softculture',    label: 'Soft Culture · TG',           lang: 'ru', modes: ['designer','aesthetic'], kind: 'tg-web', tgChannel: 'softculture',         url: 'https://t.me/s/softculture' },
  { id: 'tg-hermitage',      label: 'Эрмитаж · TG',                lang: 'ru', modes: ['aesthetic'], kind: 'tg-web', tgChannel: 'Hermitage_Hermitage', url: 'https://t.me/s/Hermitage_Hermitage' },
  // Speculative — единственный из priority-3, который реально оказался публичным.
  { id: 'tg-medlennoe',      label: 'Медленное · TG',              lang: 'ru', modes: ['aesthetic'], kind: 'tg-web', tgChannel: 'medlennoe',           url: 'https://t.me/s/medlennoe' },

  // ============== Seasons-аналоги · unavailable ==============
  // Хосты не резолвятся / 404 / 403. Оставляем в каталоге — юзер видит «недоступно»
  // в фильтре источников, чтобы не было ощущения «вы что-то забыли». Если у источника
  // появится живой RSS — снимаем флаг.
  // bloom, wildflower, heiter удалены 2026-05-10 — DNS-fail.
  { id: 'lagom',          label: 'Lagom Magazine',         lang: 'en', modes: ['aesthetic'], kind: 'scrape', url: 'https://lagommagazine.com/',  pageUrl: 'https://lagommagazine.com/' },
  // hygge, seedmag, anotherescape удалены 2026-05-10 — DNS-fail / 404.
  // NO — 4 живых сайта без публичного RSS, переключены на scrape (HTML-главные с превью).
  { id: 'hytteliv',       label: 'Hytteliv',               lang: 'no', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.hytteliv.no/',     pageUrl: 'https://www.hytteliv.no/' },
  { id: 'bobedre-no',     label: 'Bo Bedre Norge',         lang: 'no', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.bobedre.no/',      pageUrl: 'https://www.bobedre.no/' },
  { id: 'kk-bolig',       label: 'KK Bolig',               lang: 'no', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.kk.no/bolig/',     pageUrl: 'https://www.kk.no/bolig/' },
  { id: 'visitnorway',    label: 'Visit Norway',           lang: 'no', modes: ['aesthetic'], kind: 'scrape', url: 'https://www.visitnorway.com/', pageUrl: 'https://www.visitnorway.com/' },
  // RU — DNS не резолвится / нет рабочего домена
  // apartamentmag, tim-magazine, marievorobyov удалены 2026-05-10 — DNS-fail.
  // 11 aesthetic-TG каналов удалены 2026-05-10 — все возвращали t.me/s/
  // заглушку (приватные/закрытые posts). Если автор когда-то откроет — добавим
  // обратно. Удалённые: tg-poludkina, tg-bangbang, tg-artworld, tg-gaeva,
  // tg-ardinterior, tg-miritskevich, tg-dachadream, tg-slowfood-ru,
  // tg-cupmorning, tg-radostbyta, tg-chitayaupal.

  // ============== Designer-pack · EN дизайн-журналы / типографика ==============
  // URL прозвонены 2026-05-09. typewolf отдаёт RSS только на `/feed` (без подпути).
  { id: 'typewolf',      label: 'Type Wolf',              lang: 'en', modes: ['designer'], url: 'https://www.typewolf.com/feed' },
  { id: 'logodesignlv',  label: 'Logo Design Love',       lang: 'en', modes: ['designer'], url: 'https://logodesignlove.com/feed/' },
  { id: 'bpando',        label: 'BP&O',                   lang: 'en', modes: ['designer'], url: 'https://bpando.org/feed/' },
  // AIGA / eyeondesign — те же проблемы с TLS chain. tlsRelax → live.
  { id: 'eyeondesign',   label: 'Eye on Design (AIGA)',   lang: 'en', modes: ['designer'], textOnly: true, tlsRelax: true, url: 'https://eyeondesign.aiga.org/feed/' },
  { id: 'designboom',    label: 'designboom',             lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.designboom.com/feed/' },
  { id: 'pixelperfect',  label: 'Pixel Perfect Magazine', lang: 'en', modes: ['designer'], slow: true, url: 'https://pixelperfectmag.com/feed/' },

  // ============== Designer-pack · UX / web-craft ==============
  { id: 'uxcollective',  label: 'UX Collective',          lang: 'en', modes: ['designer'], url: 'https://uxdesign.cc/feed' },
  { id: 'uxmovement',    label: 'UX Movement',            lang: 'en', modes: ['designer'], url: 'https://uxmovement.com/feed/' },
  { id: 'nngroup',       label: 'Nielsen Norman Group',   lang: 'en', modes: ['designer'], url: 'https://www.nngroup.com/feed/rss/' },
  { id: 'saaslandingpage', label: 'SaaS Landing Page',    lang: 'en', modes: ['designer'], url: 'https://saaslandingpage.com/feed/' },

  // ============== Designer-pack · Tech / business ==============
  { id: 'theverge',      label: 'The Verge',              lang: 'en', modes: ['designer'], url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'fastcompany',   label: 'Fast Company',           lang: 'en', modes: ['designer'], url: 'https://www.fastcompany.com/rss' },

  // ============== Designer-pack · Scandinavian ==============
  // DOGA (norvegian design portal) не отдаёт публичный RSS — помечен ниже.
  { id: 'scandistandard',label: 'Scandinavia Standard',   lang: 'en', modes: ['designer','aesthetic'], url: 'https://www.scandinaviastandard.com/feed/' },
  { id: 'coolhunting',   label: 'Cool Hunting',           lang: 'en', modes: ['designer','aesthetic'], url: 'https://coolhunting.com/feed/' },

  // ============== Designer-pack · RU ==============
  // bureau.ru/news/rss/ уже подключено как `bureau` (новости бюро).
  // Раздел «Советы» — отдельный поток, более методологический.
  { id: 'bureau-soviet', label: 'Бюро · Советы',          lang: 'ru', modes: ['designer'], url: 'https://bureau.ru/bb/soviet/rss/' },

  // ============== Designer-pack · Telegram (kind: tg-web) ==============
  // Прозвонены 2026-05-09 — публичные с widget-сообщениями.
  { id: 'tg-designmate',         label: 'Design Mate · TG',          lang: 'ru', modes: ['designer'], kind: 'tg-web', tgChannel: 'designmate',         url: 'https://t.me/s/designmate' },
  { id: 'tg-productdesignschool',label: 'Product Design School · TG',lang: 'ru', modes: ['designer'], kind: 'tg-web', tgChannel: 'productdesignschool',url: 'https://t.me/s/productdesignschool', status: 'unavailable' },

  // ============== Designer-pack · unavailable ==============
  // Помечены чтобы юзер видел в фильтре «недоступно» (italic), кликабельно с пустым результатом.
  // EN — DNS fail / 404 / без публичного RSS
  // archiveFallback: true — пытаемся через Wayback Machine, если основной мёртв
  // fontsinuse удалён 2026-05-10 — стабильный 404, archiveFallback не помог.
  // url is homepage, not RSS — Wayback fallback не помогает, оставлено как маркер.
  { id: 'designspiration',label: 'Designspiration',       lang: 'en', modes: ['designer'], url: 'https://www.designspiration.com/',     status: 'unavailable' },
  { id: 'thebrandidentity',label: 'The Brand Identity',   lang: 'en', modes: ['designer'], url: 'https://thebrandidentity.com/',        status: 'unavailable' },
  // designernews удалён 2026-05-10 — DNS/TCP-fail на designernews.co.
  // Scandi
  { id: 'doga',           label: 'DOGA (Design og arkitektur Norge)', lang: 'no', modes: ['designer'], kind: 'scrape', url: 'https://doga.no/', pageUrl: 'https://doga.no/' },
  // RU
  { id: 'tj-design',      label: 'T—Ж · Дизайн',          lang: 'ru', modes: ['designer'], url: 'https://journal.tinkoff.ru/design/',   status: 'unavailable' },
  { id: 'setters-media',  label: 'Setters Media',         lang: 'ru', modes: ['designer'], kind: 'sitemap', url: 'https://setters.media/sitemap.xml', slow: true, pathFilter: '/post' },
  // 11 designer-TG каналов удалены 2026-05-10 — все возвращали t.me/s/
  // заглушку. Удалённые: tg-typojournal, tg-mainbranding, tg-creativitysnobs,
  // tg-designdialogue, tg-designfest, tg-gv-designcrits, tg-ru-typography,
  // tg-bureauchat, tg-uxdesigners, tg-typoinspirations, tg-brandidcollection.

  // ============== Global-coverage pack 2026-05-10 ==============
  // Расширение каталога для under-represented регионов. Цель: разбавить
  // евро-западный bias дефолтных источников. См. soma-audit-3a-2026-05-10.md
  // блок 4.4 — этический аудит.
  // Africa
  { id: 'okayafrica',     label: 'OkayAfrica',                   lang: 'en', modes: ['aesthetic','designer'], slow: true, url: 'https://www.okayafrica.com/rss/' },
  { id: 'contemporaryand',label: 'Contemporary And (C&)',        lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://contemporaryand.com/feed/' },
  { id: 'nataal',         label: 'Nataal',                       lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://nataal.com/feed/' },
  // Latin America
  { id: 'casavogue-br',   label: 'Casa Vogue Brasil',            lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://casavogue.globo.com/rss/casavogue/feed.xml' },
  { id: 'gallerist',      label: 'Gallerist (LATAM art)',        lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://www.galleristmag.com/feed/' },
  // East Asia (не Japan, который уже есть через casabrutus/andpremium)
  { id: 'studiovoice',    label: 'Studio Voice (JP)',            lang: 'ja', modes: ['aesthetic'],            slow: true, url: 'https://studiovoice.jp/feed/' },
  // Eastern Europe
  { id: 'projectbaltia',  label: 'Project Baltia',               lang: 'en', modes: ['aesthetic','designer'], slow: true, url: 'https://projectbaltia.com/feed/' },
  // Indigenous & Pacific
  { id: 'firstamericanart',label: 'First American Art Magazine', lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://firstamericanartmagazine.com/feed/' },
  // Middle East
  { id: 'brownbookmag',   label: 'Brownbook (MENA)',             lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://brownbook.tv/feed/' },
  // South Asia
  { id: 'designindia',    label: 'Design India',                 lang: 'en', modes: ['designer'],             slow: true, url: 'https://design-india.com/feed/' },

  // ============== Topic-gaps pack 2026-05-10 ==============
  // RU арт-фотография
  { id: 'birdinflight',  label: 'Bird in Flight (RU)', lang: 'ru', modes: ['aesthetic'], slow: true, url: 'https://birdinflight.com/ru/feed' },
  { id: 'rosphoto',      label: 'Russian Photo',       lang: 'ru', modes: ['aesthetic'], slow: true, url: 'https://rosphoto.com/feed/' },
  // Industrial design
  { id: 'dezeen-products', label: 'Dezeen · products',   lang: 'en', modes: ['designer'], url: 'https://www.dezeen.com/products/feed/' },
  // Восточно-европейская архитектура
  { id: 'strelkamag',    label: 'Strelka Mag',         lang: 'ru', modes: ['designer','aesthetic'], slow: true, url: 'https://strelkamag.com/ru/rss' },
  // Slow-living EN
  { id: 'modernhouse',   label: 'The Modern House',    lang: 'en', modes: ['aesthetic'], slow: true, url: 'https://www.themodernhouse.com/journal/feed/' },
  { id: 'puremagazine',  label: 'The Pure Magazine UK', lang: 'en', modes: ['aesthetic'], slow: true, url: 'https://thepuremagazine.com/feed/' },
  // Шрифты
  { id: 'ilovetype',     label: 'I Love Typography',   lang: 'en', modes: ['designer'], slow: true, url: 'https://ilovetypography.com/feed/' },
  // Замена scandi
  { id: 'dwell',         label: 'Dwell',               lang: 'en', modes: ['aesthetic'], slow: true, url: 'https://www.dwell.com/rss/' },
  { id: 'elledecor',     label: 'Elle Decor',          lang: 'en', modes: ['aesthetic'], slow: true, url: 'https://www.elledecor.com/rss/all.xml/' },

  // ============== Audit-pack 2026-05-09 — новые RSS ==============
  // EN — fashion / arts / industrial / engineering blogs (12 шт.)
  { id: 'ignant',         label: 'Ignant',                       lang: 'en', modes: ['aesthetic','designer'], url: 'https://www.ignant.com/feed/' },
  { id: 'dazed',          label: 'Dazed',                        lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://www.dazeddigital.com/rss' },
  { id: 'core77',         label: 'Core77',                       lang: 'en', modes: ['designer'],             url: 'https://www.core77.com/feed' },
  { id: 'yankodesign',    label: 'Yanko Design',                 lang: 'en', modes: ['designer'],             url: 'https://www.yankodesign.com/feed/' },
  { id: 'bjp',            label: 'British Journal of Photography', lang: 'en', modes: ['aesthetic'],          slow: true, url: 'https://www.1854.photography/feed/' },
  { id: 'mousse',         label: 'Mousse Magazine',              lang: 'en', modes: ['aesthetic'],            slow: true, textOnly: true, url: 'https://www.moussemagazine.it/feed/' },
  { id: 'behance',        label: 'Behance',                      lang: 'en', modes: ['designer','aesthetic'], slow: true, url: 'https://www.behance.net/feeds/projects' },
  { id: 'thekitchn',      label: 'The Kitchn',                   lang: 'en', modes: ['aesthetic'],            slow: true, url: 'https://www.thekitchn.com/main.rss' },
  // robinrendle удалён 2026-05-10 — payload-аномалия (2.6 MB ради 2 items).
  // vercel-blog удалён 2026-05-10 — payload-аномалия (2.2 MB ради 30 items).
  // Замена есть в каталоге: stripe-blog, daringfireball.
  { id: 'stripe-blog',    label: 'Stripe Blog',                  lang: 'en', modes: ['designer'],             url: 'https://stripe.com/blog/feed.rss' },
  { id: 'daringfireball', label: 'Daring Fireball',              lang: 'en', modes: ['designer'],             slow: true, url: 'https://daringfireball.net/feeds/main' },

  // ============== Audit-pack · Mastodon (kind: 'mastodon') ==============
  // Public timelines / hashtag streams без auth. Каждый — JSON-эндпоинт
  // /api/v1/timelines/{public|tag/{name}}. Адаптер в _mastodon.js.
  { id: 'mas-design',         label: 'Mastodon · #design',         lang: 'en', modes: ['designer'], kind: 'mastodon', instance: 'mastodon.social', tag: 'design' },
  { id: 'mas-uidesign',       label: 'Mastodon · #uidesign',       lang: 'en', modes: ['designer'], kind: 'mastodon', instance: 'mastodon.social', tag: 'uidesign' },
  { id: 'mas-typography',     label: 'Mastodon · #typography',     lang: 'en', modes: ['designer'], kind: 'mastodon', instance: 'typo.social',     tag: 'typography' },
  { id: 'mas-architecture',   label: 'Mastodon · #architecture',   lang: 'en', modes: ['aesthetic','designer'], kind: 'mastodon', instance: 'mastodon.social', tag: 'architecture' },
  { id: 'mas-photography',    label: 'Mastodon · #photography',    lang: 'en', modes: ['aesthetic'], kind: 'mastodon', instance: 'mastodon.social', tag: 'photography' },

  // ============== Audit-pack · Pixelfed (kind: 'mastodon', тот же ActivityPub) ==============
  // Pixelfed public timelines требуют auth с 2024 — без токена API возвращает
  // пустой массив. Оставлено как маркер, оживёт при добавлении OAuth-flow.
  { id: 'pixelfed-public',    label: 'Pixelfed · public',          lang: 'en', modes: ['aesthetic'], kind: 'mastodon', instance: 'pixelfed.social', publicTimeline: true, status: 'unavailable' },
  { id: 'pixelfed-aesthetic', label: 'Pixelfed · #aesthetic',      lang: 'en', modes: ['aesthetic'], kind: 'mastodon', instance: 'pixelfed.social', tag: 'aesthetic',     status: 'unavailable' },

  // ============== Audit-pack · Bluesky (kind: 'bluesky') ==============
  // public.api.bsky.app/xrpc/app.bsky.feed.searchPosts — JSON, embed.images
  // Bluesky public API возвращает 403 на текущий момент (Cloudflare-фильтр
  // по IP-range). Помечены unavailable; код в _bluesky.js рабочий, оживёт
  // когда CF разрешит наш IP или появится auth-flow.
  { id: 'bsky-design',        label: 'Bluesky · ui design',        lang: 'en', modes: ['designer'], kind: 'bluesky-firehose', keywords: ['ui design','dashboard','app interface','dribbble'] },
  { id: 'bsky-typography',    label: 'Bluesky · typography',       lang: 'en', modes: ['designer'], kind: 'bluesky-firehose', keywords: ['typography','typeface','lettering','font'] },
  { id: 'bsky-photography',   label: 'Bluesky · slow photography', lang: 'en', modes: ['aesthetic'], kind: 'bluesky-firehose', keywords: ['slow photography','film photography','35mm','analog'] },

  // ============== Audit-pack · WordPress.com Reader (kind: 'wp-reader') ==============
  { id: 'wp-reader-design',   label: 'WordPress · #design',        lang: 'en', modes: ['designer'], kind: 'wp-reader', tag: 'design' },
  { id: 'wp-reader-interior', label: 'WordPress · #interiors',     lang: 'en', modes: ['aesthetic'], kind: 'wp-reader', tag: 'interiors' },
  { id: 'wp-reader-typo',     label: 'WordPress · #typography',    lang: 'en', modes: ['designer'],  kind: 'wp-reader', tag: 'typography' },

  // ============== Bluesky firehose (kind: 'bluesky-firehose') ==============
  // Долгоживущая websocket-подписка на jetstream2.us-east.bsky.network.
  // Пишет в общий ring-buffer (~500 последних постов с image), фильтруем
  // на чтение по keywords. Реконнект автоматически.
  { id: 'bsky-fh-design',     label: 'Bluesky firehose · design',     lang: 'en', modes: ['designer'], kind: 'bluesky-firehose', keywords: ['design','typography','ui','ux','branding'] },
  { id: 'bsky-fh-photography',label: 'Bluesky firehose · photography',lang: 'en', modes: ['aesthetic'], kind: 'bluesky-firehose', keywords: ['photography','photo','film','analog'] },
  { id: 'bsky-fh-architecture',label:'Bluesky firehose · architecture',lang: 'en', modes: ['aesthetic','designer'], kind: 'bluesky-firehose', keywords: ['architecture','interior','building','space'] },
];

// ---------- caches ----------

const RSS_TTL = 60 * 60 * 1000;        // 1 hour
const OG_TTL  = 24 * 60 * 60 * 1000;   // 24 hours
const FETCH_TIMEOUT_MS = 7000;
const RSSHUB_TIMEOUT_MS = 10000;       // rsshub.app is slow
const SLOW_TIMEOUT_MS   = 15000;       // фиды с большим payload (>500 KB)
const OG_TIMEOUT_MS = 5000;
const REDDIT_PER_SUB = 12;
const RSS_LIMIT = 30;
const TOTAL_LIMIT = 200;

const rssCache = new Map();   // feedId → { items, at }
const ogCache  = new Map();   // pageUrl → { url, at }
const failed   = new Map();   // feedId → { error, at }

export function getFeedSources(mode) {
  const list = mode ? FEEDS.filter(f => !f.modes || f.modes.includes(mode)) : FEEDS;
  return list.map(raw => {
    const f = resolveRsshubFeed(raw);
    const fail = failed.get(f.id);
    const dead = f.status === 'unavailable';
    return {
      id: f.id,
      label: f.label,
      lang: f.lang || 'en',
      kind: f.kind || 'rss',
      modes: f.modes || [],
      available: !dead && (!fail || (Date.now() - fail.at > RSS_TTL)),
      lastError: dead ? 'недоступно' : (fail?.error || null),
    };
  });
}

// ---------- helpers ----------

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

async function fetchPageHtml(url) {
  return abortable(signal => fetch(url, {
    signal,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  }), OG_TIMEOUT_MS).then(r => r.ok ? r.text() : '');
}

const META_OG = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i;
const META_OG_REV = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i;
const META_TW = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i;

async function fetchOgImage(pageUrl) {
  const cached = ogCache.get(pageUrl);
  if (cached && Date.now() - cached.at < OG_TTL) return cached.url;
  let url = null;
  try {
    const html = await fetchPageHtml(pageUrl);
    const m = html.match(META_OG) || html.match(META_OG_REV) || html.match(META_TW);
    url = m ? m[1].trim() : null;
    // Resolve protocol-relative
    if (url && /^\/\//.test(url)) url = 'https:' + url;
  } catch (e) {
    url = null;
  }
  ogCache.set(pageUrl, { url, at: Date.now() });
  return url;
}

// Tag each post with the source's lang so the frontend can filter without
// a separate metadata lookup.
function rssItemToPost(it, feed) {
  const id = String(it.guid || it.link || it.title || Math.random())
    .replace(/[^a-z0-9]/gi, '').slice(-40) || Math.random().toString(36).slice(2);
  let publishedAt = null;
  if (it.pubDate) {
    const t = Date.parse(it.pubDate);
    if (!Number.isNaN(t)) publishedAt = new Date(t).toISOString();
  }
  const thumb = it.image || firstImgSrc(it.description) || null;
  return {
    id: feed.id + '-' + id,
    source: feed.id,
    sourceLabel: feed.label,
    lang: feed.lang || 'en',
    textOnly: !!feed.textOnly,
    title: stripTags(it.title || '').slice(0, 200),
    description: stripTags(it.description || '').slice(0, 220),
    url: (it.link || '').trim(),
    thumb,
    publishedAt,
    author: '',
  };
}

// Best-effort HTML scraper — для журналов без RSS (Kinfolk, Cabana). Берём
// первые 30 значимых <img> с указанного URL и формируем post-объекты.
// Качество страдает (нет даты/автора), но «лучше чем недоступно» для feed-вью.
async function fetchScrapeFeed(feed, refresh) {
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  try {
    const r = await abortable(signal => fetch(feed.url, {
      signal,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    }).then(resp => resp.ok ? resp.text() : Promise.reject(new Error(`${resp.status}`))), FETCH_TIMEOUT_MS);

    const seen = new Set();
    const items = [];
    const re = /<img\b([^>]*?)>/gi;
    let m, idx = 0;
    while ((m = re.exec(r)) !== null) {
      const attrs = m[1];
      const srcM = attrs.match(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);
      if (!srcM) continue;
      let src = srcM[1];
      if (/^data:/.test(src)) continue;
      if (/^\/\//.test(src)) src = 'https:' + src;
      if (!/^https?:\/\//.test(src)) continue;
      if (/sprite|placeholder|blank|loader|spinner|favicon|logo|icon-/i.test(src)) continue;
      if (seen.has(src)) continue;
      seen.add(src);
      const altM = attrs.match(/\balt=["']([^"']+)["']/i);
      const title = altM ? altM[1] : '';
      items.push({
        id: feed.id + '-' + (idx++) + '-' + src.replace(/[^a-z0-9]/gi, '').slice(-24),
        source: feed.id,
        sourceLabel: feed.label,
        lang: feed.lang || 'en',
        title: stripTags(title).slice(0, 200),
        description: '',
        url: feed.pageUrl || feed.url,
        thumb: src,
        publishedAt: null,
        author: '',
      });
      if (items.length >= RSS_LIMIT) break;
    }
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    console.warn(`[feed:${feed.id}]`, e.message || e);
    failed.set(feed.id, { error: e.message || String(e), at: Date.now() });
    return cached ? cached.items : [];
  }
}

// Telegram channel resolver.
// Если в env есть RSSHUB_BASE — пытаемся через свой RSSHub (он отдаёт чистый
// RSS). Иначе — фоллбэк на прямой scrape публичной web-версии t.me/s/{channel}
// (новый kind 'tg-web').
function resolveRsshubFeed(feed) {
  if (feed.kind !== 'rsshub' || !feed.tgChannel) return feed;
  const base = (process.env.RSSHUB_BASE || '').replace(/\/+$/, '');
  if (base) {
    return { ...feed, url: `${base}/telegram/channel/${feed.tgChannel}` };
  }
  // Fallback: t.me/s/{channel} — публичная веб-страница канала. Не нужен
  // RSSHub, не нужен Telegram-бот, работает напрямую.
  return { ...feed, kind: 'tg-web', url: `https://t.me/s/${feed.tgChannel}` };
}

// Direct scrape of https://t.me/s/{channel} — public preview page rendered
// server-side, no auth required. Pulls last ~25 posts with photos.
async function fetchTelegramWeb(feedRaw, refresh) {
  const feed = resolveRsshubFeed(feedRaw);
  if (feed.status === 'unavailable' || !feed.url) return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;

  try {
    const html = await abortable(signal => fetch(feed.url, {
      signal,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    }).then(r => r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))), FETCH_TIMEOUT_MS);

    // Each post: <div class="tgme_widget_message_wrap..."> with data-post,
    // optional photo wraps (background-image:url(...)) и text block.
    const items = [];
    const seen = new Set();
    // Capture each message wrap up to the *end* of its footer so <time datetime>
    // gets included.
    const wrapRe = /<div class="tgme_widget_message_wrap[\s\S]*?<div class="tgme_widget_message_footer[\s\S]*?<\/div>\s*<\/div>/g;
    let m;
    while ((m = wrapRe.exec(html)) !== null) {
      const block = m[0];
      const postM = block.match(/data-post="([^"]+)"/);
      if (!postM) continue;
      const post = postM[1]; // e.g. "awdee/12345"
      if (seen.has(post)) continue;
      seen.add(post);

      const photoM = block.match(/background-image:url\('([^']+telesco[^']+)'\)/);
      if (!photoM) continue; // skip text-only posts (no thumb → would be filtered later anyway)
      const thumb = photoM[1];

      const textM = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      const text = textM ? stripTags(textM[1]).slice(0, 220) : '';

      const dateM = block.match(/<time[^>]+datetime="([^"]+)"/);
      const publishedAt = dateM ? new Date(dateM[1]).toISOString() : null;

      items.push({
        id: feed.id + '-' + post.replace(/[^a-z0-9]/gi, '-'),
        source: feed.id,
        sourceLabel: feed.label,
        lang: feed.lang || 'ru',
        title: text.split('\n')[0].slice(0, 200),
        description: text,
        url: 'https://t.me/' + post,
        thumb,
        publishedAt,
        author: feed.label,
      });
      if (items.length >= RSS_LIMIT) break;
    }

    // 1.4.3: если t.me/s/ ответил 200 но без message-wrap'ов — это заглушка.
    // Юзер увидит понятный текст, не «available, 0 items».
    if (!items.length) {
      const verboseMsg = process.env.RSSHUB_BASE
        ? `${feed.tgChannel}: t.me/s/ closed or empty (RSSHub fallback не дал items)`
        : `${feed.tgChannel}: t.me/s/ closed (приватные превью). Поднимите RSSHub или попросите автора открыть.`;
      failed.set(feed.id, { error: verboseMsg, at: Date.now() });
      return cached ? cached.items : [];
    }
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    const verboseMsg = String(e.message || '').includes('403')
      ? `t.me/s/ blocked by your IP (некоторые провайдеры режут TG). Поднимите свой RSSHub.`
      : (e.message || String(e));
    console.warn(`[feed:${feed.id}]`, verboseMsg);
    failed.set(feed.id, { error: verboseMsg, at: Date.now() });
    return cached ? cached.items : [];
  }
}

async function fetchRssFeed(feedRaw, refresh) {
  const feed = resolveRsshubFeed(feedRaw);
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  // `slow: true` — фиды с большим payload (Remodelista 450 KB, Gardenista 680 KB
  // и пр.). Стандартного 7-сек таймаута им мало.
  const timeout = feed.kind === 'rsshub' ? RSSHUB_TIMEOUT_MS
                : feed.slow ? SLOW_TIMEOUT_MS
                : FETCH_TIMEOUT_MS;
  // tlsRelax: true — для серверов с неполной TLS chain (snob, AIGA, doga).
  // Использует undici Agent с rejectUnauthorized: false. Применять только для
  // read-only RSS — никакого user-input в этих запросах нет.
  const fetchImpl = feed.tlsRelax ? fetchInsecure : fetch;
  const headers = {
    'User-Agent': BROWSER_UA,
    'Accept': 'application/rss+xml, application/xml;q=0.9, application/atom+xml;q=0.9, text/xml;q=0.8',
  };
  try {
    let xml;
    try {
      xml = await abortable(signal => fetchImpl(feed.url, {
        signal, headers, redirect: 'follow',
      }).then(async r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return decodeFeedBody(await r.arrayBuffer(), r.headers.get('content-type'));
      }), timeout);
    } catch (e) {
      // archiveFallback: true — последняя попытка через Wayback Machine.
      // Используется для источников с известными интермиттент-проблемами
      // (мёртвые домены с ранее живым RSS, 403/404/DNS-fail).
      if (!feed.archiveFallback) throw e;
      const cached = await fetchWithWaybackFallback(feed.url, { headers, redirect: 'follow' });
      if (!cached) throw e;
      xml = cached;
    }
    const items = parseRssItems(xml).slice(0, RSS_LIMIT).map(it => rssItemToPost(it, feed));
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    console.warn(`[feed:${feed.id}]`, e.message || e);
    failed.set(feed.id, { error: e.message || String(e), at: Date.now() });
    return cached ? cached.items : [];
  }
}

async function fetchSubTop(sub) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=day&limit=${REDDIT_PER_SUB}`;
  return abortable(signal => fetch(url, {
    signal,
    headers: { 'User-Agent': BROWSER_UA },
  }).then(r => r.ok ? r.json() : Promise.reject(new Error(`reddit ${r.status}`))), FETCH_TIMEOUT_MS);
}

async function fetchRedditFeed(feed, refresh) {
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  const results = await Promise.allSettled(feed.subs.map(fetchSubTop));
  const items = [];
  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    for (const child of (res.value?.data?.children || [])) {
      const p = child.data;
      if (!p) continue;
      let imgUrl = null;
      if (p.preview?.images?.[0]?.source?.url) {
        imgUrl = p.preview.images[0].source.url.replace(/&amp;/g, '&');
      } else if (p.url && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(p.url)) {
        imgUrl = p.url;
      }
      if (!imgUrl) continue;
      items.push({
        id: 'reddit-' + p.id,
        source: feed.id,
        sourceLabel: feed.label,
        lang: feed.lang || 'en',
        title: stripTags(p.title || '').slice(0, 200),
        description: stripTags((p.selftext || '').slice(0, 600)).slice(0, 220),
        url: 'https://reddit.com' + p.permalink,
        thumb: imgUrl,
        publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
        author: 'r/' + p.subreddit + ' · u/' + p.author,
      });
    }
  }
  rssCache.set(feed.id, { items, at: Date.now() });
  failed.delete(feed.id);
  return items;
}

// Кешированные обёртки для kind: 'mastodon' / 'bluesky' / 'wp-reader'.
// Те же RSS_TTL/failed-cache, что и у RSS — единый паттерн.
async function fetchMastodonCached(feed, refresh) {
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  try {
    const items = await fetchMastodonFeed(feed);
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    failed.set(feed.id, { error: e.message, at: Date.now() });
    console.warn('[feed:' + feed.id + ']', e.message);
    return [];
  }
}
async function fetchBlueskyCached(feed, refresh) {
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  try {
    const items = await fetchBlueskyFeed(feed);
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    failed.set(feed.id, { error: e.message, at: Date.now() });
    console.warn('[feed:' + feed.id + ']', e.message);
    return [];
  }
}
async function fetchSitemapCached(feed, refresh) {
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  try {
    const items = await fetchSitemapFeed(feed);
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    failed.set(feed.id, { error: e.message, at: Date.now() });
    console.warn('[feed:' + feed.id + ']', e.message);
    return [];
  }
}
async function fetchWpReaderCached(feed, refresh) {
  if (feed.status === 'unavailable') return [];
  const cached = rssCache.get(feed.id);
  if (!refresh && cached && Date.now() - cached.at < RSS_TTL) return cached.items;
  try {
    const items = await fetchWpReaderFeed(feed);
    rssCache.set(feed.id, { items, at: Date.now() });
    failed.delete(feed.id);
    return items;
  } catch (e) {
    failed.set(feed.id, { error: e.message, at: Date.now() });
    console.warn('[feed:' + feed.id + ']', e.message);
    return [];
  }
}

// Run og:image fallback only for posts that didn't get a thumb from RSS.
// Posts marked textOnly are kept even without thumb — фронт покажет текстовую
// плашку вместо картинки (Bureau и пр. чисто текстовые источники).
async function enrichWithOgImages(items) {
  const withoutThumb = items.filter(i => !i.thumb && i.url);
  const withThumb = items.filter(i => i.thumb);
  if (!withoutThumb.length) return items;

  const enriched = await Promise.allSettled(withoutThumb.map(async i => {
    const og = await fetchOgImage(i.url);
    return og ? { ...i, thumb: og } : i; // keep i, even if no og — frontend handles text-only
  }));
  const tail = enriched
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
    // Drop only if not text-only AND still no thumb after og fallback
    .filter(i => i.thumb || i.textOnly);
  return [...withThumb, ...tail];
}

// ---------- main entry ----------

// Migration: если в `sources=` пришли старые агрегированные id (`reddit`,
// `reddit-aesthetic`), разворачиваем их в реальные per-sub id, чтобы
// сохранённые привязки пресетов продолжили работать.
const REDDIT_ALIASES = {
  reddit:           DESIGNER_SUBS.map(s => 'r-' + s),
  'reddit-aesthetic': AESTHETIC_SUBS.map(s => 'r-' + s),
};
function expandRedditAliases(sources) {
  if (!Array.isArray(sources)) return sources;
  const out = [];
  for (const id of sources) {
    if (REDDIT_ALIASES[id]) out.push(...REDDIT_ALIASES[id]);
    else out.push(id);
  }
  return out;
}

export async function getFeedItems({ sources = null, lang = null, mode = null, refresh = false } = {}) {
  if (Array.isArray(sources)) sources = expandRedditAliases(sources);
  let requested = (sources && sources.length)
    ? FEEDS.filter(f => sources.includes(f.id))
    : FEEDS;
  if (mode) {
    requested = requested.filter(f => !f.modes || f.modes.includes(mode));
  }
  if (lang && lang !== 'all') {
    requested = requested.filter(f => (f.lang || 'en') === lang);
  }

  const tasks = requested.map(feed => {
    // RSSHub-подобные tg-каналы могут переключаться на t.me/s/ scrape если
    // RSSHUB_BASE не задан в env — `resolveRsshubFeed` выставит kind='tg-web'.
    const resolved = feed.kind === 'rsshub' ? resolveRsshubFeed(feed) : feed;
    if (resolved.kind === 'reddit')    return fetchRedditFeed(resolved, refresh);
    if (resolved.kind === 'scrape')    return fetchScrapeFeed(resolved, refresh);
    if (resolved.kind === 'tg-web')    return fetchTelegramWeb(resolved, refresh);
    if (resolved.kind === 'mastodon')  return fetchMastodonCached(resolved, refresh);
    if (resolved.kind === 'bluesky')   return fetchBlueskyCached(resolved, refresh);
    if (resolved.kind === 'wp-reader') return fetchWpReaderCached(resolved, refresh);
    if (resolved.kind === 'sitemap')   return fetchSitemapCached(resolved, refresh);
    if (resolved.kind === 'bluesky-firehose') return fetchBlueskyFirehoseFeed(resolved);
    return fetchRssFeed(resolved, refresh);
  });
  const settled = await Promise.allSettled(tasks);
  let items = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') items.push(...res.value);
  }

  items = await enrichWithOgImages(items);
  // Drop everything still without a thumbnail — except text-only sources
  // (Бюро Горбунова и т. п.), которые фронт рисует текстовой плашкой.
  items = items.filter(i => i.thumb || i.textOnly);

  // Sort by publishedAt desc; null at end
  items.sort((a, b) => {
    const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bt - at;
  });

  return items.slice(0, TOTAL_LIMIT);
}

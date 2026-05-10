// Internet Archive — Open Library / advancedsearch JSON API.
// Filter to image media so we can show thumbnails. Each item has a stable
// `identifier`, used to build https://archive.org/services/img/{id} thumbs.

const BASE = 'https://archive.org/advancedsearch.php';

async function _iarchiveQuery(qExpr) {
  const params = new URLSearchParams({
    q: `(${qExpr}) AND mediatype:(image)`,
    rows: '30',
    output: 'json',
    sort: '-week',
  });
  const fields = ['identifier', 'title', 'creator', 'date', 'subject', 'description'];
  fields.forEach(f => params.append('fl[]', f));
  const r = await fetch(`${BASE}?${params}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Soma-Reference/1.0' },
  });
  if (!r.ok) throw new Error(`internet-archive ${r.status}`);
  const data = await r.json();
  return data?.response?.docs || [];
}

export async function searchInternetArchive(query) {
  // Multi-word без кавычек = OR-связка → IA ловит документы с любым из слов.
  // `sort=downloads desc` дополнительно тянет популярные сканы (тиражные
  // обложки), отсюда «нерелевантный» шум. Заворачиваем в кавычки + берём
  // свежесть недели вместо downloads.
  const trimmed = (query || '').trim();
  const isPhrase = trimmed.includes(' ');
  // 1-я попытка: точная фраза в кавычках (узкий релевантный поиск).
  let docs = await _iarchiveQuery(isPhrase ? `"${trimmed}"` : trimmed);
  // 2-я попытка fallback: если phrase-search пуст и запрос multi-word —
  // делаем AND-связку всех слов (без кавычек). Это шире, но всё ещё
  // требует все слова в каком-то поле документа.
  if (!docs.length && isPhrase) {
    const words = trimmed.split(/\s+/).filter(w => w.length >= 3);
    if (words.length >= 2) {
      docs = await _iarchiveQuery(words.join(' AND '));
    }
  }
  // 3-я попытка fallback: только самое длинное слово. Меньше точности,
  // но хоть какая-то выдача.
  if (!docs.length && isPhrase) {
    const words = trimmed.split(/\s+/).filter(w => w.length >= 4);
    if (words.length) {
      const longest = words.sort((a, b) => b.length - a.length)[0];
      docs = await _iarchiveQuery(longest);
    }
  }
  return docs.filter(d => d.identifier).map(d => ({
    url:    `https://archive.org/services/img/${d.identifier}`,
    thumb:  `https://archive.org/services/img/${d.identifier}`,
    source: 'iarchive',
    author: Array.isArray(d.creator) ? d.creator[0] : (d.creator || 'Internet Archive'),
    authorUrl: 'https://archive.org/',
    pageUrl: `https://archive.org/details/${d.identifier}`,
    id: 'ia-' + d.identifier,
    title: d.title || '',
    description: typeof d.description === 'string' ? d.description : (Array.isArray(d.description) ? d.description.join(' ') : ''),
    tags: Array.isArray(d.subject) ? d.subject.slice(0, 12) : (d.subject ? [d.subject] : []),
    period: d.date ? String(d.date).slice(0, 10) : null,
    license: 'Public Domain / varies',
  }));
}

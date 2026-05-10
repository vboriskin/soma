// Telegram Bot API клиент. Без новых зависимостей — на стандартном fetch.
// Токен читается из process.env.TELEGRAM_BOT_TOKEN. Если переменной нет —
// модуль возвращает hasToken: false и все методы кидают.
//
// Используются 5 endpoint'ов:
//   getMe                 — узнать username бота, проверить токен
//   getUpdates            — последние 24ч сообщений (для discovery chat_id'ов)
//   sendMessage           — текстовое (для теста)
//   sendPhoto             — одиночная картинка с caption
//   sendMediaGroup        — альбом до 10 картинок (для массовой отправки)
//
// Лимиты, на которые опираемся:
//   - URL картинки ≤ 5 MB (иначе fallback на sendDocument)
//   - caption ≤ 1024 символов
//   - sendMediaGroup ≤ 10 элементов в одном вызове
//   - rate-limit: ~30 messages/sec на бота, на группу ~20/min

const FETCH_TIMEOUT_MS = 12000;
const CAPTION_MAX = 1024;

function token() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

export function hasToken() {
  return !!token();
}

function abortable(promiseFactory, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return promiseFactory(ctrl.signal).finally(() => clearTimeout(timer));
}

async function callApi(method, body, opts = {}) {
  if (!token()) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const url = `https://api.telegram.org/bot${token()}/${method}`;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  };
  const r = await abortable(signal => fetch(url, { ...init, signal }), opts.timeout || FETCH_TIMEOUT_MS);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) {
    const desc = data.description || `HTTP ${r.status}`;
    const err = new Error(desc);
    err.code = data.error_code || r.status;
    err.payload = data;
    throw err;
  }
  return data.result;
}

// Build caption per task spec. Title (если есть) + author·source + pageUrl (если есть).
// Trim до 1024 символов с многоточием.
export function buildCaption(item) {
  const parts = [];
  const title = (item.title || item.description || '').trim();
  if (title) parts.push(title);
  const meta = [item.author, item.source].filter(Boolean).join(' · ');
  if (meta) parts.push(meta);
  if (item.pageUrl) parts.push(item.pageUrl);
  let caption = parts.join('\n\n');
  if (caption.length > CAPTION_MAX) caption = caption.slice(0, CAPTION_MAX - 1) + '…';
  return caption;
}

export async function getMe() {
  return callApi('getMe', null);
}

export async function getUpdates({ offset, limit = 100 } = {}) {
  return callApi('getUpdates', { offset, limit, timeout: 0 });
}

export async function sendMessage(chatId, text) {
  return callApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

// sendPhoto через URL. При неудаче (например «photo dimensions exceed»,
// «file is too big», «wrong type») — fallback на sendDocument с тем же URL.
export async function sendPhoto(chatId, photoUrl, caption) {
  try {
    return await callApi('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption || undefined,
    });
  } catch (e) {
    const msg = String(e.message || '').toLowerCase();
    if (/file is too big|too large|dimensions|wrong (type|file)|webpage_curl_failed|failed to get http url content/i.test(msg)) {
      return callApi('sendDocument', {
        chat_id: chatId,
        document: photoUrl,
        caption: caption || undefined,
      });
    }
    throw e;
  }
}

// sendMediaGroup — до 10 InputMediaPhoto. Caption у первого элемента.
export async function sendMediaGroup(chatId, items) {
  if (!items.length) return null;
  if (items.length > 10) throw new Error('sendMediaGroup: max 10 items');
  const media = items.map((it, i) => ({
    type: 'photo',
    media: it.url,
    caption: i === 0 && it.caption ? it.caption : undefined,
  }));
  return callApi('sendMediaGroup', { chat_id: chatId, media });
}

// Извлечь {chatId, type, name} из массива updates для discovery
export function extractChatsFromUpdates(updates) {
  const seen = new Map();
  for (const upd of updates || []) {
    const msg = upd.message || upd.channel_post || upd.edited_message || upd.edited_channel_post;
    const chat = msg && msg.chat;
    if (!chat || !chat.id) continue;
    const id = String(chat.id);
    if (seen.has(id)) continue;
    let name;
    if (chat.type === 'private') {
      name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || `user ${id}`;
    } else {
      name = chat.title || chat.username || `chat ${id}`;
    }
    seen.set(id, { chatId: id, type: chat.type, name });
  }
  return Array.from(seen.values());
}

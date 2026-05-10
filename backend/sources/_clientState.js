// Per-client state storage — мост между фронтом (один аноним-юзер на
// браузер) и persistent volume на VDS. Без аккаунтов используем
// client-generated UUID как partition key (X-Client-Id header).
//
// Структура на диске:
//   $DATA_DIR/clients/<clientId>/
//     ├── history.jsonl              — append-only лог событий (search/save/skip/hide/...)
//     └── snapshots/<namespace>.json — full-replace снимки (catBlocklist, settings, ...)
//
// Когда введём настоящие аккаунты — clientId → userId, остальное не меняется.

import fs from 'fs/promises';
import path from 'path';

const DATA_DIR   = process.env.DATA_DIR || '/data';
const CLIENT_DIR = path.join(DATA_DIR, 'clients');

// Валидация id — только URL-safe alphanumerics, длина 16–64.
// Защищает от path traversal и инъекций имён файлов.
const ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;
export function isValidClientId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

async function ensureClientDir(clientId) {
  if (!isValidClientId(clientId)) throw new Error('invalid client id');
  const dir = path.join(CLIENT_DIR, clientId);
  await fs.mkdir(path.join(dir, 'snapshots'), { recursive: true });
  return dir;
}

// ============== HISTORY (append-only JSONL) ==============
// Каждая строка — отдельное событие. Аппенд атомарен (POSIX append-write
// до PIPE_BUF), параллельные коннекты не корраптят файл.

export async function appendHistoryEvent(clientId, event) {
  if (!event || typeof event !== 'object') throw new Error('event required');
  if (!event.id || !event.ts || !event.type) throw new Error('event needs id/ts/type');
  // Cap размера значения чтобы юзер не залил гигабайтами — 32 KB на event
  // должно хватать (даже на длинный payload).
  const line = JSON.stringify(event);
  if (line.length > 32_000) throw new Error('event too large');
  const dir = await ensureClientDir(clientId);
  await fs.appendFile(path.join(dir, 'history.jsonl'), line + '\n');
}

// Удаление истории (для UI «очистить»). Snapshots не трогает.
export async function deleteHistory(clientId) {
  if (!isValidClientId(clientId)) throw new Error('invalid client id');
  const file = path.join(CLIENT_DIR, clientId, 'history.jsonl');
  try { await fs.unlink(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

export async function readHistory(clientId, { since = 0, limit = 1000 } = {}) {
  if (!isValidClientId(clientId)) return [];
  const file = path.join(CLIENT_DIR, clientId, 'history.jsonl');
  let text;
  try { text = await fs.readFile(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      if (ev && ev.ts >= since) events.push(ev);
    } catch {}
  }
  // Берём последние `limit` (после фильтра по since) — для пагинации
  // достаточно простого slice'а; нагрузка низкая.
  return events.slice(-limit);
}

// ============== SNAPSHOTS (full-replace JSON) ==============
// Для catBlocklist и подобного. Записываем атомарно через temp+rename
// чтобы при крэше не было полу-записанного файла.

const NS_RE = /^[a-zA-Z0-9_-]{1,32}$/;
function snapshotPath(clientId, namespace) {
  if (!NS_RE.test(namespace || '')) throw new Error('invalid namespace');
  return path.join(CLIENT_DIR, clientId, 'snapshots', `${namespace}.json`);
}

export async function writeSnapshot(clientId, namespace, data) {
  const dir = await ensureClientDir(clientId);
  const file = snapshotPath(clientId, namespace);
  const tmp = file + '.tmp.' + process.pid + '.' + Date.now();
  const body = JSON.stringify({ data: data ?? null, updatedAt: Date.now() });
  if (body.length > 1_000_000) throw new Error('snapshot too large');
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, file);
}

export async function readSnapshot(clientId, namespace) {
  if (!isValidClientId(clientId)) return null;
  try {
    const text = await fs.readFile(snapshotPath(clientId, namespace), 'utf8');
    return JSON.parse(text);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

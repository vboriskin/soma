// Хранилище списка Telegram-целей (chat_id'ов, куда юзер хочет отправлять
// картинки). Файл — `backend/telegram-targets.json`, gitignored.
// Токен бота тут НЕ хранится — он только в .env (TELEGRAM_BOT_TOKEN).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(__dirname, '..', 'telegram-targets.json');

function readRaw() {
  try {
    if (!fs.existsSync(FILE)) return { targets: [], status: {} };
    const txt = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(txt);
    return {
      targets: Array.isArray(data.targets) ? data.targets : [],
      status: data.status && typeof data.status === 'object' ? data.status : {},
    };
  } catch (e) { return { targets: [], status: {} }; }
}

function writeRaw(data) {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.warn('[tg-targets]', e.message); }
}

// Простой ID-генератор: транслитерация label + suffix при коллизии.
function makeId(label, existing) {
  const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  let base = String(label || 'target').toLowerCase()
    .split('').map(c => TRANSLIT[c] !== undefined ? TRANSLIT[c] : c).join('')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  if (!base) base = 'target';
  if (!existing.find(t => t.id === base)) return base;
  for (let i = 2; i < 100; i++) {
    if (!existing.find(t => t.id === `${base}-${i}`)) return `${base}-${i}`;
  }
  return base + '-' + Date.now().toString(36);
}

export function listTargets() {
  return readRaw().targets;
}

export function getTarget(id) {
  return readRaw().targets.find(t => t.id === id) || null;
}

export function addTarget({ label, chatId, type }) {
  const data = readRaw();
  const cleanLabel = String(label || '').trim();
  const cleanChatId = String(chatId || '').trim();
  if (!cleanLabel) throw new Error('label required');
  if (!cleanChatId) throw new Error('chatId required');
  const id = makeId(cleanLabel, data.targets);
  const target = {
    id,
    label: cleanLabel,
    chatId: cleanChatId,
    type: type || 'private',
    createdAt: new Date().toISOString(),
  };
  data.targets.push(target);
  writeRaw(data);
  return target;
}

export function deleteTarget(id) {
  const data = readRaw();
  const before = data.targets.length;
  data.targets = data.targets.filter(t => t.id !== id);
  if (data.status && data.status[id]) delete data.status[id];
  writeRaw(data);
  return data.targets.length < before;
}

export function recordStatus(id, ok, error = null) {
  const data = readRaw();
  if (!data.status) data.status = {};
  data.status[id] = {
    ok: !!ok,
    error: ok ? null : (error || 'unknown error'),
    lastTested: new Date().toISOString(),
  };
  writeRaw(data);
  return data.status[id];
}

export function getStatusMap() {
  return readRaw().status || {};
}

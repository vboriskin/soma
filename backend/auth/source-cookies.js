// Generic per-source cookies store. Дополняет dribbble-cookies.js — он
// специфичен для Dribbble OAuth/WAF-обхода, тут — простое хранилище для
// SPA-источников за логином (Mobbin, Refero, Read.cv, Pinterest).
//
// Каждый source-id имеет файл `backend/cookies/{id}.txt` (gitignored).
// Применяются в _headless.js при `renderHtml(url, { cookies: [...] })`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..', 'cookies');

// Список source-id, для которых разрешено хранить cookies. Иначе любой
// произвольный id мог бы записать туда что угодно.
const ALLOWED = new Set(['mobbin', 'refero', 'readcv', 'pinterest']);

function ensureDir() {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}
}

function fileFor(id) {
  return path.join(DIR, `${id}.txt`);
}

export function isAllowed(id) {
  return ALLOWED.has(id);
}

export function hasCookies(id) {
  if (!isAllowed(id)) return false;
  try { return fs.existsSync(fileFor(id)) && fs.statSync(fileFor(id)).size > 0; }
  catch (e) { return false; }
}

export function readCookiesString(id) {
  if (!isAllowed(id)) return null;
  try {
    const f = fileFor(id);
    if (fs.existsSync(f)) {
      const v = fs.readFileSync(f, 'utf8').trim();
      if (v) return v;
    }
  } catch (e) {}
  return null;
}

// Парсит строку `name=value; name2=value2; ...` в массив объектов
// { name, value, domain, path } для Playwright context.addCookies.
// Domain выводится из конфигурации source.
const SOURCE_DOMAINS = {
  mobbin:    '.mobbin.com',
  refero:    '.refero.design',
  readcv:    '.posts.cv',
  pinterest: '.pinterest.com',
};

export function readCookiesAsArray(id) {
  const raw = readCookiesString(id);
  if (!raw) return null;
  const domain = SOURCE_DOMAINS[id];
  if (!domain) return null;
  const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
  return parts.map(part => {
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) return null;
    return { name, value, domain, path: '/' };
  }).filter(Boolean);
}

export function writeCookies(id, value) {
  if (!isAllowed(id)) throw new Error(`unknown source: ${id}`);
  ensureDir();
  const v = String(value || '').trim();
  if (!v) throw new Error('empty cookie value');
  fs.writeFileSync(fileFor(id), v, 'utf8');
}

export function clearCookies(id) {
  if (!isAllowed(id)) return;
  try { fs.unlinkSync(fileFor(id)); } catch (e) {}
}

export function listSources() {
  return Array.from(ALLOWED).map(id => ({
    id,
    domain: SOURCE_DOMAINS[id],
    hasCookies: hasCookies(id),
  }));
}

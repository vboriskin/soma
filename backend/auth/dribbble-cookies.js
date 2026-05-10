// Shared store for Dribbble cookies + last-request status.
// Cookies live as a single line in `backend/dribbble-cookies.txt`.
// Status (ok / error / lastTested) lives as JSON in `backend/dribbble-status.json`.
// Both are gitignored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.resolve(__dirname, '..', 'dribbble-cookies.txt');
const STATUS_FILE  = path.resolve(__dirname, '..', 'dribbble-status.json');

export function hasCookies() {
  try { return fs.existsSync(COOKIES_FILE) && fs.statSync(COOKIES_FILE).size > 0; }
  catch (e) { return false; }
}

// Read cookies: file → DRIBBBLE_COOKIE env fallback → null.
export function readCookies() {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const v = fs.readFileSync(COOKIES_FILE, 'utf8').trim();
      if (v) return v;
    }
  } catch (e) {}
  return process.env.DRIBBBLE_COOKIE || null;
}

export function writeCookies(value) {
  const v = String(value || '').trim();
  if (!v) throw new Error('empty cookie value');
  fs.writeFileSync(COOKIES_FILE, v, 'utf8');
}

export function clearCookies() {
  try { fs.unlinkSync(COOKIES_FILE); } catch (e) {}
  // Also forget the last status — it's now meaningless
  try { fs.unlinkSync(STATUS_FILE); } catch (e) {}
}

export function readStatus() {
  let stored = { ok: null, lastTested: null, error: null };
  try {
    if (fs.existsSync(STATUS_FILE)) {
      stored = { ...stored, ...JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')) };
    }
  } catch (e) {}
  return {
    hasCookies: hasCookies(),
    lastTested: stored.lastTested,
    ok: stored.ok,
    error: stored.error,
  };
}

export function recordStatus(ok, error) {
  const payload = {
    ok: !!ok,
    error: ok ? null : (error || 'unknown error'),
    lastTested: new Date().toISOString(),
  };
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify(payload, null, 2), 'utf8'); }
  catch (e) {}
  return payload;
}

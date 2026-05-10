// Dribbble OAuth (authorization_code flow). One-shot login: open
// /auth/dribbble in a browser, allow on Dribbble's side, and the token gets
// written to backend/dribbble-token.json. The token is long-lived.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import {
  readStatus,
  writeCookies,
  clearCookies,
  hasCookies,
} from './dribbble-cookies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, '..', 'dribbble-token.json');

const AUTHORIZE_URL = 'https://dribbble.com/oauth/authorize';
const TOKEN_URL = 'https://dribbble.com/oauth/token';

function buildRedirect(req) {
  const proto = req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/auth/dribbble/callback`;
}

const router = Router();

router.get('/dribbble', (req, res) => {
  const id = process.env.DRIBBBLE_CLIENT_ID;
  if (!id) {
    return res.status(500).type('text/plain').send('DRIBBBLE_CLIENT_ID is not set in .env');
  }
  const redirect = buildRedirect(req);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', id);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('scope', 'public');
  res.redirect(url.toString());
});

router.get('/dribbble/callback', async (req, res) => {
  const id = process.env.DRIBBBLE_CLIENT_ID;
  const secret = process.env.DRIBBBLE_CLIENT_SECRET;
  const code = req.query.code;
  if (!id || !secret) {
    return res.status(500).type('text/plain').send('DRIBBBLE_CLIENT_ID/SECRET not set in .env');
  }
  if (!code) {
    return res.status(400).type('text/plain').send('missing ?code in callback');
  }
  const redirect = buildRedirect(req);
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        code: String(code),
        redirect_uri: redirect,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      return res.status(500).type('text/plain').send(`token exchange failed: ${JSON.stringify(data).slice(0, 300)}`);
    }
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.type('text/html').send(renderDonePage());
  } catch (e) {
    res.status(500).type('text/plain').send('callback error: ' + e.message);
  }
});

// Status of the cookies-based scrape path
router.get('/dribbble/status', (_req, res) => {
  res.json(readStatus());
});

// Save cookies submitted from the SOMA settings UI
router.post('/dribbble/cookies', (req, res) => {
  const cookie = (req.body && req.body.cookie) || '';
  if (!cookie || typeof cookie !== 'string') {
    return res.status(400).json({ error: 'missing cookie field' });
  }
  try {
    writeCookies(cookie);
    res.json({ ok: true, hasCookies: hasCookies() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/dribbble/cookies', (_req, res) => {
  clearCookies();
  res.json({ ok: true, hasCookies: hasCookies() });
});

function renderDonePage() {
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><title>SOMA · готово</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,300;9..144,1,300&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #fafaf9;
    color: #1a1a1a;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 300;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 360px; padding: 24px; text-align: center; }
  .brand { font-size: 16px; letter-spacing: 0.55em; margin-right: -0.55em; margin-bottom: 32px; }
  h1 { font-style: italic; font-weight: 300; font-size: 22px; letter-spacing: -0.02em; margin-bottom: 12px; }
  p { font-size: 13px; color: #888; line-height: 1.7; font-style: italic; }
  hr { border: none; border-top: 0.5px solid #e4e3e0; margin: 24px 0; }
</style></head>
<body>
  <div class="wrap">
    <div class="brand">SOMA</div>
    <h1>готово</h1>
    <hr>
    <p>токен dribbble сохранён.<br>можно закрыть это окно и вернуться в SOMA.</p>
  </div>
</body></html>`;
}

export default router;

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import dribbbleAuth from './auth/dribbble.js';
import { closeBrowser } from './sources/_headless.js';
import { shutdownFirehose } from './sources/_bluesky_firehose.js';

const app = express();
const PORT = Number(process.env.PORT) || 8787;

// ============== CORS ==============
// В деве — `*`, на проде — белый список origin'ов из env (через запятую).
// Для альфы держим строгий список; preview-домены *.pages.dev можно
// разрешить переключателем ALLOW_PAGES_DEV=1.
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Без origin — server-to-server (curl, health-check, sdk). Разрешаем.
    if (!origin) return cb(null, true);
    // В деве (NODE_ENV !== production) разрешаем всё.
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    if (process.env.ALLOW_PAGES_DEV === '1') {
      try {
        if (/\.pages\.dev$/.test(new URL(origin).hostname)) return cb(null, true);
      } catch {}
    }
    return cb(new Error(`origin not allowed: ${origin}`));
  },
  credentials: true,
  // Кастомный header для альфа-гейта (см. alphaKeyGate ниже).
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Alpha-Key'],
}));
app.use(express.json());

// ============== Health-check ==============
// Fly использует это для liveness; UptimeRobot пингует это же. Никакого
// auth — отвечает всегда быстро.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ============== Alpha-key gate (закрытая альфа) ==============
// Пока нет нормальных аккаунтов — закрываем API одним общим ключом.
// Ключ приходит из env ALPHA_KEY. Если не задан — гейт выключен (дев/локал).
//
// Фронт хранит ключ в localStorage и шлёт в header `X-Alpha-Key`. Также
// принимаем `?alpha=...` (для curl-тестов) и cookie `soma_alpha` (на будущее).
//
// `/healthz` и `/` остаются открытыми. Используем кастомный header вместо
// Basic Auth — чтобы не дёргать нативный browser-prompt и не возиться с
// `credentials: include` на 30+ fetch'ах.
function alphaKeyGate(req, res, next) {
  const expected = process.env.ALPHA_KEY;
  if (!expected) return next();
  const got = req.headers['x-alpha-key']
           || req.query?.alpha
           || (req.headers.cookie || '').match(/(?:^|;\s*)soma_alpha=([^;]+)/)?.[1];
  if (got === expected) return next();
  res.status(401).json({ error: 'alpha-key required', hint: 'set X-Alpha-Key header' });
}

app.get('/', (_req, res) => {
  res.type('text/plain').send('soma backend — ok');
});

app.use('/api', alphaKeyGate, routes);
app.use('/auth', alphaKeyGate, dribbbleAuth);

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err?.message || 'internal error' });
});

const server = app.listen(PORT, () => {
  console.log(`soma backend listening on http://localhost:${PORT}`);
  if (ALLOWED.length) console.log('[cors] allowed origins:', ALLOWED.join(', '));
});

// Graceful shutdown — закрываем headless-браузер до того, как Node погасит
// event-loop. Иначе Chromium-процесс остаётся zombie на macOS.
const shutdown = async (signal) => {
  console.log(`[server] ${signal} — shutting down`);
  try { shutdownFirehose(); } catch (e) {}
  try { await closeBrowser(); } catch (e) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

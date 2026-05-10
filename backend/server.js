import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import stateRoutes from './routes-state.js';
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Alpha-Key', 'X-Client-Id'],
}));
app.use(express.json());

// ============== Health-check ==============
// Fly использует это для liveness; UptimeRobot пингует это же. Никакого
// auth — отвечает всегда быстро.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ============== Alpha-key gate (закрытая альфа) ==============
// Пока нет нормальных аккаунтов — закрываем API alpha-ключами.
// `ALPHA_KEY` принимает список ключей через запятую — любой валидный
// пропускает. `BELL_KEY` — отдельный «invite-tier» ключ, тоже должен
// присутствовать в ALPHA_KEY (он же должен пускать вообще). Если юзер
// зашёл по BELL_KEY — /api/info вернёт ему capability `bell:true` и
// фронт покажет скрытый режим.
//
// /healthz и / остаются открытыми. Кастомный header вместо Basic Auth —
// проще для SPA (не нужен `credentials: include` на 30+ fetch'ах).
function getValidAlphaKeys() {
  const raw = process.env.ALPHA_KEY || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}
function getBellKey() {
  return (process.env.BELL_KEY || '').trim() || null;
}
function alphaKeyGate(req, res, next) {
  const valid = getValidAlphaKeys();
  if (!valid.length) return next();   // гейт выключен (дев)
  const got = req.headers['x-alpha-key']
           || req.query?.alpha
           || (req.headers.cookie || '').match(/(?:^|;\s*)soma_alpha=([^;]+)/)?.[1];
  if (valid.includes(got)) {
    req.alphaKey = got;   // downstream: /api/info использует для capability-check
    return next();
  }
  res.status(401).json({ error: 'alpha-key required', hint: 'set X-Alpha-Key header' });
}

app.get('/', (_req, res) => {
  res.type('text/plain').send('soma backend — ok');
});

// State-эндпоинты (history + snapshots) на /api/state — монтируем ДО
// общего /api → routes, чтобы Express по prefix-match сначала проверил
// более специфичный путь.
app.use('/api/state', alphaKeyGate, stateRoutes);
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

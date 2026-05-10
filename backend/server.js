import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import dribbbleAuth from './auth/dribbble.js';
import { closeBrowser } from './sources/_headless.js';
import { shutdownFirehose } from './sources/_bluesky_firehose.js';

const app = express();
const PORT = Number(process.env.PORT) || 8787;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('text/plain').send('soma backend — ok');
});

app.use('/api', routes);
app.use('/auth', dribbbleAuth);

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err?.message || 'internal error' });
});

const server = app.listen(PORT, () => {
  console.log(`soma backend listening on http://localhost:${PORT}`);
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

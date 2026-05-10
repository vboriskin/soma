// Client-state routes — мост между фронтом и persistent volume.
// Mounted at /api/state (см. server.js). Все эндпоинты требуют
// валидного X-Client-Id (тот же header проверяем сами, alphaKeyGate уже
// фильтрует на уровне /api).
//
//   GET    /api/state/history?since=<ts>&limit=<n>
//   POST   /api/state/history                        body: event
//   GET    /api/state/snapshot/:namespace
//   PUT    /api/state/snapshot/:namespace            body: { data }

import express from 'express';
import {
  appendHistoryEvent,
  readHistory,
  deleteHistory,
  writeSnapshot,
  readSnapshot,
  isValidClientId,
} from './sources/_clientState.js';

const router = express.Router();

function getClientId(req, res) {
  const id = req.headers['x-client-id'];
  if (!isValidClientId(id)) {
    res.status(400).json({ error: 'missing or invalid X-Client-Id header' });
    return null;
  }
  return id;
}

// ---------- HISTORY ----------
router.get('/history', async (req, res) => {
  const cid = getClientId(req, res);
  if (!cid) return;
  const since = Number(req.query.since) || 0;
  const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 5000);
  try {
    const events = await readHistory(cid, { since, limit });
    res.json({ events });
  } catch (e) {
    console.warn('[state.history.get]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/history', async (req, res) => {
  const cid = getClientId(req, res);
  if (!cid) return;
  try {
    await appendHistoryEvent(cid, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/history', async (req, res) => {
  const cid = getClientId(req, res);
  if (!cid) return;
  try {
    await deleteHistory(cid);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- SNAPSHOTS ----------
router.get('/snapshot/:namespace', async (req, res) => {
  const cid = getClientId(req, res);
  if (!cid) return;
  try {
    const snap = await readSnapshot(cid, req.params.namespace);
    res.json(snap || { data: null, updatedAt: 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/snapshot/:namespace', async (req, res) => {
  const cid = getClientId(req, res);
  if (!cid) return;
  try {
    const data = req.body && Object.prototype.hasOwnProperty.call(req.body, 'data')
      ? req.body.data
      : req.body;
    await writeSnapshot(cid, req.params.namespace, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;

import { Router } from 'express';
import webpush from 'web-push';
import db from '../db.js';
import { sendPushToUsers } from '../pushSender.js';
import { requireAuth, requireKsiegowy } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';

const router = Router();

function initWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;
  if (pub && priv && subj) {
    webpush.setVapidDetails(subj, pub, priv);
    return true;
  }
  return false;
}

// GET /push/vapid-public-key — klucz publiczny dla frontendu
router.get('/vapid-public-key', requireAuth, (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.json({ key: null });
  res.json({ key });
});

// POST /push/subscribe — zapisz subskrypcję
router.post('/subscribe', requireAuth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Brak subskrypcji' });
  try {
    await db.query(
      `INSERT INTO push_subscriptions (uzytkownik_id, subscription)
       VALUES ($1, $2)
       ON CONFLICT (uzytkownik_id, (subscription->>'endpoint')) DO UPDATE SET subscription = $2`,
      [req.user.id, JSON.stringify(subscription)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /push/subscribe — usuń subskrypcję
router.delete('/subscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await db.query(
      `DELETE FROM push_subscriptions WHERE uzytkownik_id=$1 AND subscription->>'endpoint'=$2`,
      [req.user.id, endpoint]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /push/status — czy użytkownik ma aktywną subskrypcję
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM push_subscriptions WHERE uzytkownik_id=$1',
      [req.user.id]
    );
    res.json({ subscribed: parseInt(result.rows[0].count) > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /push/test — test powiadomienia dla zalogowanego użytkownika (admin)
router.post('/test', requireKsiegowy, async (req, res) => {
  if (!initWebPush()) return res.status(400).json({ error: 'Brak konfiguracji VAPID w .env' });
  const result = await sendPushToUsers(
    [req.user.id],
    'Test powiadomienia',
    'Klasowy Księgowy — powiadomienia push działają!'
  );
  await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'push_test' });
  res.json(result);
});

export default router;

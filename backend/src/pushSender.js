import webpush from 'web-push';
import db from './db.js';

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

export async function sendPushToUsers(uzytkownikIds, title, body, url = '/') {
  if (!initWebPush() || !uzytkownikIds?.length) return { wyslano: 0, bledy: [] };

  const result = await db.query(
    `SELECT id, uzytkownik_id, subscription FROM push_subscriptions
     WHERE uzytkownik_id = ANY($1::uuid[])`,
    [uzytkownikIds]
  );

  let wyslano = 0;
  const bledy = [];

  for (const row of result.rows) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url }));
      wyslano++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.query('DELETE FROM push_subscriptions WHERE id=$1', [row.id]);
      } else {
        bledy.push(`${row.uzytkownik_id}: ${err.message}`);
      }
    }
  }

  return { wyslano, bledy };
}

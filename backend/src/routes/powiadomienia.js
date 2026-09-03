import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const DOMYSLNE = {
  login_fail: true,
  login_blocked: true,
  mfa_fail: true,
  captcha_fail: true,
  reset_hasla: true,
  masowy_mailing: true,
  restore_backup: true,
  hibp_wyciekle: true,
  raport_dzienny: false,
};

// GET /powiadomienia/admin — pobierz preferencje zalogowanego admina
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM admin_powiadomienia WHERE uzytkownik_id=$1',
      [req.user.id]
    );
    if (!result.rows[0]) {
      // Brak wpisu — zwróć domyślne
      return res.json(DOMYSLNE);
    }
    const { id, uzytkownik_id, updated_at, ...prefs } = result.rows[0];
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PUT /powiadomienia/admin — zapisz preferencje
router.put('/admin', requireAdmin, async (req, res) => {
  const prefs = {};
  for (const key of Object.keys(DOMYSLNE)) {
    prefs[key] = req.body[key] !== undefined ? !!req.body[key] : DOMYSLNE[key];
  }
  try {
    await db.query(
      `INSERT INTO admin_powiadomienia (uzytkownik_id, ${Object.keys(prefs).join(', ')})
       VALUES ($1, ${Object.keys(prefs).map((_, i) => `$${i+2}`).join(', ')})
       ON CONFLICT (uzytkownik_id) DO UPDATE SET
         ${Object.keys(prefs).map(k => `${k} = EXCLUDED.${k}`).join(', ')},
         updated_at = NOW()`,
      [req.user.id, ...Object.values(prefs)]
    );
    res.json(prefs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

// Eksportowana funkcja do sprawdzenia czy admin chce dane powiadomienie
export async function czyPowiadamiac(uzytkownikId, typ) {
  try {
    const result = await db.query(
      `SELECT ${typ} FROM admin_powiadomienia WHERE uzytkownik_id=$1`,
      [uzytkownikId]
    );
    if (!result.rows[0]) return true; // brak wpisu = domyślnie tak
    return result.rows[0][typ] === true;
  } catch {
    return true; // błąd = domyślnie tak
  }
}

// Pobierz wszystkich adminów z preferencjami dla danego typu
export async function adminowieDoPowiadomienia(typ) {
  try {
    const result = await db.query(
      `SELECT u.id, u.email_enc FROM uzytkownicy u
       WHERE u.rola = 'admin' AND u.email_enc IS NOT NULL
         AND (
           NOT EXISTS (SELECT 1 FROM admin_powiadomienia p WHERE p.uzytkownik_id = u.id)
           OR EXISTS (SELECT 1 FROM admin_powiadomienia p WHERE p.uzytkownik_id = u.id AND p.${typ} = TRUE)
         )`
    );
    return result.rows.map(r => ({ ...r, email: decryptField(r.email_enc) }));
  } catch {
    return [];
  }
}

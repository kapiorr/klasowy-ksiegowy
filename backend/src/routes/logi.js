import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

function sanitizeCsv(val) {
  const s = String(val ?? '');
  // Neutralizuj wiodące znaki formuł Excela
  if (s && ['=', '+', '-', '@', '\t', '\r'].includes(s[0])) {
    return "'" + s;
  }
  return s;
}


// GET /logi?page=1&limit=100&akcja=&uzytkownik_id=&sukces=&od=&do=
router.get('/', requireAdmin, async (req, res) => {
  const { page = 1, limit = 100, akcja, uzytkownik_id, sukces, od, do: doDate, ip } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const where = ['1=1'];
  const params = [];
  let p = 1;

  if (akcja) { where.push(`l.akcja = $${p++}`); params.push(akcja); }
  if (uzytkownik_id) { where.push(`l.uzytkownik_id = $${p++}`); params.push(uzytkownik_id); }
  if (sukces !== undefined && sukces !== '') { where.push(`l.sukces = $${p++}`); params.push(sukces === 'true'); }
  if (od) { where.push(`l.created_at >= $${p++}`); params.push(od); }
  if (doDate) { where.push(`l.created_at <= $${p++}`); params.push(doDate + 'T23:59:59'); }
  if (ip) { where.push(`l.ip = $${p++}`); params.push(ip); }

  try {
    const [rows, total] = await Promise.all([
      db.query(
        `SELECT l.*, u.login, u.imie, u.nazwisko
         FROM logi l
         LEFT JOIN uzytkownicy u ON u.id = l.uzytkownik_id
         WHERE ${where.join(' AND ')}
         ORDER BY l.created_at DESC
         LIMIT $${p++} OFFSET $${p++}`,
        [...params, parseInt(limit), offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM logi l WHERE ${where.join(' AND ')}`,
        params
      ),
    ]);

    res.json({
      logi: rows.rows,
      total: parseInt(total.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /logi/blokady — lista blokad
router.get('/blokady', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM blokady
       WHERE zablokowany_do IS NULL OR zablokowany_do > NOW()
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /logi/blokady/:id — usuń blokadę
router.delete('/blokady/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM blokady WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /logi/export — eksport CSV
router.get('/export', requireAdmin, async (req, res) => {
  const { od, do: doDate } = req.query;
  const where = ['1=1'];
  const params = [];
  let p = 1;
  if (od) { where.push(`l.created_at >= $${p++}`); params.push(od); }
  if (doDate) { where.push(`l.created_at <= $${p++}`); params.push(doDate + 'T23:59:59'); }

  try {
    const result = await db.query(
      `SELECT l.created_at, u.login, l.login_proba, l.ip, l.akcja, l.zasob, l.szczegoly, l.sukces
       FROM logi l
       LEFT JOIN uzytkownicy u ON u.id = l.uzytkownik_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC`,
      params
    );

    const bom = '\uFEFF';
    const header = 'Data;Login;Login (próba);IP;Akcja;Zasób;Szczegóły;Sukces\n';
    const rows = result.rows.map(r =>
      [
        new Date(r.created_at).toLocaleString('pl-PL'),
        sanitizeCsv(r.login),
        sanitizeCsv(r.login_proba),
        r.ip || '',
        sanitizeCsv(r.akcja),
        sanitizeCsv(r.zasob),
        sanitizeCsv(r.szczegoly),
        r.sukces ? 'tak' : 'nie',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logi-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(bom + header + rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

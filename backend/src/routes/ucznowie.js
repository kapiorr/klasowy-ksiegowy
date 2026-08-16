import { Router } from 'express';
import { validateBody } from '../validate.js';

import db from '../db.js';
import { requireAuth, requireKsiegowy } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';

const router = Router();

function sanitizeCsv(val) {
  const s = String(val ?? '');
  // Neutralizuj wiodące znaki formuł Excela
  if (s && ['=', '+', '-', '@', '\t', '\r'].includes(s[0])) {
    return "'" + s;
  }
  return s;
}


// GET /ucznowie?wszyscy=1
router.get('/', requireAuth, async (req, res) => {
  try {
    // Domyślnie tylko aktywni; ?wszyscy=1 zwraca wszystkich
    const where = req.query.wszyscy === '1' ? '' : 'WHERE aktywny = TRUE';
    const result = await db.query(`SELECT * FROM ucznowie ${where} ORDER BY nazwisko, imie`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /ucznowie
router.post('/', requireKsiegowy, validateBody({
  imie: { type: 'string', required: true, max: 100 },
  nazwisko: { type: 'string', required: true, max: 100 },
}), async (req, res) => {
  const { imie, nazwisko } = req.body;
  if (!imie || !nazwisko) return res.status(400).json({ error: 'Imię i nazwisko są wymagane' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO ucznowie (imie, nazwisko) VALUES ($1,$2) RETURNING *',
      [imie.trim(), nazwisko.trim()]
    );
    const uczen = result.rows[0];
    const skladki = await client.query('SELECT id FROM skladki');
    for (const s of skladki.rows) {
      await client.query(
        'INSERT INTO skladka_ucznowie (skladka_id, uczen_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [s.id, uczen.id]
      );
    }
    await client.query('COMMIT');
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_uczen', zasob: req.originalUrl,
      szczegoly: `${uczen.nazwisko} ${uczen.imie}` });
    res.status(201).json(uczen);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Błąd serwera' });
  } finally {
    client.release();
  }
});

// POST /ucznowie/import-csv
// CSV: imie;nazwisko  (pierwsza linia może być nagłówkiem)
router.post('/import-csv', requireKsiegowy, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'Brak danych CSV' });

  const lines = csv.trim().split('\n').filter(Boolean);
  const results = { dodano: 0, pominieto: 0, bledy: [] };
  const client = await db.connect();

  // Pobierz wszystkie składki raz
  const skladki = await db.query('SELECT id FROM skladki');

  try {
    await client.query('BEGIN');
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(';').map(s => s.trim().replace(/^"|"$/g, ''));
      const [imie, nazwisko] = cols;

      // Pomiń nagłówek
      if (i === 0 && (!imie || imie.toLowerCase() === 'imie' || imie.toLowerCase() === 'imię')) {
        continue;
      }
      if (!imie || !nazwisko) {
        results.bledy.push(`Wiersz ${i + 1}: brak imienia lub nazwiska`);
        results.pominieto++;
        continue;
      }

      const result = await client.query(
        'INSERT INTO ucznowie (imie, nazwisko) VALUES ($1,$2) RETURNING id',
        [imie, nazwisko]
      );
      const uczenId = result.rows[0].id;

      for (const s of skladki.rows) {
        await client.query(
          'INSERT INTO skladka_ucznowie (skladka_id, uczen_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [s.id, uczenId]
        );
      }
      results.dodano++;
    }
    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd importu: ' + err.message });
  } finally {
    client.release();
  }
});

// PATCH /ucznowie/:id/aktywny — toggle aktywności ucznia
router.patch('/:id/aktywny', requireKsiegowy, async (req, res) => {
  const { aktywny } = req.body;
  try {
    const result = await db.query(
      'UPDATE ucznowie SET aktywny=$1 WHERE id=$2 RETURNING *',
      [!!aktywny, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });
    const u = result.rows[0];
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: u.aktywny ? 'uczen_aktywowany' : 'uczen_dezaktywowany',
      zasob: req.originalUrl, szczegoly: `${u.nazwisko} ${u.imie}` });
    res.json(u);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PUT /ucznowie/:id
router.put('/:id', requireKsiegowy, async (req, res) => {
  const { imie, nazwisko } = req.body;
  try {
    const stary = await db.query('SELECT imie, nazwisko FROM ucznowie WHERE id=$1', [req.params.id]);
    const staryRow = stary.rows[0];
    const result = await db.query(
      'UPDATE ucznowie SET imie=$1, nazwisko=$2 WHERE id=$3 RETURNING *',
      [imie.trim(), nazwisko.trim(), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });
    const zmiany = [];
    if (staryRow) {
      if (staryRow.imie !== imie.trim()) zmiany.push(`imię: "${staryRow.imie}" → "${imie.trim()}"`);
      if (staryRow.nazwisko !== nazwisko.trim()) zmiany.push(`nazwisko: "${staryRow.nazwisko}" → "${nazwisko.trim()}"`);
    }
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_uczen', zasob: req.originalUrl,
      szczegoly: `${result.rows[0].nazwisko} ${result.rows[0].imie}${zmiany.length ? ' | ' + zmiany.join(', ') : ''}` });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /ucznowie/:id
router.delete('/:id', requireKsiegowy, async (req, res) => {
  try {
    const du = await db.query('SELECT imie, nazwisko FROM ucznowie WHERE id=$1', [req.params.id]);
    await db.query('DELETE FROM ucznowie WHERE id=$1', [req.params.id]);
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'delete_uczen', zasob: req.originalUrl,
      szczegoly: du.rows[0] ? `${du.rows[0].nazwisko} ${du.rows[0].imie}` : '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /ucznowie/export-csv
router.get('/export-csv', requireKsiegowy, async (req, res) => {
  try {
    const result = await db.query('SELECT imie, nazwisko, aktywny FROM ucznowie ORDER BY nazwisko, imie');
    const bom = '\uFEFF';
    const header = 'Imie;Nazwisko;Aktywny\n';
    const rows = result.rows.map(r =>
      [sanitizeCsv(r.imie), sanitizeCsv(r.nazwisko), r.aktywny ? 'tak' : 'nie'].join(';')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ucznowie-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(bom + header + rows);
  } catch (err) {
    res.status(500).json({ error: 'Blad eksportu' });
  }
});

export default router;

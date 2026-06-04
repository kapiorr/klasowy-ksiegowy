import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireKsiegowy } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';

const router = Router();

// GET /skladki
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        s.*,
        COALESCE(su.liczba_uczniow, 0)                    AS liczba_uczniow,
        COALESCE(su.liczba_uczniow, 0) * s.kwota_na_osobe AS cel_lacznie,
        COALESCE(w.zebrano_lacznie, 0)                    AS zebrano_lacznie,
        COALESCE(wy.wyplacono_lacznie, 0)                 AS wyplacono_lacznie,
        COALESCE(w.zebrano_lacznie, 0) - COALESCE(wy.wyplacono_lacznie, 0) AS saldo
      FROM skladki s
      LEFT JOIN (
        SELECT skladka_id, COUNT(*) AS liczba_uczniow
        FROM skladka_ucznowie
        GROUP BY skladka_id
      ) su ON su.skladka_id = s.id
      LEFT JOIN (
        SELECT skladka_id, SUM(kwota) AS zebrano_lacznie
        FROM wplaty
        GROUP BY skladka_id
      ) w ON w.skladka_id = s.id
      LEFT JOIN (
        SELECT skladka_id, SUM(kwota) AS wyplacono_lacznie
        FROM wyplaty
        GROUP BY skladka_id
      ) wy ON wy.skladka_id = s.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /skladki/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const skladka = await db.query('SELECT * FROM skladki WHERE id=$1', [req.params.id]);
    if (!skladka.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });

    let wplatyQ;
    if (req.user.rola === 'podglad') {
      wplatyQ = await db.query(
        'SELECT * FROM wplaty_summary WHERE skladka_id=$1 AND uczen_id=$2',
        [req.params.id, req.user.uczen_id]
      );
    } else {
      wplatyQ = await db.query(
        'SELECT * FROM wplaty_summary WHERE skladka_id=$1 ORDER BY nazwisko, imie',
        [req.params.id]
      );
    }

    res.json({ ...skladka.rows[0], wplaty: wplatyQ.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /skladki — tworzy składkę i przypisuje wszystkich uczniów
router.post('/', requireKsiegowy, async (req, res) => {
  const { nazwa, kwota_na_osobe, termin, opis } = req.body;
  if (!nazwa || !kwota_na_osobe) {
    return res.status(400).json({ error: 'Nazwa i kwota są wymagane' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const s = await client.query(
      'INSERT INTO skladki (nazwa, kwota_na_osobe, termin, opis) VALUES ($1,$2,$3,$4) RETURNING *',
      [nazwa.trim(), kwota_na_osobe, termin || null, opis?.trim() || null]
    );
    // Przypisz tylko aktywnych uczniów
    const ucznowie = await client.query('SELECT id FROM ucznowie WHERE aktywny = TRUE');
    for (const u of ucznowie.rows) {
      await client.query(
        'INSERT INTO skladka_ucznowie (skladka_id, uczen_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [s.rows[0].id, u.id]
      );
    }
    await client.query('COMMIT');
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_skladka', zasob: req.originalUrl,
      szczegoly: `${s.rows[0].nazwa} | ${s.rows[0].kwota_na_osobe} zł/os${s.rows[0].termin ? ' | termin: ' + new Date(s.rows[0].termin).toLocaleDateString('pl-PL') : ''}` });
    res.status(201).json(s.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  } finally {
    client.release();
  }
});

// PUT /skladki/:id
router.put('/:id', requireKsiegowy, async (req, res) => {
  const { nazwa, kwota_na_osobe, termin, opis, status } = req.body;
  try {
    const stara = await db.query('SELECT nazwa, kwota_na_osobe, status FROM skladki WHERE id=$1', [req.params.id]);
    const stareRow = stara.rows[0];
    const result = await db.query(
      `UPDATE skladki SET nazwa=$1, kwota_na_osobe=$2, termin=$3, opis=$4, status=$5 WHERE id=$6 RETURNING *`,
      [nazwa.trim(), kwota_na_osobe, termin || null, opis?.trim() || null, status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });
    const zmiany = [];
    if (stareRow) {
      if (stareRow.nazwa !== nazwa.trim()) zmiany.push(`nazwa: "${stareRow.nazwa}" → "${nazwa.trim()}"`);
      if (parseFloat(stareRow.kwota_na_osobe) !== parseFloat(kwota_na_osobe))
        zmiany.push(`kwota: ${parseFloat(stareRow.kwota_na_osobe).toFixed(2)} → ${parseFloat(kwota_na_osobe).toFixed(2)} zł`);
    }
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_skladka', zasob: req.originalUrl,
      szczegoly: `${nazwa.trim()}${zmiany.length ? ' | ' + zmiany.join(', ') : ''}` });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /skladki/:id/status — zmień status składki
router.patch('/:id/status', requireKsiegowy, async (req, res) => {
  const { status } = req.body;
  const allowed = ['aktywna', 'zakonczona', 'wstrzymana'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Nieprawidłowy status' });
  try {
    const prev = await db.query('SELECT nazwa, status FROM skladki WHERE id=$1', [req.params.id]);
    const result = await db.query(
      'UPDATE skladki SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_skladka', zasob: req.originalUrl,
      szczegoly: `${prev.rows[0]?.nazwa} | status: ${prev.rows[0]?.status} → ${status}` });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /skladki/:id
router.delete('/:id', requireKsiegowy, async (req, res) => {
  try {
    const del = await db.query('SELECT nazwa, kwota_na_osobe FROM skladki WHERE id=$1', [req.params.id]);
    await db.query('DELETE FROM skladki WHERE id=$1', [req.params.id]);
    const ds = del.rows[0];
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'delete_skladka', zasob: req.originalUrl,
      szczegoly: ds ? `${ds.nazwa} | ${parseFloat(ds.kwota_na_osobe).toFixed(2)} zł/os` : '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /skladki/:id/uczniowie/:uczenId — usuń ucznia ze składki
router.delete('/:id/uczniowie/:uczenId', requireKsiegowy, async (req, res) => {
  try {
    const [s2, u2] = await Promise.all([
      db.query('SELECT nazwa FROM skladki WHERE id=$1', [req.params.id]),
      db.query('SELECT imie, nazwisko FROM ucznowie WHERE id=$1', [req.params.uczenId]),
    ]);
    await db.query(
      'DELETE FROM skladka_ucznowie WHERE skladka_id=$1 AND uczen_id=$2',
      [req.params.id, req.params.uczenId]
    );
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'remove_uczen_skladka', zasob: req.originalUrl,
      szczegoly: `${u2.rows[0]?.nazwisko} ${u2.rows[0]?.imie} ← ${s2.rows[0]?.nazwa}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /skladki/:id/uczniowie/:uczenId — dodaj ucznia do składki
router.post('/:id/uczniowie/:uczenId', requireKsiegowy, async (req, res) => {
  try {
    // Sprawdź czy uczeń jest aktywny
    const u = await db.query('SELECT aktywny FROM ucznowie WHERE id=$1', [req.params.uczenId]);
    if (!u.rows[0]) return res.status(404).json({ error: 'Nie znaleziono ucznia' });
    if (!u.rows[0].aktywny) return res.status(400).json({ error: 'Nie można dodać nieaktywnego ucznia do składki' });
    await db.query(
      'INSERT INTO skladka_ucznowie (skladka_id, uczen_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, req.params.uczenId]
    );
    const [sNazwa, uInfo] = await Promise.all([
      db.query('SELECT nazwa FROM skladki WHERE id=$1', [req.params.id]),
      db.query('SELECT imie, nazwisko FROM ucznowie WHERE id=$1', [req.params.uczenId]),
    ]);
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_uczen_skladka', zasob: req.originalUrl,
      szczegoly: `${uInfo.rows[0]?.nazwisko} ${uInfo.rows[0]?.imie} → ${sNazwa.rows[0]?.nazwa}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

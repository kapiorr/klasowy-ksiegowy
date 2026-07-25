import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireKsiegowy, requireKsiegowyOrPelny } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';

const router = Router();

// GET /wplaty?skladka_id=xxx  — wszystkie wpłaty dla składki
router.get('/', requireAuth, async (req, res) => {
  const { skladka_id } = req.query;
  try {
    const result = await db.query(
      `SELECT w.*, u.imie, u.nazwisko
       FROM wplaty w
       LEFT JOIN ucznowie u ON u.id = w.uczen_id
       WHERE w.skladka_id = $1
       ORDER BY w.data DESC, w.created_at DESC`,
      [skladka_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /wplaty/historia?skladka_id=xxx&uczen_id=yyy — historia wpłat konkretnego ucznia
router.get('/historia', requireKsiegowy, async (req, res) => {
  const { skladka_id, uczen_id } = req.query;
  try {
    const result = await db.query(
      `SELECT w.*, u.imie, u.nazwisko
       FROM wplaty w
       LEFT JOIN ucznowie u ON u.id = w.uczen_id
       WHERE w.skladka_id = $1 AND w.uczen_id = $2
       ORDER BY w.data DESC, w.created_at DESC`,
      [skladka_id, uczen_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /wplaty
router.post('/', requireKsiegowy, async (req, res) => {
  const { skladka_id, uczen_id, kwota, data, notatka } = req.body;
  if (!skladka_id || !kwota) {
    return res.status(400).json({ error: 'Brakuje wymaganych pól' });
  }
  try {
    // Sprawdź czy składka jest aktywna
    const s = await db.query('SELECT status FROM skladki WHERE id=$1', [skladka_id]);
    if (s.rows[0]?.status !== 'aktywna') {
      return res.status(400).json({ error: 'Nie można dodać wpłaty do nieaktywnej składki' });
    }
    const result = await db.query(
      'INSERT INTO wplaty (skladka_id, uczen_id, kwota, data, notatka) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [skladka_id, uczen_id || null, kwota, data || new Date().toISOString().split('T')[0], notatka || null]
    );
    // Pobierz nazwę ucznia dla logu
    let uczenInfo = 'wpłata ogólna';
    if (uczen_id) {
      const u = await db.query('SELECT imie, nazwisko FROM ucznowie WHERE id=$1', [uczen_id]);
      if (u.rows[0]) uczenInfo = `${u.rows[0].nazwisko} ${u.rows[0].imie}`;
    }
    const sNazwa = await db.query('SELECT nazwa FROM skladki WHERE id=$1', [skladka_id]);
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_wplata', zasob: req.originalUrl,
      szczegoly: `${uczenInfo} | ${parseFloat(kwota).toFixed(2)} zł | ${sNazwa.rows[0]?.nazwa || skladka_id}` });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PUT /wplaty/:id
router.put('/:id', requireKsiegowy, async (req, res) => {
  const { kwota, data, notatka } = req.body;
  try {
    // Pobierz stare wartości przed aktualizacją
    const stara = await db.query(
      `SELECT w.kwota, w.data, w.uczen_id, u.imie, u.nazwisko
       FROM wplaty w LEFT JOIN ucznowie u ON u.id = w.uczen_id
       WHERE w.id = $1`,
      [req.params.id]
    );
    const stareRow = stara.rows[0];

    const result = await db.query(
      'UPDATE wplaty SET kwota=$1, data=$2, notatka=$3 WHERE id=$4 RETURNING *',
      [kwota, data, notatka || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });

    const uczenInfo = stareRow?.imie
      ? `${stareRow.nazwisko} ${stareRow.imie}`
      : 'wpłata ogólna';
    const staraKwota = stareRow ? parseFloat(stareRow.kwota).toFixed(2) : '?';
    const nowaKwota = parseFloat(kwota).toFixed(2);
    const staraData = stareRow?.data ? new Date(stareRow.data).toLocaleDateString('pl-PL') : '?';
    const nowaData = data ? new Date(data).toLocaleDateString('pl-PL') : '?';

    const zmiany = [];
    if (staraKwota !== nowaKwota) zmiany.push(`kwota: ${staraKwota} → ${nowaKwota} zł`);
    if (staraData !== nowaData) zmiany.push(`data: ${staraData} → ${nowaData}`);
    if (notatka !== undefined && notatka !== (stareRow?.notatka || '')) zmiany.push('notatka zmieniona');

    try {
      await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_wplata', zasob: req.originalUrl,
        szczegoly: `${uczenInfo} | ${zmiany.length ? zmiany.join(', ') : 'bez zmian'}` });
    } catch (logErr) {
      console.error('Log error edit_wplata:', logErr.message);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('edit_wplata error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /wplaty/:id
router.delete('/:id', requireKsiegowy, async (req, res) => {
  try {
    const del = await db.query('SELECT w.kwota, w.uczen_id, u.imie, u.nazwisko FROM wplaty w LEFT JOIN ucznowie u ON u.id=w.uczen_id WHERE w.id=$1', [req.params.id]);
    await db.query('DELETE FROM wplaty WHERE id=$1', [req.params.id]);
    const dw = del.rows[0];
    const uczenInfo = dw?.imie ? `${dw.nazwisko} ${dw.imie}` : 'wpłata ogólna';
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'delete_wplata', zasob: req.originalUrl,
      szczegoly: `${uczenInfo} | ${dw ? parseFloat(dw.kwota).toFixed(2) + ' zł' : ''}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /wplaty/moje — wszystkie wpłaty zalogowanego użytkownika ze wszystkich składek
router.get('/moje', requireAuth, async (req, res) => {
  try {
    const uczen_id = req.user.uczen_id;
    if (!uczen_id) return res.json([]);
    const result = await db.query(`
      SELECT
        w.id, w.kwota, w.data, w.created_at,
        s.nazwa AS skladka_nazwa, s.status AS skladka_status
      FROM wplaty w
      JOIN skladki s ON s.id = w.skladka_id
      WHERE w.uczen_id = $1
      ORDER BY w.data DESC, w.created_at DESC
    `, [uczen_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /wplaty/uczen/:id — wszystkie wpłaty ucznia ze wszystkich składek (admin/ksiegowy/podglad_pelny)
router.get('/uczen/:id', requireKsiegowyOrPelny, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        w.id, w.kwota, w.data, w.created_at,
        s.nazwa AS skladka_nazwa, s.status AS skladka_status
      FROM wplaty w
      JOIN skladki s ON s.id = w.skladka_id
      WHERE w.uczen_id = $1
      ORDER BY w.data DESC, w.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

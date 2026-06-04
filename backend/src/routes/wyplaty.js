import { Router } from 'express';
import { validateFile } from '../filecheck.js';
import db from '../db.js';
import { requireAuth, requireKsiegowy } from '../middleware/auth.js';

const router = Router();

// GET /wyplaty?skladka_id=xxx
router.get('/', requireAuth, async (req, res) => {
  const { skladka_id } = req.query;
  try {
    const result = await db.query(
      `SELECT id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, created_at
       FROM wyplaty WHERE skladka_id=$1 ORDER BY data DESC, created_at DESC`,
      [skladka_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /wyplaty
router.post('/', requireKsiegowy, async (req, res) => {
  const { skladka_id, kwota, opis, data, zalacznik } = req.body;
  if (!skladka_id || !kwota || !opis) {
    return res.status(400).json({ error: 'Brakuje wymaganych pól' });
  }
  try {
    // Sprawdź czy składka jest aktywna
    const s = await db.query('SELECT status FROM skladki WHERE id=$1', [skladka_id]);
    if (s.rows[0]?.status !== 'aktywna') {
      return res.status(400).json({ error: 'Nie można dodać wypłaty do nieaktywnej składki' });
    }
    let zNazwa = null, zDane = null, zTyp = null;
    if (zalacznik) {
      const check = validateFile(zalacznik.dane, zalacznik.typ, zalacznik.nazwa);
      if (!check.ok) return res.status(400).json({ error: check.error });
      zNazwa = zalacznik.nazwa;
      zTyp = check.detectedMime || zalacznik.typ;
      zDane = Buffer.from(zalacznik.dane, 'base64');
    }

    const result = await db.query(
      `INSERT INTO wyplaty (skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_dane, zalacznik_typ)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, created_at`,
      [skladka_id, kwota, opis.trim(), data || new Date().toISOString().split('T')[0], zNazwa, zDane, zTyp]
    );
    const sNazwa = await db.query('SELECT nazwa FROM skladki WHERE id=$1', [skladka_id]);
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_wyplata', zasob: req.originalUrl,
      szczegoly: `${opis} | ${parseFloat(kwota).toFixed(2)} zł | ${s.rows[0]?.nazwa || ''}${zNazwa ? ' | 📎 ' + zNazwa : ''}` });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /wyplaty/:id/zalacznik
router.get('/:id/zalacznik', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT zalacznik_nazwa, zalacznik_dane, zalacznik_typ FROM wyplaty WHERE id=$1',
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row || !row.zalacznik_dane) return res.status(404).json({ error: 'Brak załącznika' });
    res.setHeader('Content-Type', row.zalacznik_typ || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${row.zalacznik_nazwa}"`);
    res.send(row.zalacznik_dane);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PUT /wyplaty/:id — edycja wypłaty
router.put('/:id', requireKsiegowy, async (req, res) => {
  const { kwota, opis, data, zalacznik, usun_zalacznik } = req.body;
  if (!kwota || !opis) return res.status(400).json({ error: 'Brakuje wymaganych pól' });
  try {
    let zNazwa = null, zDane = null, zTyp = null;

    if (usun_zalacznik) {
      // Usuń załącznik
      zNazwa = null; zDane = null; zTyp = null;
    } else if (zalacznik) {
      // Nowy załącznik
      const check = validateFile(zalacznik.dane, zalacznik.typ, zalacznik.nazwa);
      if (!check.ok) return res.status(400).json({ error: check.error });
      zNazwa = zalacznik.nazwa;
      zTyp = check.detectedMime || zalacznik.typ;
      zDane = Buffer.from(zalacznik.dane, 'base64');
    } else {
      // Zostaw istniejący załącznik
      const existing = await db.query('SELECT zalacznik_nazwa, zalacznik_dane, zalacznik_typ FROM wyplaty WHERE id=$1', [req.params.id]);
      if (existing.rows[0]) {
        zNazwa = existing.rows[0].zalacznik_nazwa;
        zDane = existing.rows[0].zalacznik_dane;
        zTyp = existing.rows[0].zalacznik_typ;
      }
    }

    // Pobierz stare wartości przed aktualizacją
    const stara = await db.query('SELECT kwota, opis, data FROM wyplaty WHERE id=$1', [req.params.id]);
    const stareRow = stara.rows[0];

    const result = await db.query(
      `UPDATE wyplaty SET kwota=$1, opis=$2, data=$3, zalacznik_nazwa=$4, zalacznik_dane=$5, zalacznik_typ=$6
       WHERE id=$7
       RETURNING id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, created_at`,
      [kwota, opis.trim(), data, zNazwa, zDane, zTyp, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });

    const zmiany = [];
    if (stareRow) {
      if (parseFloat(stareRow.kwota).toFixed(2) !== parseFloat(kwota).toFixed(2))
        zmiany.push(`kwota: ${parseFloat(stareRow.kwota).toFixed(2)} → ${parseFloat(kwota).toFixed(2)} zł`);
      if (stareRow.opis !== opis.trim())
        zmiany.push(`opis: "${stareRow.opis}" → "${opis.trim()}"`);
      const staraData = stareRow.data ? new Date(stareRow.data).toLocaleDateString('pl-PL') : '?';
      const nowaData = data ? new Date(data).toLocaleDateString('pl-PL') : '?';
      if (staraData !== nowaData) zmiany.push(`data: ${staraData} → ${nowaData}`);
      if (usun_zalacznik) zmiany.push('załącznik usunięty');
      else if (zalacznik) zmiany.push(`załącznik: ${zalacznik.nazwa}`);
    }
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_wyplata', zasob: req.originalUrl,
      szczegoly: `${opis.trim()} | ${zmiany.length ? zmiany.join(', ') : 'bez zmian'}` });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /wyplaty/:id
router.delete('/:id', requireKsiegowy, async (req, res) => {
  try {
    const delW = await db.query('SELECT opis, kwota FROM wyplaty WHERE id=$1', [req.params.id]);
    await db.query('DELETE FROM wyplaty WHERE id=$1', [req.params.id]);
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'delete_wyplata', zasob: req.originalUrl,
      szczegoly: delW.rows[0] ? `${delW.rows[0].opis} | ${parseFloat(delW.rows[0].kwota).toFixed(2)} zł` : '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

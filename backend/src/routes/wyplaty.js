import { Router } from 'express';
import { validateBody } from '../validate.js';
import sharp from 'sharp';
import { validateFile } from '../filecheck.js';
import db from '../db.js';
import { requireAuth, requireKsiegowy, requireKsiegowyOrPelny } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';

const router = Router();

async function kompresujObrazek(dane, typ) {
  if (!typ.startsWith('image/')) return { dane, typ }; // PDF — bez zmian
  try {
    const compressed = await sharp(dane)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    console.log(`sharp: ${dane.length} → ${compressed.length} bytes`);
    return { dane: compressed, typ: 'image/webp' };
  } catch (err) {
    console.error('sharp error:', err.message);
    return { dane, typ }; // błąd — zapisz oryginał
  }
}

// GET /wyplaty?skladka_id=xxx
router.get('/', requireAuth, async (req, res) => {
  const { skladka_id } = req.query;
  try {
    const result = await db.query(
      `SELECT w.id, w.skladka_id, w.kwota, w.opis, w.data, w.created_at,
              COALESCE(
                (SELECT json_agg(json_build_object('id', z.id, 'nazwa', z.nazwa, 'typ', z.typ, 'rozmiar', octet_length(z.dane)))
                 FROM wyplaty_zalaczniki z WHERE z.wyplata_id = w.id),
                '[]'::json
              ) AS zalaczniki
       FROM wyplaty w
       WHERE w.skladka_id=$1
       ORDER BY w.data DESC, w.created_at DESC`,
      [skladka_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /wyplaty/moje — wszystkie wpłaty zalogowanego użytkownika ze wszystkich składek
router.get('/moje', requireAuth, async (req, res) => {
  try {
    const uczen_id = req.user.uczen_id;
    if (!uczen_id) return res.json([]);
    const result = await db.query(`
      SELECT w.id, w.kwota, w.data, w.created_at,
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

// GET /wyplaty/uczen/:id — wszystkie wpłaty ucznia ze wszystkich składek
router.get('/uczen/:id', requireKsiegowyOrPelny, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT w.id, w.kwota, w.data, w.created_at,
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

// POST /wyplaty
router.post('/', requireKsiegowy, validateBody({
  skladka_id: { type: 'string', required: true },
  kwota: { type: 'number', required: true, min: 0.01, max: 99999 },
  opis: { type: 'string', required: true, max: 500 },
}), async (req, res) => {
  const { skladka_id, kwota, opis, data, zalaczniki = [] } = req.body;
  if (!skladka_id || !kwota || !opis) {
    return res.status(400).json({ error: 'Brakuje wymaganych pól' });
  }
  try {
    const s = await db.query('SELECT status FROM skladki WHERE id=$1', [skladka_id]);
    if (s.rows[0]?.status !== 'aktywna') {
      return res.status(400).json({ error: 'Nie można dodać wypłaty do nieaktywnej składki' });
    }

    const result = await db.query(
      `INSERT INTO wyplaty (skladka_id, kwota, opis, data)
       VALUES ($1,$2,$3,$4)
       RETURNING id, skladka_id, kwota, opis, data, created_at`,
      [skladka_id, kwota, opis.trim(), data || new Date().toISOString().split('T')[0]]
    );
    const wyplata = result.rows[0];

    // Waliduj wszystkie załączniki przed zapisem
    const odrzucone = zalaczniki.filter(z => !validateFile(z.dane, z.typ, z.nazwa).ok).map(z => z.nazwa);
    if (odrzucone.length > 0) {
      return res.status(400).json({ error: `Niedozwolone typy plików: ${odrzucone.join(', ')}` });
    }
    // Zapisz załączniki
    const nazwyZalacznikow = [];
    for (const z of zalaczniki) {
      const check = validateFile(z.dane, z.typ, z.nazwa);
      if (!check.ok) continue;
      const mime = check.detectedMime || z.typ;
      const { dane, typ: finalTyp } = await kompresujObrazek(Buffer.from(z.dane, 'base64'), mime);
      await db.query(
        'INSERT INTO wyplaty_zalaczniki (wyplata_id, nazwa, typ, dane) VALUES ($1,$2,$3,$4)',
        [wyplata.id, z.nazwa, finalTyp, dane]
      );
      nazwyZalacznikow.push(z.nazwa);
    }

    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_wyplata', zasob: req.originalUrl,
      szczegoly: `${opis} | ${parseFloat(kwota).toFixed(2)} zł${nazwyZalacznikow.length ? ' | 📎 ' + nazwyZalacznikow.join(', ') : ''}` });
    res.status(201).json({ ...wyplata, zalaczniki: nazwyZalacznikow.map((n, i) => ({ nazwa: n })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /wyplaty/:id/zalacznik/:zid
router.get('/:id/zalacznik/:zid', requireAuth, async (req, res) => {
  try {
    const { rola, id: userId, uczen_id } = req.user;
    const isKsiegowy = ['admin', 'ksiegowy'].includes(rola);

    let result;
    if (isKsiegowy) {
      // Admin/Ksiegowy — dostęp do wszystkich załączników
      result = await db.query(
        'SELECT z.nazwa, z.dane, z.typ FROM wyplaty_zalaczniki z WHERE z.id=$1 AND z.wyplata_id=$2',
        [req.params.zid, req.params.id]
      );
    } else {
      // Podglad/PodgladPelny — tylko składki do których przypisany uczeń należy
      if (!uczen_id) return res.status(403).json({ error: 'Brak uprawnień' });
      result = await db.query(
        `SELECT z.nazwa, z.dane, z.typ
         FROM wyplaty_zalaczniki z
         JOIN wyplaty w ON w.id = z.wyplata_id
         JOIN skladka_ucznowie su ON su.skladka_id = w.skladka_id AND su.uczen_id = $3
         WHERE z.id=$1 AND z.wyplata_id=$2`,
        [req.params.zid, req.params.id, uczen_id]
      );
    }

    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Brak załącznika' });
    res.setHeader('Content-Type', row.typ || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${row.nazwa}"`);
    res.send(row.dane);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /wyplaty/:id/zalacznik/:zid
router.delete('/:id/zalacznik/:zid', requireKsiegowy, async (req, res) => {
  try {
    await db.query('DELETE FROM wyplaty_zalaczniki WHERE id=$1 AND wyplata_id=$2',
      [req.params.zid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PUT /wyplaty/:id — edycja wypłaty
router.put('/:id', requireKsiegowy, async (req, res) => {
  const { kwota, opis, data, zalaczniki = [] } = req.body;
  if (!kwota || !opis) return res.status(400).json({ error: 'Brakuje wymaganych pól' });
  try {
    const stara = await db.query('SELECT kwota, opis, data FROM wyplaty WHERE id=$1', [req.params.id]);
    const stareRow = stara.rows[0];

    const result = await db.query(
      `UPDATE wyplaty SET kwota=$1, opis=$2, data=$3
       WHERE id=$4
       RETURNING id, skladka_id, kwota, opis, data, created_at`,
      [kwota, opis.trim(), data, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });

    // Waliduj nowe załączniki przed zapisem
    const odrzuconeEdit = zalaczniki.filter(z => !validateFile(z.dane, z.typ, z.nazwa).ok).map(z => z.nazwa);
    if (odrzuconeEdit.length > 0) {
      return res.status(400).json({ error: `Niedozwolone typy plików: ${odrzuconeEdit.join(', ')}` });
    }
    // Zapisz nowe załączniki
    const nazwyNowych = [];
    for (const z of zalaczniki) {
      const check = validateFile(z.dane, z.typ, z.nazwa);
      if (!check.ok) continue;
      const mime = check.detectedMime || z.typ;
      const { dane, typ: finalTyp } = await kompresujObrazek(Buffer.from(z.dane, 'base64'), mime);
      await db.query(
        'INSERT INTO wyplaty_zalaczniki (wyplata_id, nazwa, typ, dane) VALUES ($1,$2,$3,$4)',
        [req.params.id, z.nazwa, finalTyp, dane]
      );
      nazwyNowych.push(z.nazwa);
    }

    const zmiany = [];
    if (stareRow) {
      if (parseFloat(stareRow.kwota).toFixed(2) !== parseFloat(kwota).toFixed(2))
        zmiany.push(`kwota: ${parseFloat(stareRow.kwota).toFixed(2)} → ${parseFloat(kwota).toFixed(2)} zł`);
      if (stareRow.opis !== opis.trim())
        zmiany.push(`opis: "${stareRow.opis}" → "${opis.trim()}"`);
      const staraData = stareRow.data ? new Date(stareRow.data).toLocaleDateString('pl-PL') : '?';
      const nowaData = data ? new Date(data).toLocaleDateString('pl-PL') : '?';
      if (staraData !== nowaData) zmiany.push(`data: ${staraData} → ${nowaData}`);
      if (nazwyNowych.length) zmiany.push(`dodano pliki: ${nazwyNowych.join(', ')}`);
    }
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_wyplata', zasob: req.originalUrl,
      szczegoly: `${opis.trim()} | ${zmiany.length ? zmiany.join(', ') : 'bez zmian'}` });

    // Pobierz aktualne załączniki
    const zals = await db.query('SELECT id, nazwa, typ, octet_length(dane) AS rozmiar FROM wyplaty_zalaczniki WHERE wyplata_id=$1', [req.params.id]);
    res.json({ ...result.rows[0], zalaczniki: zals.rows });
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

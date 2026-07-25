import { Router } from 'express';
import db from '../db.js';
import { requireKsiegowy } from '../middleware/auth.js';
import { sendNowaSkladka, sendZaleglosci } from '../mailer.js';
import { log, getIP } from '../logger.js';

const router = Router();

// GET /mailing/skladka/:id/podglad — podgląd odbiorców
router.get('/skladka/:id/podglad', requireKsiegowy, async (req, res) => {
  try {
    const skladkaRes = await db.query('SELECT nazwa FROM skladki WHERE id=$1', [req.params.id]);
    const s = skladkaRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Nie znaleziono' });

    const result = await db.query(`
      SELECT
        u.imie AS uczen_imie, u.nazwisko AS uczen_nazwisko,
        uz.email, uz.login,
        s.kwota_na_osobe,
        COALESCE(SUM(w.kwota), 0) AS zaplacono
      FROM skladka_ucznowie su
      JOIN ucznowie u ON u.id = su.uczen_id
      JOIN uzytkownicy uz ON uz.uczen_id = u.id
      JOIN skladki s ON s.id = su.skladka_id
      LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = su.uczen_id
      WHERE su.skladka_id = $1
        AND uz.email IS NOT NULL
        AND uz.rola IN ('podglad', 'podglad_pelny', 'ksiegowy')
      GROUP BY u.imie, u.nazwisko, uz.email, uz.login, s.kwota_na_osobe
    `, [req.params.id]);

    const odbiorcy = result.rows
      .map(r => ({
        email: r.email,
        uczen: `${r.uczen_imie} ${r.uczen_nazwisko}`,
        pozostalo: parseFloat(r.kwota_na_osobe) - parseFloat(r.zaplacono),
      }))
      .filter(r => r.pozostalo > 0);

    res.json({ skladka: s.nazwa, odbiorcy });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /mailing/skladka/:id — wyślij powiadomienie o składce
router.post('/skladka/:id', requireKsiegowy, async (req, res) => {
  try {
    const skladkaRes = await db.query('SELECT * FROM skladki WHERE id=$1', [req.params.id]);
    const s = skladkaRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Nie znaleziono składki' });

    // Pobierz uczniów przypisanych do składki z emailami ich opiekunów
    const result = await db.query(`
      SELECT
        u.imie AS uczen_imie, u.nazwisko AS uczen_nazwisko,
        uz.email, uz.login,
        COALESCE(SUM(w.kwota), 0) AS zaplacono
      FROM skladka_ucznowie su
      JOIN ucznowie u ON u.id = su.uczen_id
      JOIN uzytkownicy uz ON uz.uczen_id = u.id
      LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = su.uczen_id
      WHERE su.skladka_id = $1
        AND uz.email IS NOT NULL
        AND uz.rola IN ('podglad', 'podglad_pelny', 'ksiegowy')
      GROUP BY u.imie, u.nazwisko, uz.email, uz.login
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.json({ ok: true, wyslano: 0, info: 'Brak użytkowników z emailem przypisanych do tej składki' });
    }

    let wyslano = 0;
    const bledy = [];
    for (const r of result.rows) {
      const pozostalo = parseFloat(s.kwota_na_osobe) - parseFloat(r.zaplacono);
      if (pozostalo <= 0) continue; // już zapłacił
      try {
        await sendNowaSkladka(
          r.email,
          `${r.uczen_imie} ${r.uczen_nazwisko}`,
          s.nazwa,
          pozostalo,
          s.termin,
          s.opis
        );
        wyslano++;
      } catch (e) {
        bledy.push(`${r.email}: ${e.message}`);
      }
    }

    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'mailing_skladka',
      szczegoly: `${s.nazwa} | wysłano: ${wyslano}` });

    res.json({ ok: true, wyslano, bledy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /mailing/zaleglosci/podglad — lista użytkowników z zaległościami
router.get('/zaleglosci/podglad', requireKsiegowy, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        uz.id, uz.login, uz.email,
        u.imie AS uczen_imie, u.nazwisko AS uczen_nazwisko,
        COUNT(DISTINCT su.skladka_id) FILTER (
          WHERE COALESCE(wp.zaplacono, 0) < s.kwota_na_osobe
            AND s.status = 'aktywna'
        ) AS liczba_zaleglosci,
        SUM(s.kwota_na_osobe - COALESCE(wp.zaplacono, 0)) FILTER (
          WHERE COALESCE(wp.zaplacono, 0) < s.kwota_na_osobe
            AND s.status = 'aktywna'
        ) AS suma_zaleglosci
      FROM uzytkownicy uz
      JOIN ucznowie u ON u.id = uz.uczen_id
      JOIN skladka_ucznowie su ON su.uczen_id = uz.uczen_id
      JOIN skladki s ON s.id = su.skladka_id
      LEFT JOIN (
        SELECT uczen_id, skladka_id, SUM(kwota) AS zaplacono
        FROM wplaty GROUP BY uczen_id, skladka_id
      ) wp ON wp.uczen_id = su.uczen_id AND wp.skladka_id = su.skladka_id
      WHERE uz.rola IN ('podglad', 'podglad_pelny', 'ksiegowy')
        AND uz.email IS NOT NULL
        AND s.status = 'aktywna'
      GROUP BY uz.id, uz.login, uz.email, u.imie, u.nazwisko
      HAVING SUM(s.kwota_na_osobe - COALESCE(wp.zaplacono, 0)) FILTER (
        WHERE COALESCE(wp.zaplacono, 0) < s.kwota_na_osobe AND s.status = 'aktywna'
      ) > 0
      ORDER BY u.nazwisko, u.imie
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /mailing/zaleglosci — wyślij przypomnienia o zaległościach
router.post('/zaleglosci', requireKsiegowy, async (req, res) => {
  const { uzytkownik_ids } = req.body; // null = wszyscy, array = wybrani
  try {
    // Pobierz szczegółowe zaległości per użytkownik
    const query = `
      SELECT
        uz.id, uz.email, uz.login,
        u.imie AS uczen_imie, u.nazwisko AS uczen_nazwisko,
        s.nazwa AS skladka_nazwa,
        s.kwota_na_osobe - COALESCE(wp.zaplacono, 0) AS pozostalo
      FROM uzytkownicy uz
      JOIN ucznowie u ON u.id = uz.uczen_id
      JOIN skladka_ucznowie su ON su.uczen_id = uz.uczen_id
      JOIN skladki s ON s.id = su.skladka_id
      LEFT JOIN (
        SELECT uczen_id, skladka_id, SUM(kwota) AS zaplacono
        FROM wplaty GROUP BY uczen_id, skladka_id
      ) wp ON wp.uczen_id = su.uczen_id AND wp.skladka_id = su.skladka_id
      WHERE uz.rola IN ('podglad', 'podglad_pelny', 'ksiegowy')
        AND uz.email IS NOT NULL
        AND s.status = 'aktywna'
        AND s.kwota_na_osobe - COALESCE(wp.zaplacono, 0) > 0
        ${uzytkownik_ids?.length ? `AND uz.id = ANY($1::uuid[])` : ''}
      ORDER BY uz.id, s.nazwa
    `;
    const params = uzytkownik_ids?.length ? [uzytkownik_ids] : [];
    const rows = (await db.query(query, params)).rows;

    // Grupuj po użytkowniku
    const perUser = {};
    for (const r of rows) {
      if (!perUser[r.id]) {
        perUser[r.id] = {
          email: r.email,
          uczenImie: `${r.uczen_imie} ${r.uczen_nazwisko}`,
          zaleglosci: [],
        };
      }
      perUser[r.id].zaleglosci.push({ nazwa: r.skladka_nazwa, pozostalo: parseFloat(r.pozostalo) });
    }

    let wyslano = 0;
    const bledy = [];
    for (const u of Object.values(perUser)) {
      try {
        await sendZaleglosci(u.email, u.uczenImie, u.zaleglosci);
        wyslano++;
      } catch (e) {
        bledy.push(`${u.email}: ${e.message}`);
      }
    }

    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'mailing_zaleglosci',
      szczegoly: `wysłano: ${wyslano}${uzytkownik_ids?.length ? ` (wybranych: ${uzytkownik_ids.length})` : ' (wszyscy)'}` });

    res.json({ ok: true, wyslano, bledy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

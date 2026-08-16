import { Router } from 'express';
import db from '../db.js';
import { requireKsiegowy } from '../middleware/auth.js';
import { mailingLimiter } from '../limiters.js';
import { sendNowaSkladka, sendZaleglosci, sendAdminAlert } from '../mailer.js';
import { log, getIP } from '../logger.js';
import { sendPushToUsers } from '../pushSender.js';
import { sendSMSToUsers, sendSMSForced, smsApiEnabled } from '../smsSender.js';

const router = Router();

// GET /mailing/config — czy SMS jest dostępny
router.get('/config', requireKsiegowy, (req, res) => {
  res.json({ sms_enabled: smsApiEnabled() });
});

// GET /mailing/skladka/:id/podglad — podgląd odbiorców
router.get('/skladka/:id/podglad', requireKsiegowy, async (req, res) => {
  try {
    const skladkaRes = await db.query('SELECT nazwa FROM skladki WHERE id=$1', [req.params.id]);
    const s = skladkaRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Nie znaleziono' });

    const result = await db.query(`
      SELECT
        u.imie AS uczen_imie, u.nazwisko AS uczen_nazwisko,
        uz.id AS uzytkownik_id, uz.email, uz.telefon, uz.login, uz.sms_powiadomienia,
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
      GROUP BY u.imie, u.nazwisko, uz.id, uz.email, uz.telefon, uz.login, uz.sms_powiadomienia, s.kwota_na_osobe
    `, [req.params.id]);

    const odbiorcy = result.rows
      .map(r => ({
        uzytkownik_id: r.uzytkownik_id,
        email: r.email,
        telefon: r.telefon,
        sms_powiadomienia: r.sms_powiadomienia,
        uczen: `${r.uczen_imie} ${r.uczen_nazwisko}`,
        pozostalo: parseFloat(r.kwota_na_osobe) - parseFloat(r.zaplacono),
      }))
      .filter(r => r.pozostalo > 0);

    res.json({ skladka: s.nazwa, odbiorcy });
  } catch (err) {
    console.error('mailing/podglad error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /mailing/skladka/:id — wyślij powiadomienie o składce
router.post('/skladka/:id', requireKsiegowy, mailingLimiter, async (req, res) => {
  const { kanaly = ['email'], email_ids, sms_ids } = req.body;
  try {
    const skladkaRes = await db.query('SELECT * FROM skladki WHERE id=$1', [req.params.id]);
    const s = skladkaRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Nie znaleziono składki' });

    // Pobierz uczniów przypisanych do składki z emailami ich opiekunów
    const result = await db.query(`
      SELECT
        u.imie AS uczen_imie, u.nazwisko AS uczen_nazwisko,
        uz.id AS uzytkownik_id, uz.email, uz.login, uz.telefon, uz.sms_powiadomienia,
        COALESCE(SUM(w.kwota), 0) AS zaplacono
      FROM skladka_ucznowie su
      JOIN ucznowie u ON u.id = su.uczen_id
      JOIN uzytkownicy uz ON uz.uczen_id = u.id
      LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = su.uczen_id
      WHERE su.skladka_id = $1
        AND uz.email IS NOT NULL
        AND uz.rola IN ('podglad', 'podglad_pelny', 'ksiegowy')
      GROUP BY u.imie, u.nazwisko, uz.id, uz.email, uz.login, uz.telefon, uz.sms_powiadomienia
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.json({ ok: true, wyslano: 0, info: 'Brak użytkowników z emailem przypisanych do tej składki' });
    }

    let wyslano = 0, wyslano_sms = 0;
    const bledy = [];
    for (const r of result.rows) {
      const pozostalo = parseFloat(s.kwota_na_osobe) - parseFloat(r.zaplacono);
      if (pozostalo <= 0) continue; // już zapłacił
      try {
        const wyslijEmail = email_ids ? email_ids.includes(r.uzytkownik_id) : kanaly.includes('email');
        const wyslijSms = sms_ids ? sms_ids.includes(r.uzytkownik_id) : kanaly.includes('sms');
        if (wyslijEmail && r.email) {
          await sendNowaSkladka(
          r.email,
          `${r.uczen_imie} ${r.uczen_nazwisko}`,
          s.nazwa,
          pozostalo,
          s.termin,
          s.opis
          );
          wyslano++;
        }
        if (wyslijSms && r.telefon) {
          const tresc = `Nowa skladka: ${s.nazwa}. Do zaplaty: ${parseFloat(pozostalo).toFixed(2)} zl.`;
          try { await sendSMSForced(r.telefon, tresc); wyslano_sms++; }
          catch (e) { bledy.push(`SMS ${r.telefon}: ${e.message}`); }
        }
      } catch (e) {
        bledy.push(`${r.email || r.login}: ${e.message}`);
      }
    }

    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'mailing_skladka',
      szczegoly: `${s.nazwa} | wysłano: ${wyslano}` });

    // Wyślij push do subskrybentów
    const uzIds = result.rows.filter(r => parseFloat(r.kwota_na_osobe) - parseFloat(r.zaplacono) > 0).map(r => r.uzytkownik_id);
    const pushResult = await sendPushToUsers(uzIds, `Nowa składka: ${s.nazwa}`, `Do zapłacenia: ${parseFloat(s.kwota_na_osobe).toFixed(2)} zł`, '/').catch(() => ({ wyslano: 0 }));

    // Alert admina przy dużej wysyłce (>10 odbiorców)
    if (wyslano + wyslano_sms > 10) {
      sendAdminAlert(req.user?.login || 'system', getIP(req), [{
        typ: 'masowy_mailing',
        wartosc: `Składka: ${s.nazwa} | Email: ${wyslano}, SMS: ${wyslano_sms}`,
      }], 'masowy_mailing').catch(() => {});
    }
    // Alert admina przy dużej wysyłce (>10 odbiorców)
    if (wyslano + wyslano_sms > 10) {
      sendAdminAlert(req.user?.login || 'system', getIP(req), [{
        typ: 'masowy_mailing',
        wartosc: `Zaległości | Email: ${wyslano}, SMS: ${wyslano_sms}`,
      }], 'masowy_mailing').catch(() => {});
    }
    res.json({ ok: true, wyslano, wyslano_sms, wyslano_push: pushResult.wyslano, bledy });
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
        uz.id, uz.login, uz.email, uz.telefon, uz.sms_powiadomienia,
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
      GROUP BY uz.id, uz.login, uz.email, uz.telefon, uz.sms_powiadomienia, u.imie, u.nazwisko
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
router.post('/zaleglosci', requireKsiegowy, mailingLimiter, async (req, res) => {
  const { uzytkownik_ids, kanaly = ['email'], email_ids, sms_ids } = req.body;
  try {
    // Pobierz szczegółowe zaległości per użytkownik
    const query = `
      SELECT
        uz.id, uz.email, uz.login, uz.telefon, uz.sms_powiadomienia,
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
          telefon: r.telefon,
          sms_powiadomienia: r.sms_powiadomienia,
          uczenImie: `${r.uczen_imie} ${r.uczen_nazwisko}`,
          zaleglosci: [],
        };
      }
      perUser[r.id].zaleglosci.push({ nazwa: r.skladka_nazwa, pozostalo: parseFloat(r.pozostalo) });
    }

    let wyslano = 0, wyslano_sms = 0;
    const bledy = [];
    for (const [uid, u] of Object.entries(perUser)) {
      try {
        const wyslijEmail = email_ids ? email_ids.includes(uid) : kanaly.includes('email');
        const wyslijSms = sms_ids ? sms_ids.includes(uid) : kanaly.includes('sms');
        if (wyslijEmail && u.email) {
          await sendZaleglosci(u.email, u.uczenImie, u.zaleglosci);
          wyslano++;
        }
        if (wyslijSms && u.telefon) {
          const suma = u.zaleglosci.reduce((s, z) => s + z.pozostalo, 0);
          const tresc = `Przypomnienie: zaleglosci ${u.uczenImie}: ${suma.toFixed(2)} zl. Sprawdz aplikacje Klasowy Ksiegowy.`;
          try { await sendSMSForced(u.telefon, tresc); wyslano_sms++; }
          catch (e) { bledy.push(`SMS ${u.telefon}: ${e.message}`); }
        }
      } catch (e) {
        bledy.push(`${u.email || uid}: ${e.message}`);
      }
    }

    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'mailing_zaleglosci',
      szczegoly: `wysłano: ${wyslano}${uzytkownik_ids?.length ? ` (wybranych: ${uzytkownik_ids.length})` : ' (wszyscy)'}` });

    // Wyślij push
    const uzIds = Object.keys(perUser);
    const pushResult = await sendPushToUsers(uzIds, 'Przypomnienie o zaległościach', 'Sprawdź swoje zaległości w Klasowy Księgowy', '/').catch(() => ({ wyslano: 0 }));

    // Alert admina przy dużej wysyłce (>10 odbiorców)
    if (wyslano + wyslano_sms > 10) {
      sendAdminAlert(req.user?.login || 'system', getIP(req), [{
        typ: 'masowy_mailing',
        wartosc: `Zaległości | Email: ${wyslano}, SMS: ${wyslano_sms}`,
      }], 'masowy_mailing').catch(() => {});
    }
    res.json({ ok: true, wyslano, wyslano_sms, wyslano_push: pushResult.wyslano, bledy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

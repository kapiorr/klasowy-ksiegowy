import { Router } from 'express';
import db from '../db.js';
import { hashHaslo } from '../crypto.js';
import { walidujHasloHIBP } from '../hibp.js';
import { requireAuth, requireKsiegowy, requireAdmin } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';
import { sendWelcome } from '../mailer.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = Router();

function sanitizeCsv(val) {
  const s = String(val ?? '');
  // Neutralizuj wiodące znaki formuł Excela
  if (s && ['=', '+', '-', '@', '\t', '\r'].includes(s[0])) {
    return "'" + s;
  }
  return s;
}


function formatTelefon(tel) {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (!digits) return null;
  // Format: xxx xxx xxx (9 cyfr)
  const fmt = digits.slice(0, 9).replace(/(\d{3})(\d{3})(\d{0,3})/, '$1 $2 $3').trim();
  return fmt;
}

function walidujEmail(email) {
  if (!email) return null;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) ? null : 'Nieprawidłowy format adresu email';
}

function walidujTelefon(tel) {
  if (!tel) return null;
  // Dozwolone: cyfry, spacje, +, -, (, )
  const re = /^[0-9\s\+\-\(\)]{7,20}$/;
  return re.test(tel) ? null : 'Nieprawidłowy format numeru telefonu (cyfry, spacje, +, -, nawiasy)';
}

// GET /uzytkownicy
router.get('/', requireKsiegowy, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.login, u.imie, u.nazwisko, u.rola, u.uczen_id, u.email, u.telefon,
              u.mfa_enabled, u.mfa_wymuszone, u.force_password_change, u.sms_powiadomienia, u.pomijaj_hibp,
              uc.imie AS uczen_imie, uc.nazwisko AS uczen_nazwisko
       FROM uzytkownicy u
       LEFT JOIN ucznowie uc ON uc.id = u.uczen_id
       ORDER BY u.created_at`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /uzytkownicy
router.post('/', async (req, res) => {
  const { login, haslo, rola, uczen_id, email, imie, nazwisko } = req.body;
  if (!login || !haslo || !rola) return res.status(400).json({ error: 'Brakuje danych' });
  const DOZWOLONE_ROLE = ['admin', 'ksiegowy', 'podglad_pelny', 'podglad'];
  if (!DOZWOLONE_ROLE.includes(rola)) return res.status(400).json({ error: `Niedozwolona rola: "${rola}". Dozwolone: ${DOZWOLONE_ROLE.join(', ')}` });

  try {
    const count = await db.query('SELECT COUNT(*) FROM uzytkownicy');
    if (parseInt(count.rows[0].count) > 0) {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Wymagana autoryzacja' });
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (decoded.rola !== 'admin') return res.status(403).json({ error: 'Brak uprawnień — wymagana rola admin' });
    }

    const haslo_hash = await hashHaslo(haslo);
    const pomijajHIBP = !!req.body.pomijaj_hibp;
    const hibpErr = await walidujHasloHIBP(haslo, pomijajHIBP);
    if (hibpErr) return res.status(400).json({ error: hibpErr });

    // Walidacja formatu email i telefonu
    const emailErr = walidujEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
    const telefonErr = walidujTelefon(req.body.telefon);
    if (telefonErr) return res.status(400).json({ error: telefonErr });

    // Sprawdź unikalność loginu i emaila
    const conflict = await db.query(
      `SELECT login, email FROM uzytkownicy WHERE login=$1 OR (email=$2 AND email IS NOT NULL AND $2 != '')`,
      [login, email || '']
    );
    if (conflict.rows.length > 0) {
      const row = conflict.rows[0];
      if (row.login === login) return res.status(409).json({ error: 'Login już zajęty' });
      if (email && row.email === email) return res.status(409).json({ error: 'Email już zajęty' });
    }

    const result = await db.query(
      `INSERT INTO uzytkownicy (login, haslo_hash, rola, uczen_id, email, imie, nazwisko, telefon, sms_powiadomienia, pomijaj_hibp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, login, rola, uczen_id, email, imie, nazwisko, telefon, sms_powiadomienia, pomijaj_hibp`,
      [login, haslo_hash, rola, uczen_id || null, email || null, imie || null, nazwisko || null, formatTelefon(req.body.telefon), req.body.sms_powiadomienia || false, pomijajHIBP]
    );
    await log({ uzytkownik_id: req.user?.id, ip: getIP(req), akcja: 'add_uzytkownik', zasob: req.originalUrl,
      szczegoly: `${login} | rola: ${rola}${imie || nazwisko ? ' | ' + [imie, nazwisko].filter(Boolean).join(' ') : ''}` });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Login już zajęty' });
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /uzytkownicy/:id/wyloguj — admin unieważnia sesję konkretnego użytkownika
router.post('/:id/wyloguj', requireAdmin, async (req, res) => {
  try {
    await db.query(
      'UPDATE uzytkownicy SET sessions_invalidated_at=NOW() WHERE id=$1',
      [req.params.id]
    );
    await log({ uzytkownik_id: req.user.id, ip: req.ip, akcja: 'sesja_uniewaznienie',
      szczegoly: `Unieważniono sesję użytkownika: ${req.params.id}`, sukces: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /uzytkownicy/wyloguj-wszystkich — admin unieważnia wszystkie sesje
router.post('/wyloguj-wszystkich', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE uzytkownicy SET sessions_invalidated_at=NOW() WHERE id != $1',
      [req.user.id] // nie wylogowuj siebie
    );
    await log({ uzytkownik_id: req.user.id, ip: req.ip, akcja: 'sesja_uniewaznienie',
      szczegoly: `Unieważniono sesje wszystkich użytkowników (${result.rowCount})`, sukces: true });
    res.json({ ok: true, wylogowano: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /uzytkownicy/me — profil zalogowanego użytkownika
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, login, rola, uczen_id, email, telefon, sms_powiadomienia FROM uzytkownicy WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /uzytkownicy/me/sms — użytkownik sam zmienia swoje ustawienia SMS
router.patch('/me/sms', requireAuth, async (req, res) => {
  const { sms_powiadomienia } = req.body;
  try {
    await db.query(
      'UPDATE uzytkownicy SET sms_powiadomienia=$1 WHERE id=$2',
      [!!sms_powiadomienia, req.user.id]
    );
    res.json({ ok: true, sms_powiadomienia: !!sms_powiadomienia });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /uzytkownicy/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  const { rola, email, uczen_id, imie, nazwisko } = req.body;
  try {
    const stary = await db.query('SELECT login, rola, email, imie, nazwisko, telefon, uczen_id, sms_powiadomienia, pomijaj_hibp FROM uzytkownicy WHERE id=$1', [req.params.id]);
    const staryRow = stary.rows[0];

    // Rola podglad wymaga przypisanego ucznia
    const nowaRola = rola || staryRow?.rola;
    const nowyUczenId = uczen_id !== undefined ? uczen_id : staryRow?.uczen_id;
    if (nowaRola === 'podglad' && !nowyUczenId)
      return res.status(400).json({ error: 'Rola "Podgląd" wymaga przypisania ucznia' });

    // Nie pozwól jedynemu adminowi zmienić sobie roli
    if (staryRow?.rola === 'admin' && rola && rola !== 'admin' && req.params.id === req.user.id) {
      const adminCount = await db.query("SELECT COUNT(*) FROM uzytkownicy WHERE rola='admin'");
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return res.status(400).json({ error: 'Nie możesz zmienić roli — jesteś jedynym administratorem.' });
      }
    }

    // Walidacja formatu email i telefonu przy edycji
    if (email) {
      const emailErr = walidujEmail(email);
      if (emailErr) return res.status(400).json({ error: emailErr });
    }
    if (req.body.telefon) {
      const telefonErr = walidujTelefon(req.body.telefon);
      if (telefonErr) return res.status(400).json({ error: telefonErr });
    }

    // Sprawdź czy email nie jest zajęty przez innego użytkownika
    if (email && email !== staryRow?.email) {
      const emailConflict = await db.query(
        'SELECT id FROM uzytkownicy WHERE email=$1 AND id!=$2',
        [email, req.params.id]
      );
      if (emailConflict.rows.length > 0) return res.status(409).json({ error: 'Email już zajęty' });
    }

    const result = await db.query(
      `UPDATE uzytkownicy SET
        rola = COALESCE($1, rola),
        email = $2,
        uczen_id = $3,
        imie = $4,
        nazwisko = $5,
        telefon = $7,
        sms_powiadomienia = $8,
        pomijaj_hibp = $9
       WHERE id = $6
       RETURNING id, login, rola, uczen_id, email, imie, nazwisko, telefon, sms_powiadomienia, pomijaj_hibp, mfa_enabled, mfa_wymuszone, force_password_change`,
      [
        rola || null, email || null, uczen_id || null, imie || null, nazwisko || null,
        req.params.id,
        req.body.telefon !== undefined ? formatTelefon(req.body.telefon) : staryRow?.telefon || null,
        req.body.sms_powiadomienia !== undefined ? !!req.body.sms_powiadomienia : staryRow?.sms_powiadomienia || false,
        req.body.pomijaj_hibp !== undefined ? !!req.body.pomijaj_hibp : staryRow?.pomijaj_hibp || false,
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });
    const zmiany = [];
    if (staryRow) {
      if (rola && staryRow.rola !== rola) {
        zmiany.push(`rola: ${staryRow.rola} → ${rola}`);
        // Unieważnij sesję przy zmianie roli — stary JWT miał starą rolę
        await db.query('UPDATE uzytkownicy SET sessions_invalidated_at=NOW() WHERE id=$1', [req.params.id]);
      }
      if (staryRow.email !== (email || null)) zmiany.push(`email: ${staryRow.email || '—'} → ${email || '—'}`);
      if (staryRow.telefon !== (req.body.telefon || null)) zmiany.push(`telefon: ${staryRow.telefon || '—'} → ${req.body.telefon || '—'}`);
      if (imie && staryRow.imie !== (imie || null)) zmiany.push(`imię: ${staryRow.imie || '—'} → ${imie}`);
      if (nazwisko && staryRow.nazwisko !== (nazwisko || null)) zmiany.push(`nazwisko: ${staryRow.nazwisko || '—'} → ${nazwisko}`);
      const nowyUczen = uczen_id !== undefined ? (uczen_id || null) : staryRow.uczen_id;
      if (staryRow.uczen_id !== nowyUczen) zmiany.push(`uczeń: ${staryRow.uczen_id || '—'} → ${nowyUczen || '—'}`);
    }
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_uzytkownik', zasob: req.originalUrl,
      szczegoly: `${result.rows[0].login}${zmiany.length ? ' | ' + zmiany.join(', ') : ''}` });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /uzytkownicy/:id/reset-mfa — admin resetuje MFA użytkownika
router.patch('/:id/reset-mfa', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Nie możesz zresetować własnego MFA w ten sposób. Użyj Ustawień.' });
  }
  try {
    const du = await db.query('SELECT login FROM uzytkownicy WHERE id=$1', [req.params.id]);
    await db.query(
      'UPDATE uzytkownicy SET mfa_enabled=FALSE, mfa_secret=NULL, mfa_backup_codes=NULL WHERE id=$1',
      [req.params.id]
    );
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_uzytkownik', zasob: req.originalUrl,
      szczegoly: `${du.rows[0]?.login} | MFA zresetowane przez admina` });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /uzytkownicy/:id/mfa-wymuszone
router.patch('/:id/mfa-wymuszone', requireAdmin, async (req, res) => {
  const { wymuszone } = req.body;
  try {
    await db.query('UPDATE uzytkownicy SET mfa_wymuszone=$1 WHERE id=$2', [!!wymuszone, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /uzytkownicy/:id/wymus-zmiane-hasla
router.patch('/:id/wymus-zmiane-hasla', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE uzytkownicy SET force_password_change=TRUE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /uzytkownicy/:id/cofnij-wymuszenie-hasla
router.patch('/:id/cofnij-wymuszenie-hasla', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE uzytkownicy SET force_password_change=FALSE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /uzytkownicy/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Nie możesz usunąć własnego konta' });
  }
  try {
    const du = await db.query('SELECT login, rola, imie, nazwisko FROM uzytkownicy WHERE id=$1', [req.params.id]);
    await db.query('DELETE FROM uzytkownicy WHERE id=$1', [req.params.id]);
    const du2 = du.rows[0];
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'delete_uzytkownik', zasob: req.originalUrl,
      szczegoly: du2 ? `${du2.login} | rola: ${du2.rola}${du2.imie || du2.nazwisko ? ' | ' + [du2.imie, du2.nazwisko].filter(Boolean).join(' ') : ''}` : '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /uzytkownicy/import-csv
// CSV: login;haslo;rola;email;imie;nazwisko;telefon;sms_powiadomienia
router.post('/import-csv', requireAdmin, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'Brak danych CSV' });

  const lines = csv.trim().split('\n').filter(Boolean);
  // Pomiń nagłówek jeśli istnieje
  const dataLines = lines[0].toLowerCase().startsWith('login') ? lines.slice(1) : lines;

  const results = { dodano: 0, pominieto: 0, bledy: [] };
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    for (let i = 0; i < dataLines.length; i++) {
      const cols = dataLines[i].split(';').map(s => s.trim().replace(/^"|"$/g, ''));
      const [
        login = '', haslo = '', rola = 'podglad',
        email = '', imie = '', nazwisko = '',
        telefon = '', sms_pow = '',
      ] = cols;

      if (!login || !haslo) {
        results.bledy.push(`Wiersz ${i + 1}: brak loginu lub hasła`);
        results.pominieto++;
        continue;
      }
      if (!['admin', 'ksiegowy', 'podglad', 'podglad_pelny'].includes(rola)) {
        results.bledy.push(`Wiersz ${i + 1}: nieznana rola "${rola}" (dozwolone: admin, ksiegowy, podglad_pelny, podglad)`);
        results.pominieto++;
        continue;
      }
      if (email) {
        const emailErr = walidujEmail(email);
        if (emailErr) { results.bledy.push(`Wiersz ${i + 1}: ${emailErr}`); results.pominieto++; continue; }
      }
      const telFormatted = telefon ? formatTelefon(telefon) : null;
      if (telefon && !telFormatted) {
        results.bledy.push(`Wiersz ${i + 1}: nieprawidłowy numer telefonu "${telefon}"`);
        results.pominieto++;
        continue;
      }
      const smsEnabled = ['tak', 'true', '1', 'yes'].includes(sms_pow.toLowerCase());

      try {
        const haslo_hash = await hashHaslo(haslo);
        await client.query(
          `INSERT INTO uzytkownicy (login, haslo_hash, rola, email, imie, nazwisko, telefon, sms_powiadomienia, force_password_change)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
          [login, haslo_hash, rola, email || null, imie || null, nazwisko || null, telFormatted, smsEnabled]
        );
        results.dodano++;
      } catch (e) {
        if (e.code === '23505') {
          results.bledy.push(`Wiersz ${i + 1}: login lub email "${login}" już istnieje`);
        } else {
          results.bledy.push(`Wiersz ${i + 1}: ${e.message}`);
        }
        results.pominieto++;
      }
    }
    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Błąd importu' });
  } finally {
    client.release();
  }
});

// POST /uzytkownicy/:id/wyslij-zaproszenie — wyślij mail powitalny z linkiem
router.post('/:id/wyslij-zaproszenie', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT login, email FROM uzytkownicy WHERE id=$1', [req.params.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika' });
    if (!user.email) return res.status(400).json({ error: 'Użytkownik nie ma adresu email' });

    // Unieważnij stare tokeny resetu
    await db.query('UPDATE tokeny_reset SET wykorzystany=TRUE WHERE uzytkownik_id=$1', [req.params.id]);
    // Ustaw losowe hasło i flagę — tylko link z maila pozwoli się zalogować
    const randomHaslo = crypto.randomBytes(32).toString('hex');
    const randomHash = await hashHaslo(randomHaslo);
    await db.query(
      'UPDATE uzytkownicy SET haslo_hash=$1, sessions_invalidated_at=NOW(), awaiting_password_reset=TRUE WHERE id=$2',
      [randomHash, req.params.id]
    );

    // Wygeneruj nowy token — czas ważności z body (domyślnie 15 minut)
    const minuty = Math.min(parseInt(req.body.link_expiry_minutes || 15), 10080); // max 7 dni
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const wygasaO = new Date(Date.now() + minuty * 60 * 1000);

    await db.query(
      'INSERT INTO tokeny_reset (uzytkownik_id, token_hash, wygasa_o) VALUES ($1,$2,$3)',
      [req.params.id, tokenHash, wygasaO]
    );

    const resetUrl = `${process.env.APP_URL}/reset-hasla?token=${token}`;
    const expiryLabel = minuty >= 10080 ? '7 dni' : minuty >= 7200 ? '5 dni' : minuty >= 2880 ? '2 dni'
      : minuty >= 1440 ? '1 dzien' : minuty >= 360 ? '6 godzin' : minuty >= 120 ? '2 godziny'
      : minuty >= 60 ? '1 godzine' : `${minuty} minut`;
    await sendWelcome(user.email, user.login, resetUrl, expiryLabel);

    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'edit_uzytkownik', zasob: req.originalUrl,
      szczegoly: `${user.login} | wysłano zaproszenie na ${user.email}` });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd wysyłki: ' + err.message });
  }
});

// GET /uzytkownicy/export-csv
router.get('/export-csv', requireKsiegowy, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.login, u.imie, u.nazwisko, u.rola, u.email, u.telefon, u.sms_powiadomienia,
              uc.imie AS uczen_imie, uc.nazwisko AS uczen_nazwisko
       FROM uzytkownicy u
       LEFT JOIN ucznowie uc ON uc.id = u.uczen_id
       ORDER BY u.login`
    );
    const bom = '\uFEFF';
    const header = 'Login;Imie;Nazwisko;Rola;Email;Telefon;SMS_powiadomienia;Uczen_imie;Uczen_nazwisko\n';
    const rows = result.rows.map(r => [
      sanitizeCsv(r.login),
      sanitizeCsv(r.imie),
      sanitizeCsv(r.nazwisko),
      sanitizeCsv(r.rola),
      sanitizeCsv(r.email),
      sanitizeCsv(r.telefon),
      r.sms_powiadomienia ? 'tak' : 'nie',
      sanitizeCsv(r.uczen_imie),
      sanitizeCsv(r.uczen_nazwisko),
    ].join(';')).join('\n');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="uzytkownicy-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(bom + header + rows);
  } catch (err) {
    res.status(500).json({ error: 'Blad eksportu' });
  }
});

export default router;

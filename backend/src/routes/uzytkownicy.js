import { Router } from 'express';
import db from '../db.js';
import { hashHaslo } from '../crypto.js';
import { requireAuth, requireKsiegowy, requireAdmin } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';
import { sendWelcome } from '../mailer.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = Router();

// GET /uzytkownicy
router.get('/', requireKsiegowy, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.login, u.imie, u.nazwisko, u.rola, u.uczen_id, u.email,
              u.mfa_enabled, u.mfa_wymuszone, u.force_password_change,
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

  try {
    const count = await db.query('SELECT COUNT(*) FROM uzytkownicy');
    if (parseInt(count.rows[0].count) > 0) {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Wymagana autoryzacja' });
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (decoded.rola !== 'admin') return res.status(403).json({ error: 'Brak uprawnień — wymagana rola admin' });
    }

    const haslo_hash = await hashHaslo(haslo);
    const result = await db.query(
      `INSERT INTO uzytkownicy (login, haslo_hash, rola, uczen_id, email, imie, nazwisko)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, login, rola, uczen_id, email, imie, nazwisko`,
      [login, haslo_hash, rola, uczen_id || null, email || null, imie || null, nazwisko || null]
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

// PATCH /uzytkownicy/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  const { rola, email, uczen_id, imie, nazwisko } = req.body;
  try {
    const stary = await db.query('SELECT login, rola, email, imie, nazwisko FROM uzytkownicy WHERE id=$1', [req.params.id]);
    const staryRow = stary.rows[0];

    // Nie pozwól jedynemu adminowi zmienić sobie roli
    if (staryRow?.rola === 'admin' && rola && rola !== 'admin' && req.params.id === req.user.id) {
      const adminCount = await db.query("SELECT COUNT(*) FROM uzytkownicy WHERE rola='admin'");
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return res.status(400).json({ error: 'Nie możesz zmienić roli — jesteś jedynym administratorem.' });
      }
    }

    const result = await db.query(
      `UPDATE uzytkownicy SET
        rola = COALESCE($1, rola),
        email = $2,
        uczen_id = $3,
        imie = $4,
        nazwisko = $5
       WHERE id = $6
       RETURNING id, login, rola, uczen_id, email, imie, nazwisko, mfa_enabled, mfa_wymuszone, force_password_change`,
      [rola || null, email || null, uczen_id || null, imie || null, nazwisko || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono' });
    const zmiany = [];
    if (staryRow) {
      if (rola && staryRow.rola !== rola) zmiany.push(`rola: ${staryRow.rola} → ${rola}`);
      if (staryRow.email !== (email || null)) zmiany.push(`email: ${staryRow.email || '—'} → ${email || '—'}`);
      if (imie && staryRow.imie !== (imie || null)) zmiany.push(`imię: ${staryRow.imie || '—'} → ${imie}`);
      if (nazwisko && staryRow.nazwisko !== (nazwisko || null)) zmiany.push(`nazwisko: ${staryRow.nazwisko || '—'} → ${nazwisko}`);
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
// CSV: login;haslo;rola;email;imie;nazwisko
router.post('/import-csv', requireAdmin, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'Brak danych CSV' });

  const lines = csv.trim().split('\n').filter(Boolean);
  const results = { dodano: 0, pominieto: 0, bledy: [] };
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(';').map(s => s.trim().replace(/^"|"$/g, ''));
      const [login, haslo, rola = 'podglad', email = '', imie = '', nazwisko = ''] = cols;

      if (!login || !haslo) {
        results.bledy.push(`Wiersz ${i + 1}: brak loginu lub hasła`);
        results.pominieto++;
        continue;
      }
      if (!['ksiegowy', 'podglad', 'podglad_pelny'].includes(rola)) {
        results.bledy.push(`Wiersz ${i + 1}: nieznana rola "${rola}"`);
        results.pominieto++;
        continue;
      }

      try {
        const haslo_hash = await hashHaslo(haslo);
        await client.query(
          `INSERT INTO uzytkownicy (login, haslo_hash, rola, email, imie, nazwisko, force_password_change)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
          [login, haslo_hash, rola, email || null, imie || null, nazwisko || null]
        );
        results.dodano++;
      } catch (e) {
        if (e.code === '23505') {
          results.bledy.push(`Wiersz ${i + 1}: login "${login}" już istnieje`);
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
    const minuty = parseInt(req.body.link_expiry_minutes || 15);
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
    const result = await db.query('SELECT login, imie, nazwisko, rola, email FROM uzytkownicy ORDER BY login');
    const bom = '\uFEFF';
    const header = 'Login;Imie;Nazwisko;Rola;Email\n';
    const rows = result.rows.map(r =>
      [r.login, r.imie || '', r.nazwisko || '', r.rola, r.email || ''].join(';')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="uzytkownicy-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(bom + header + rows);
  } catch (err) {
    res.status(500).json({ error: 'Blad eksportu' });
  }
});

export default router;

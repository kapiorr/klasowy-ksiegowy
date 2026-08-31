import { Router } from 'express';
import crypto from 'crypto';
import { log, getIP, isBlocked, checkFailedLogins } from '../logger.js';
import { sendAdminAlert } from '../mailer.js';
import jwt from 'jsonwebtoken';
import { generateSecret, generate, verify as verifyTotp, generateURI } from 'otplib';
import qrcode from 'qrcode';
import db from '../db.js';
import { hashHaslo, verifyHaslo, generateResetToken, hashResetToken } from '../crypto.js';
import { walidujHasloHIBP, sprawdzHIBP } from '../hibp.js';
import { hmacField, decryptField, encryptField } from '../fieldCrypto.js';
import { walidujSilnoscHasla, PASSWORD_REQUIREMENTS_TEXT } from '../passwordPolicy.js';
import { requireCaptcha } from '../captcha.js';
import { sendResetEmail } from '../mailer.js';
import { requireAuth } from '../middleware/auth.js';
import { resetLimiter } from '../limiters.js';

const router = Router();

function isMobile(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return /android|iphone|ipad|ipod|mobile|phone/.test(ua);
}

function jwtExpiry(req) {
  // Mobile: 30 dni — nie wylogowuje użytkowników na telefonie
  // Desktop: 1 godzina
  return isMobile(req) ? '30d' : '1h';
}

// ── Logowanie ─────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { login, haslo, mfa_kod } = req.body;
  if (!login || !haslo) return res.status(400).json({ error: 'Login i hasło są wymagane' });

  const ip = getIP(req);

  try {
    // Sprawdź blokady
    const blokady = await isBlocked(login, ip);
    if (blokady.length > 0) {
      await log({ login_proba: login, ip, akcja: 'login_blocked', sukces: false, szczegoly: 'Zablokowany' });
      return res.status(429).json({ error: 'Konto lub adres IP jest zablokowany. Spróbuj ponownie za godzinę.' });
    }

    const result = await db.query(
      `SELECT * FROM uzytkownicy WHERE login = $1 OR (email_hmac = $2 AND email_hmac IS NOT NULL)`,
      [login, hmacField(login)]
    );
    const user = result.rows[0];
    if (user) {
      user.email = user.email_enc ? decryptField(user.email_enc) : user.email;
      user.telefon = user.telefon_enc ? decryptField(user.telefon_enc) : user.telefon;
    }

    if (!user) {
      await log({ login_proba: login, ip, akcja: 'login_fail', sukces: false, szczegoly: 'Nieznany login' });
      const nowe = await checkFailedLogins(login, ip);
      if (nowe.length > 0) {
        await sendAdminAlert(login, ip, nowe, 'login_blocked');
      }
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }

    // Sprawdź czy czeka na reset hasła przez link — przed weryfikacją hasła
    if (user.awaiting_password_reset) {
      return res.status(403).json({ awaiting_reset: true, error: 'Zmiana hasła możliwa tylko przez link wysłany na email.' });
    }

    const valid = await verifyHaslo(haslo, user.haslo_hash);
    if (!valid) {
      await log({ uzytkownik_id: user.id, login_proba: login, ip, akcja: 'login_fail', sukces: false, szczegoly: 'Złe hasło' });
      const nowe = await checkFailedLogins(login, ip);
      if (nowe.length > 0) {
        await sendAdminAlert(login, ip, nowe, 'login_blocked');
      }
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }

    // Sprawdź MFA
    if (user.mfa_enabled) {
      if (!mfa_kod) {
        return res.status(200).json({ mfa_required: true });
      }
      const { decryptMfaSecret, verifyBackupCode } = await import('../crypto.js');
      const secret = decryptMfaSecret(user.mfa_secret);
      const validTotp = verifyTotp({ secret, token: mfa_kod });

      if (!validTotp) {
        const codes = user.mfa_backup_codes || [];
        let usedIdx = -1;
        for (let i = 0; i < codes.length; i++) {
          if (await verifyBackupCode(mfa_kod, codes[i])) { usedIdx = i; break; }
        }
        if (usedIdx === -1) {
          await log({ uzytkownik_id: user.id, login_proba: login, ip, akcja: 'login_fail', sukces: false, szczegoly: 'Zły kod MFA' });
          const nowe = await checkFailedLogins(login, ip);
          if (nowe.length > 0) await sendAdminAlert(login, ip, nowe, 'login_blocked');
          return res.status(401).json({ error: 'Nieprawidłowy kod MFA' });
        }
        const newCodes = codes.filter((_, i) => i !== usedIdx);
        await db.query('UPDATE uzytkownicy SET mfa_backup_codes=$1 WHERE id=$2', [newCodes, user.id]);
      }
    }

    // Wymuszona zmiana hasla
    if (user.force_password_change) {
      return res.status(200).json({ password_change_required: true, user_id: user.id });
    }

    // MFA wymuszone ale nie skonfigurowane
    const mfaSetupRequired = user.mfa_wymuszone && !user.mfa_enabled;

    const expiry = jwtExpiry(req);
    const token = jwt.sign(
      { id: user.id, rola: user.rola, uczen_id: user.uczen_id, mfaSetupRequired },
      process.env.JWT_SECRET,
      { expiresIn: expiry }
    );

    // Log udanego logowania
    await log({ uzytkownik_id: user.id, login_proba: login, ip, akcja: 'login_ok', sukces: true });

    // Sprawdź siłę hasła w tle i zapisz wynik
    const slabe = walidujSilnoscHasla(haslo).length > 0;
    if (slabe !== (user.haslo_slabe === true)) {
      db.query('UPDATE uzytkownicy SET haslo_slabe=$1 WHERE id=$2', [slabe, user.id]).catch(() => {});
    }
    if (slabe) {
      log({ uzytkownik_id: user.id, ip, akcja: 'slabe_haslo', sukces: false,
        szczegoly: `Użytkownik "${login}" loguje się ze słabym hasłem (nie spełnia wymagań)` }).catch(() => {});
    }

    // Pierwsze logowanie po założeniu konta — sprawdź HIBP w tle (nie blokuje odpowiedzi)
    if (!user.pomijaj_hibp && user.hibp_sprawdzono_at === null) {
      sprawdzHIBP(haslo).then(wynik => {
        if (wynik !== null) {
          db.query(
            'UPDATE uzytkownicy SET hibp_wycieklo=$1, hibp_sprawdzono_at=NOW() WHERE id=$2',
            [wynik.wyciekło, user.id]
          ).catch(() => {});
          if (wynik.wyciekło) {
            log({ uzytkownik_id: user.id, ip, akcja: 'hibp_wyciekle_haslo', sukces: false,
              szczegoly: `Hasło użytkownika "${login}" figuruje w bazach wyciekłych haseł` }).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    // Loguj jeśli hasło oznaczone jako wyciekłe — niezależnie od flagi pomijaj_hibp
    if (user.hibp_wycieklo === true) {
      await log({ uzytkownik_id: user.id, ip, akcja: 'hibp_wyciekle_haslo', sukces: false,
        szczegoly: `Użytkownik "${login}" loguje się z wyciekłym hasłem${user.pomijaj_hibp ? ' (HIBP pominięte)' : ''}` });
      sendAdminAlert(login, ip, [{ typ: 'hibp_wyciekle', wartosc: `${login} loguje się z wyciekłym hasłem` }], 'hibp_wyciekle').catch(() => {});
    }

    // Ustaw httpOnly cookie z tokenem
    const maxAge = expiry === '30d' ? 30 * 24 * 60 * 60 * 1000
      : expiry === '24h' ? 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    res.cookie('token', token, {
      httpOnly: true,      // niedostępny przez JavaScript
      secure: true,        // tylko HTTPS
      sameSite: 'strict',  // CSRF protection
      maxAge,
      path: '/',
    });

    res.json({
      token, // zostawiamy dla kompatybilności — frontend może używać cookie lub nagłówka
      user: { id: user.id, login: user.login, rola: user.rola, uczen_id: user.uczen_id, mfaSetupRequired },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── Rejestracja ───────────────────────────────────────────────────────────────
router.post('/rejestracja', async (req, res) => {
  const { login, haslo, rola, uczen_id, email } = req.body;
  if (!login || !haslo || !rola) return res.status(400).json({ error: 'Brakuje danych' });

  try {
    const count = await db.query('SELECT COUNT(*) FROM uzytkownicy');
    if (parseInt(count.rows[0].count) > 0) {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Wymagana autoryzacja' });
      try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.rola !== 'ksiegowy') return res.status(403).json({ error: 'Brak uprawnień' });
      } catch {
        return res.status(401).json({ error: 'Nieprawidłowy token' });
      }
    }

    const haslo_hash = await hashHaslo(haslo);
    const result = await db.query(
      'INSERT INTO uzytkownicy (login, haslo_hash, rola, uczen_id, email_enc, email_hmac) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, login, rola, uczen_id',
      [login, haslo_hash, rola, uczen_id || null, encryptField(process.env.ADMIN_EMAIL || null), hmacField(process.env.ADMIN_EMAIL || null)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Login już zajęty' });
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── Zmiana hasła ──────────────────────────────────────────────────────────────
router.post('/zmien-haslo', requireAuth, async (req, res) => {
  const { stare_haslo, nowe_haslo } = req.body;
  if (!stare_haslo || !nowe_haslo) return res.status(400).json({ error: 'Brakuje danych' });
  if (nowe_haslo.length < 8) return res.status(400).json({ error: 'Hasło min. 8 znaków' });

  try {
    const result = await db.query('SELECT * FROM uzytkownicy WHERE id=$1', [req.user.id]);
    const user = result.rows[0];
    const valid = await verifyHaslo(stare_haslo, user.haslo_hash);
    if (!valid) return res.status(401).json({ error: 'Nieprawidłowe stare hasło' });

    // Sprawdź HIBP przed zmianą — zablokuj jeśli wyciekłe (chyba że pomijaj_hibp)
    const hibpBlokada1 = await walidujHasloHIBP(nowe_haslo, user.pomijaj_hibp);
    if (hibpBlokada1) return res.status(400).json({ error: hibpBlokada1 });

    const haslo_hash = await hashHaslo(nowe_haslo);
    const hibpW1 = await sprawdzHIBP(nowe_haslo);
    await db.query(
      `UPDATE uzytkownicy SET haslo_hash=$1, hibp_wycieklo=$2, hibp_sprawdzono_at=NOW(), hibp_dismissed_at=NULL, haslo_slabe=FALSE WHERE id=$3`,
      [haslo_hash, hibpW1?.wyciekło ?? null, user.id]
    );
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'zmiana_hasla', sukces: true });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── Reset hasła — wyślij email ────────────────────────────────────────────────
router.post('/reset-hasla/wyslij', resetLimiter, async (req, res) => {
  const { email, captcha_token, captcha_answer } = req.body;
  const ip = getIP(req);

  // Weryfikacja CAPTCHA z logowaniem
  const { verifyCaptcha } = await import('../captcha.js');
  if (!verifyCaptcha(captcha_token, captcha_answer)) {
    await log({ ip, akcja: 'captcha_fail', zasob: '/reset-hasla/wyslij', sukces: false,
      szczegoly: `Błędna CAPTCHA przy próbie resetu hasła${email ? ' dla: ' + email : ''}` }).catch(() => {});
    sendAdminAlert(email || 'nieznany', ip, [{
      typ: 'captcha_fail',
      wartosc: `Błędna CAPTCHA przy próbie resetu hasła${email ? ' dla: ' + email : ''}`,
    }], 'captcha_fail').catch(() => {});
    return res.status(400).json({ error: 'Nieprawidłowa odpowiedź CAPTCHA — odśwież i spróbuj ponownie' });
  }
  if (!email) return res.status(400).json({ error: 'Email jest wymagany' });

  try {
    const result = await db.query('SELECT * FROM uzytkownicy WHERE email_hmac=$1', [hmacField(email)]);
    // Zawsze zwracamy 200 żeby nie ujawniać czy email istnieje
    if (!result.rows[0]) return res.json({ ok: true });

    const user = result.rows[0];
    const { raw, hash } = generateResetToken();

    await db.query(
      'INSERT INTO tokeny_reset (uzytkownik_id, token_hash, wygasa_o) VALUES ($1,$2,NOW()+INTERVAL\'1 hour\')',
      [user.id, hash]
    );

    await sendResetEmail(email, raw);

    // Alert admina o wysłaniu linku resetu
    await log({ ip, akcja: 'reset_hasla_wyslano', zasob: '/reset-hasla/wyslij', sukces: true,
      szczegoly: `Wysłano link resetu hasła na adres: ${email}` }).catch(() => {});

    await sendAdminAlert(email, ip, [{
      typ: 'reset_hasla',
      wartosc: `Wysłano link resetu hasła na adres: ${email}`,
    }], 'reset_hasla').catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── Reset hasła — ustaw nowe ──────────────────────────────────────────────────
router.post('/reset-hasla/ustaw', async (req, res) => {
  const { token, nowe_haslo } = req.body;
  if (!token || !nowe_haslo) return res.status(400).json({ error: 'Brakuje danych' });
  if (nowe_haslo.length < 8) return res.status(400).json({ error: 'Hasło min. 8 znaków' });

  try {
    const hash = hashResetToken(token);
    const result = await db.query(
      'SELECT * FROM tokeny_reset WHERE token_hash=$1 AND wykorzystany=FALSE AND wygasa_o>NOW()',
      [hash]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Token nieważny lub wygasły' });

    const tokenRow = result.rows[0];

    // Pobierz pomijaj_hibp dla użytkownika
    const userHibp = await db.query('SELECT pomijaj_hibp FROM uzytkownicy WHERE id=$1', [tokenRow.uzytkownik_id]);

  // Sprawdź siłę hasła
  const silnoscBledow = walidujSilnoscHasla(nowe_haslo);
  if (silnoscBledow.length > 0) {
    return res.status(400).json({ error: `Hasło nie spełnia wymagań: ${silnoscBledow.join(', ')}. Wymagania: ${PASSWORD_REQUIREMENTS_TEXT}` });
  }

    const hibpBlokada2 = await walidujHasloHIBP(nowe_haslo, userHibp.rows[0]?.pomijaj_hibp);
    if (hibpBlokada2) return res.status(400).json({ error: hibpBlokada2 });

    const haslo_hash = await hashHaslo(nowe_haslo);

    const hibpW2 = await sprawdzHIBP(nowe_haslo);
    await db.query(
      `UPDATE uzytkownicy SET haslo_hash=$1, awaiting_password_reset=FALSE, sessions_invalidated_at=NOW(), hibp_wycieklo=$2, hibp_sprawdzono_at=NOW(), hibp_dismissed_at=NULL, haslo_slabe=FALSE WHERE id=$3`,
      [haslo_hash, hibpW2?.wyciekło ?? null, tokenRow.uzytkownik_id]
    );
    await db.query('UPDATE tokeny_reset SET wykorzystany=TRUE WHERE id=$1', [tokenRow.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── MFA: generuj secret i QR ──────────────────────────────────────────────────
router.post('/mfa/setup', requireAuth, async (req, res) => {
  try {
    const { encryptMfaSecret } = await import('../crypto.js');
    const userRow = await db.query('SELECT login FROM uzytkownicy WHERE id=$1', [req.user.id]);
    const login = userRow.rows[0]?.login || 'uzytkownik';
    const secret = generateSecret();
    const otpauth = generateURI({ secret, label: login, issuer: 'Klasowy Ksiegowy' });
    const qrDataUrl = await qrcode.toDataURL(otpauth);

    // Zapisz tymczasowo niezaszyfrowany secret (aktywacja dopiero po weryfikacji)
    const encrypted = encryptMfaSecret(secret);
    await db.query('UPDATE uzytkownicy SET mfa_secret=$1 WHERE id=$2', [encrypted, req.user.id]);

    res.json({ qr: qrDataUrl, secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── MFA: aktywuj (weryfikuj kod z aplikacji) ──────────────────────────────────
router.post('/mfa/aktywuj', requireAuth, async (req, res) => {
  const { kod } = req.body;
  if (!kod) return res.status(400).json({ error: 'Brakuje kodu' });

  try {
    const { decryptMfaSecret, hashBackupCode } = await import('../crypto.js');
    const userRow = await db.query('SELECT mfa_secret FROM uzytkownicy WHERE id=$1', [req.user.id]);
    const user = userRow.rows[0];
    if (!user?.mfa_secret) return res.status(400).json({ error: 'Najpierw wygeneruj QR kod' });

    const secret = decryptMfaSecret(user.mfa_secret);
    const valid = verifyTotp({ secret, token: kod });
    if (!valid) return res.status(400).json({ error: 'Nieprawidłowy kod — spróbuj ponownie' });

    // Generuj 8 backup codes
    const rawCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const hashedCodes = await Promise.all(rawCodes.map(hashBackupCode));

    await db.query(
      'UPDATE uzytkownicy SET mfa_enabled=TRUE, mfa_backup_codes=$1 WHERE id=$2',
      [hashedCodes, req.user.id]
    );
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'mfa_wlaczone', sukces: true });
    res.json({ ok: true, backup_codes: rawCodes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── MFA: wyłącz ───────────────────────────────────────────────────────────────
router.post('/mfa/wylacz', requireAuth, async (req, res) => {
  const { haslo } = req.body;
  if (!haslo) return res.status(400).json({ error: 'Podaj hasło aby wyłączyć MFA' });

  try {
    const result = await db.query('SELECT * FROM uzytkownicy WHERE id=$1', [req.user.id]);
    const user = result.rows[0];

    if (user.mfa_wymuszone) {
      return res.status(403).json({ error: 'MFA jest wymuszone przez księgowego' });
    }

    const valid = await verifyHaslo(haslo, user.haslo_hash);
    if (!valid) return res.status(401).json({ error: 'Nieprawidłowe hasło' });

    await db.query(
      'UPDATE uzytkownicy SET mfa_enabled=FALSE, mfa_secret=NULL, mfa_backup_codes=NULL WHERE id=$1',
      [req.user.id]
    );
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'mfa_wylaczone', sukces: true });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── MFA: status ───────────────────────────────────────────────────────────────
router.get('/mfa/status', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT mfa_enabled, mfa_wymuszone, array_length(mfa_backup_codes,1) AS backup_codes_count FROM uzytkownicy WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── Wymuszona zmiana hasła (bez tokenu, po zalogowaniu) ──────────────────────
router.post('/wymuszona-zmiana-hasla', requireAuth, async (req, res) => {
  const { nowe_haslo } = req.body;
  const user_id = req.user.id; // zawsze ID zalogowanego użytkownika
  if (!nowe_haslo) return res.status(400).json({ error: 'Brakuje nowego hasła' });
  if (nowe_haslo.length < 8) return res.status(400).json({ error: 'Hasło min. 8 znaków' });


  try {
    const result = await db.query(
      'SELECT id, force_password_change, pomijaj_hibp FROM uzytkownicy WHERE id=$1',
      [user_id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Nie znaleziono uzytkownika' });
    if (!user.force_password_change) return res.status(400).json({ error: 'Zmiana hasla nie jest wymagana' });


  // Sprawdź siłę hasła
  const silnoscBledow = walidujSilnoscHasla(nowe_haslo);
  if (silnoscBledow.length > 0) {
    return res.status(400).json({ error: `Hasło nie spełnia wymagań: ${silnoscBledow.join(', ')}. Wymagania: ${PASSWORD_REQUIREMENTS_TEXT}` });
  }

    const hibpBlokada3 = await walidujHasloHIBP(nowe_haslo, user.pomijaj_hibp);
    if (hibpBlokada3) return res.status(400).json({ error: hibpBlokada3 });

    const haslo_hash = await hashHaslo(nowe_haslo);
    const hibpWynikW = await sprawdzHIBP(nowe_haslo);
    await db.query(
      `UPDATE uzytkownicy SET haslo_hash=$1, force_password_change=FALSE,
        hibp_wycieklo=$2, hibp_sprawdzono_at=NOW(), hibp_dismissed_at=NULL WHERE id=$3`,
      [haslo_hash, hibpWynikW?.wyciekło ?? null, user_id]
    );
    await log({ uzytkownik_id: user_id, ip: getIP(req), akcja: 'wymuszona_zmiana_hasla', sukces: true });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

export default router;

// GET /auth/hibp-status — stan HIBP dla zalogowanego usera
router.get('/hibp-status', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT hibp_wycieklo, hibp_sprawdzono_at, hibp_dismissed_at FROM uzytkownicy WHERE id=$1',
      [req.user.id]
    );
    const u = result.rows[0];
    if (!u) return res.json({ show: false });

    // Pokaż kafelek jeśli:
    // 1. hibp_wycieklo = true
    // 2. user nie zamknął ALBO zamknął >5 dni temu
    const dismissed = u.hibp_dismissed_at ? new Date(u.hibp_dismissed_at) : null;
    const piecDniTemu = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const show = u.hibp_wycieklo === true && (!dismissed || dismissed < piecDniTemu);

    res.json({ show, sprawdzono_at: u.hibp_sprawdzono_at });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /auth/hibp-dismiss — user zamyka kafelek
router.post('/hibp-dismiss', requireAuth, async (req, res) => {
  try {
    await db.query(
      'UPDATE uzytkownicy SET hibp_dismissed_at = NOW() WHERE id=$1',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /auth/logout — wyczyść httpOnly cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});

// GET /auth/haslo-slabe-status — czy hasło nie spełnia wymagań
router.get('/haslo-slabe-status', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT haslo_slabe, haslo_slabe_dismissed_at FROM uzytkownicy WHERE id=$1',
      [req.user.id]
    );
    const u = result.rows[0];
    if (!u) return res.json({ show: false });
    const dismissed = u.haslo_slabe_dismissed_at ? new Date(u.haslo_slabe_dismissed_at) : null;
    const piecDniTemu = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const show = u.haslo_slabe === true && (!dismissed || dismissed < piecDniTemu);
    res.json({ show });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /auth/haslo-slabe-dismiss — zamknij baner
router.post('/haslo-slabe-dismiss', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE uzytkownicy SET haslo_slabe_dismissed_at=NOW() WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

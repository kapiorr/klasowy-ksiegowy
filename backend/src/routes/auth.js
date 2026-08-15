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
import { sendResetEmail } from '../mailer.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function isMobile(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return /android|iphone|ipad|ipod|mobile|phone/.test(ua);
}

function jwtExpiry(rola, req) {
  // Ksiegowy na telefonie: 30 dni; wszystko inne: 1h
  if (['admin', 'ksiegowy'].includes(rola) && isMobile(req)) return '30d';
  return '1h';
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
      'SELECT * FROM uzytkownicy WHERE login = $1 OR (email = $1 AND email IS NOT NULL)',
      [login]
    );
    const user = result.rows[0];

    if (!user) {
      await log({ login_proba: login, ip, akcja: 'login_fail', sukces: false, szczegoly: 'Nieznany login' });
      const nowe = await checkFailedLogins(login, ip);
      if (nowe.length > 0) {
        await sendAdminAlert(login, ip, nowe);
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
        await sendAdminAlert(login, ip, nowe);
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
          if (nowe.length > 0) await sendAdminAlert(login, ip, nowe);
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

    const expiry = jwtExpiry(user.rola, req);
    const token = jwt.sign(
      { id: user.id, rola: user.rola, uczen_id: user.uczen_id, mfaSetupRequired },
      process.env.JWT_SECRET,
      { expiresIn: expiry }
    );

    // Log udanego logowania
    await log({ uzytkownik_id: user.id, login_proba: login, ip, akcja: 'login_ok', sukces: true });

    // Pierwsze logowanie po założeniu konta — sprawdź HIBP w tle (nie blokuje odpowiedzi)
    if (!user.pomijaj_hibp && user.hibp_sprawdzono_at === null) {
      sprawdzHIBP(haslo).then(wynik => {
        if (wynik !== null) {
          db.query(
            'UPDATE uzytkownicy SET hibp_wycieklo=$1, hibp_sprawdzono_at=NOW() WHERE id=$2',
            [wynik.wyciekło, user.id]
          ).catch(() => {});
        }
      }).catch(() => {});
    }

    res.json({
      token,
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
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        if (decoded.rola !== 'ksiegowy') return res.status(403).json({ error: 'Brak uprawnień' });
      } catch {
        return res.status(401).json({ error: 'Nieprawidłowy token' });
      }
    }

    const haslo_hash = await hashHaslo(haslo);
    const result = await db.query(
      'INSERT INTO uzytkownicy (login, haslo_hash, rola, uczen_id, email) VALUES ($1,$2,$3,$4,$5) RETURNING id, login, rola, uczen_id, email',
      [login, haslo_hash, rola, uczen_id || null, email || null]
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

    const haslo_hash = await hashHaslo(nowe_haslo);
    const hibpW1 = await sprawdzHIBP(nowe_haslo);
    await db.query(
      `UPDATE uzytkownicy SET haslo_hash=$1, hibp_wycieklo=$2, hibp_sprawdzono_at=NOW(), hibp_dismissed_at=NULL WHERE id=$3`,
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
router.post('/reset-hasla/wyslij', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email jest wymagany' });

  try {
    const result = await db.query('SELECT * FROM uzytkownicy WHERE email=$1', [email]);
    // Zawsze zwracamy 200 żeby nie ujawniać czy email istnieje
    if (!result.rows[0]) return res.json({ ok: true });

    const user = result.rows[0];
    const { raw, hash } = generateResetToken();

    await db.query(
      'INSERT INTO tokeny_reset (uzytkownik_id, token_hash, wygasa_o) VALUES ($1,$2,NOW()+INTERVAL\'1 hour\')',
      [user.id, hash]
    );

    await sendResetEmail(email, raw);
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
    const haslo_hash = await hashHaslo(nowe_haslo);

    const hibpW2 = await sprawdzHIBP(nowe_haslo);
    await db.query(
      `UPDATE uzytkownicy SET haslo_hash=$1, awaiting_password_reset=FALSE, sessions_invalidated_at=NOW(), hibp_wycieklo=$2, hibp_sprawdzono_at=NOW(), hibp_dismissed_at=NULL WHERE id=$3`,
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
      'SELECT id, force_password_change FROM uzytkownicy WHERE id=$1',
      [user_id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Nie znaleziono uzytkownika' });
    if (!user.force_password_change) return res.status(400).json({ error: 'Zmiana hasla nie jest wymagana' });

    const haslo_hash = await hashHaslo(nowe_haslo);
    await db.query(
      'UPDATE uzytkownicy SET haslo_hash=$1, force_password_change=FALSE WHERE id=$2',
      [haslo_hash, user_id]
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

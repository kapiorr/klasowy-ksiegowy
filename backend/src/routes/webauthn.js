import { Router } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashHaslo, verifyHaslo } from '../crypto.js';

const router = Router();

const RP_NAME = process.env.APP_NAME || 'Klasowy Księgowy';
const RP_ID = () => {
  try { return new URL(process.env.APP_URL || 'http://localhost').hostname; }
  catch { return 'localhost'; }
};
const ORIGIN = () => process.env.APP_URL || 'http://localhost';

// Tymczasowe przechowywanie challenge (produkcja: Redis lub DB)
const challenges = new Map();

// ── WebAuthn — rejestracja ────────────────────────────────────────────────────

// GET /webauthn/register/options — wygeneruj opcje rejestracji
router.get('/register/options', requireAuth, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT id, login FROM uzytkownicy WHERE id=$1', [req.user.id]
    );
    const user = userResult.rows[0];

    const existingCredentials = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE uzytkownik_id=$1',
      [req.user.id]
    );

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID(),
      userID: Buffer.from(user.id),
      userName: user.login,
      userDisplayName: user.login,
      attestationType: 'none',
      excludeCredentials: existingCredentials.rows.map(c => ({
        id: c.credential_id,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challenges.set(req.user.id, options.challenge);
    setTimeout(() => challenges.delete(req.user.id), 5 * 60 * 1000);

    res.json(options);
  } catch (err) {
    console.error('WebAuthn register options:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /webauthn/register/verify — zweryfikuj i zapisz klucz
router.post('/register/verify', requireAuth, async (req, res) => {
  const { response, name } = req.body;
  const expectedChallenge = challenges.get(req.user.id);
  if (!expectedChallenge) return res.status(400).json({ error: 'Brak aktywnego challenge' });

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN(),
      expectedRPID: RP_ID(),
    });

    if (!verification.verified) return res.status(400).json({ error: 'Weryfikacja nieudana' });

    const { credential } = verification.registrationInfo;
    await db.query(
      `INSERT INTO webauthn_credentials (uzytkownik_id, credential_id, public_key, counter, device_type, name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (credential_id) DO UPDATE SET counter=$4, name=$6`,
      [req.user.id, credential.id, Buffer.from(credential.publicKey).toString('base64'),
       credential.counter, credential.type, name || 'Klucz urządzenia']
    );

    challenges.delete(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('WebAuthn register verify:', err);
    res.status(400).json({ error: 'Błąd rejestracji: ' + err.message });
  }
});

// ── WebAuthn — weryfikacja (odblokowanie) ────────────────────────────────────

// GET /webauthn/auth/options — wygeneruj opcje weryfikacji
router.get('/auth/options', requireAuth, async (req, res) => {
  try {
    const credentials = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE uzytkownik_id=$1',
      [req.user.id]
    );

    if (!credentials.rows.length) {
      return res.status(404).json({ error: 'Brak zarejestrowanych kluczy' });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID(),
      allowCredentials: credentials.rows.map(c => ({
        id: c.credential_id,
        type: 'public-key',
      })),
      userVerification: 'preferred',
    });

    challenges.set(req.user.id, options.challenge);
    setTimeout(() => challenges.delete(req.user.id), 5 * 60 * 1000);

    res.json(options);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /webauthn/auth/verify — zweryfikuj i zwróć token odblokowania
router.post('/auth/verify', requireAuth, async (req, res) => {
  const { response } = req.body;
  const expectedChallenge = challenges.get(req.user.id);
  if (!expectedChallenge) return res.status(400).json({ error: 'Brak aktywnego challenge' });

  try {
    const credResult = await db.query(
      'SELECT * FROM webauthn_credentials WHERE credential_id=$1 AND uzytkownik_id=$2',
      [response.id, req.user.id]
    );
    const cred = credResult.rows[0];
    if (!cred) return res.status(404).json({ error: 'Nie znaleziono klucza' });

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN(),
      expectedRPID: RP_ID(),
      credential: {
        id: cred.credential_id,
        publicKey: Buffer.from(cred.public_key, 'base64'),
        counter: cred.counter,
      },
    });

    if (!verification.verified) return res.status(400).json({ error: 'Weryfikacja nieudana' });

    await db.query(
      'UPDATE webauthn_credentials SET counter=$1 WHERE credential_id=$2',
      [verification.authenticationInfo.newCounter, cred.credential_id]
    );

    challenges.delete(req.user.id);
    res.json({ ok: true, unlocked: true });
  } catch (err) {
    console.error('WebAuthn auth verify:', err);
    res.status(400).json({ error: 'Błąd weryfikacji: ' + err.message });
  }
});

// GET /webauthn/credentials — lista zarejestrowanych kluczy
router.get('/credentials', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, device_type, created_at FROM webauthn_credentials WHERE uzytkownik_id=$1 ORDER BY created_at',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /webauthn/credentials/:id — usuń klucz
router.delete('/credentials/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM webauthn_credentials WHERE id=$1 AND uzytkownik_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── PIN aplikacyjny ───────────────────────────────────────────────────────────

// POST /webauthn/pin/ustaw — ustaw PIN
router.post('/pin/ustaw', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN musi mieć 4-6 cyfr' });
  }
  try {
    const hash = await hashHaslo(pin);
    await db.query('UPDATE uzytkownicy SET app_pin_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /webauthn/pin/verify — zweryfikuj PIN
router.post('/pin/verify', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'Brak PIN' });
  try {
    const result = await db.query('SELECT app_pin_hash FROM uzytkownicy WHERE id=$1', [req.user.id]);
    const hash = result.rows[0]?.app_pin_hash;
    if (!hash) return res.status(404).json({ error: 'PIN nie jest ustawiony' });
    const valid = await verifyHaslo(pin, hash);
    if (!valid) return res.status(401).json({ error: 'Nieprawidłowy PIN' });
    res.json({ ok: true, unlocked: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /webauthn/pin — usuń PIN
router.delete('/pin', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE uzytkownicy SET app_pin_hash=NULL WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /webauthn/status — sprawdź co jest skonfigurowane
router.get('/status', requireAuth, async (req, res) => {
  try {
    const [pinResult, credResult] = await Promise.all([
      db.query('SELECT app_pin_hash IS NOT NULL AS ma_pin FROM uzytkownicy WHERE id=$1', [req.user.id]),
      db.query('SELECT COUNT(*) AS liczba FROM webauthn_credentials WHERE uzytkownik_id=$1', [req.user.id]),
    ]);
    res.json({
      ma_pin: pinResult.rows[0]?.ma_pin || false,
      liczba_kluczy: parseInt(credResult.rows[0]?.liczba || 0),
    });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

// ── Endpointy dla admina ─────────────────────────────────────────────────────

// DELETE /webauthn/admin/:userId/pin — admin usuwa PIN użytkownika
router.delete('/admin/:userId/pin', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE uzytkownicy SET app_pin_hash=NULL WHERE id=$1', [req.params.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /webauthn/admin/:userId/credentials — admin usuwa wszystkie klucze WebAuthn
router.delete('/admin/:userId/credentials', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM webauthn_credentials WHERE uzytkownik_id=$1', [req.params.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// GET /webauthn/admin/:userId/status — admin sprawdza status użytkownika
router.get('/admin/:userId/status', requireAdmin, async (req, res) => {
  try {
    const [pinResult, credResult] = await Promise.all([
      db.query('SELECT app_pin_hash IS NOT NULL AS ma_pin FROM uzytkownicy WHERE id=$1', [req.params.userId]),
      db.query('SELECT COUNT(*) AS liczba FROM webauthn_credentials WHERE uzytkownik_id=$1', [req.params.userId]),
    ]);
    res.json({
      ma_pin: pinResult.rows[0]?.ma_pin || false,
      liczba_kluczy: parseInt(credResult.rows[0]?.liczba || 0),
    });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

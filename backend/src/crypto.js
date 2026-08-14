import crypto from 'crypto';
import argon2 from 'argon2';

// ── Argon2 (hasła użytkowników) ──────────────────────────────────────────────
const PEPPER = () => {
  const p = process.env.PEPPER || '';
  if (!p) console.warn('OSTRZEŻENIE: PEPPER nie jest ustawiony — hasła są słabiej chronione!');
  return p;
};

export async function hashHaslo(haslo) {
  return argon2.hash(haslo + PEPPER(), {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyHaslo(haslo, hash) {
  return argon2.verify(hash, haslo + PEPPER());
}

// ── Argon2 (backup codes MFA) ────────────────────────────────────────────────
export async function hashBackupCode(code) {
  return argon2.hash(code, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyBackupCode(code, hash) {
  return argon2.verify(hash, code);
}

// ── AES-256-GCM (MFA secret) ─────────────────────────────────────────────────
const MFA_KEY = () => {
  const k = process.env.MFA_ENCRYPTION_KEY;
  if (!k) throw new Error('Brak MFA_ENCRYPTION_KEY w .env');
  return Buffer.from(k, 'hex');
};

export function encryptMfaSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MFA_KEY(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptMfaSecret(stored) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MFA_KEY(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ── Szyfrowanie backupu (AES-256-GCM) ────────────────────────────────────────
const BACKUP_KEY = () => {
  const k = process.env.BACKUP_ENCRYPTION_KEY;
  if (!k) return null;
  const buf = Buffer.from(k, 'hex');
  if (buf.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY musi mieć 64 znaki hex (32 bajty)');
  return buf;
};

export function encryptBackup(jsonString) {
  const key = BACKUP_KEY();
  if (!key) return null; // brak klucza — nie szyfruj
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag: tag.toString('hex'),
    dane: enc.toString('base64'),
  };
}

export function decryptBackup(payload) {
  const key = BACKUP_KEY();
  if (!key) throw new Error('Brak BACKUP_ENCRYPTION_KEY w .env — nie można odszyfrować backupu');
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.authTag, 'hex');
  const enc = Buffer.from(payload.dane, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ── Tokeny reset hasła ────────────────────────────────────────────────────────
export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashResetToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

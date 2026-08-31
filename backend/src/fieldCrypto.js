import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_LENGTH) throw new Error('DATA_ENCRYPTION_KEY musi mieć 64 znaki hex (32 bajty)');
  return key;
}

// Szyfruj pole — zwraca base64 string (IV + ciphertext + tag)
export function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const key = getKey();
  if (!key) return null; // brak klucza — nie szyfruj
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// Deszyfruj pole — zwraca string lub null
export function decryptField(ciphertext) {
  if (!ciphertext) return null;
  const key = getKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}

// HMAC dla wyszukiwania — deterministyczny, nie ujawnia wartości
export function hmacField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const key = getKey();
  if (!key) return null; // brak klucza — brak HMAC
  return crypto.createHmac('sha256', key).update(String(plaintext).toLowerCase().trim()).digest('hex');
}

// Generuj nowy klucz (do użycia przy konfiguracji)
export function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

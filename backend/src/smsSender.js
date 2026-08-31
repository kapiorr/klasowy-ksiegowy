import { SMSAPI } from 'smsapi';

function getClient() {
  const token = process.env.SMSAPI_TOKEN;
  if (!token) return null;
  return new SMSAPI(token);
}

export function smsApiEnabled() {
  return !!process.env.SMSAPI_TOKEN;
}

export async function sendSMS(numer, tresc) {
  const client = getClient();
  if (!client) throw new Error('Brak konfiguracji SMSAPI_TOKEN');

  // Walidacja i formatowanie polskiego numeru
  const cyfry = numer.replace(/\D/g, '');
  // Polskie numery: 9 cyfr (bez prefiksu) lub 48+9 cyfr
  const bez48 = cyfry.startsWith('48') ? cyfry.slice(2) : cyfry;
  if (!/^[4-9]\d{8}$/.test(bez48)) {
    throw new Error(`Nieprawidłowy format polskiego numeru telefonu: ${numer}`);
  }
  const tel = `48${bez48}`;

  // normalize=1 zamienia polskie znaki na łacińskie (więcej znaków w SMS)
  const result = await client.message.sms()
    .to(tel)
    .message(tresc)
    .from(process.env.SMSAPI_FROM || 'Test')
    .normalize(true)
    .execute();

  return result;
}

// Wymuś wysyłkę SMS na konkretny numer (ignoruje sms_powiadomienia)
export async function sendSMSForced(numer, tresc) {
  return sendSMS(numer, tresc);
}

export async function sendSMSToUsers(uzytkownikIds, tresc) {
  if (!smsApiEnabled()) return { wyslano: 0, bledy: [] };

  const db = (await import('./db.js')).default;
  const result = await db.query(
    `SELECT id, telefon, login FROM uzytkownicy
     WHERE id = ANY($1::uuid[]) AND telefon IS NOT NULL AND sms_powiadomienia = TRUE`,
    [uzytkownikIds]
  );

  let wyslano = 0;
  const bledy = [];

  for (const u of result.rows) {
    try {
      await sendSMS(decryptField(u.telefon_enc), tresc);
      wyslano++;
    } catch (e) {
      bledy.push(`${u.login}: ${e.message}`);
    }
  }

  return { wyslano, bledy };
}

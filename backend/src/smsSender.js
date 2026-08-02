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

  // Formatuj numer — wymagany format 48xxxxxxxxx
  const cyfry = numer.replace(/\D/g, '');
  const tel = cyfry.startsWith('48') ? cyfry : `48${cyfry}`;

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
      await sendSMS(u.telefon, tresc);
      wyslano++;
    } catch (e) {
      bledy.push(`${u.login} (${u.telefon}): ${e.message}`);
    }
  }

  return { wyslano, bledy };
}

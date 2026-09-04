import db from './db.js';
import nodemailer from 'nodemailer';

function appInfo() {
  return process.env.CLASS_NAME && process.env.SCHOOL_NAME
    ? `${process.env.CLASS_NAME} — ${process.env.SCHOOL_NAME}`
    : process.env.APP_URL || 'Klasowy Księgowy';
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER,
    port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
    auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
  });
}

function layout(title, body) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h2 style="color:#2c3e50">${title}</h2>${body}
    <hr style="margin-top:30px;border:none;border-top:1px solid #eee">
    <p style="color:#aaa;font-size:11px">${appInfo()}</p>
  </body></html>`;
}

// Generuj i wyślij raport dzienny do adminów którzy mają raport_dzienny=true
export async function sendDailyReport() {
  try {
    // Znajdź adminów z włączonym raportem
    const adminResult = await db.query(`
      SELECT u.id, u.login, u.email_enc
      FROM uzytkownicy u
      JOIN admin_powiadomienia p ON p.uzytkownik_id = u.id
      WHERE u.rola = 'admin' AND p.raport_dzienny = TRUE AND u.email_enc IS NOT NULL
    `);
    if (!adminResult.rows.length) return;

    const { decryptField } = await import('./fieldCrypto.js');
    const admini = adminResult.rows
      .map(r => ({ login: r.login, email: decryptField(r.email_enc) }))
      .filter(r => r.email);
    if (!admini.length) return;

    const dzisiaj = new Date();
    const wczoraj = new Date(dzisiaj.getTime() - 24 * 60 * 60 * 1000);

    const results = await Promise.allSettled([
      // Bezpieczeństwo
      db.query(`
        SELECT akcja, COUNT(*) AS liczba, array_agg(DISTINCT ip) AS ips, array_agg(DISTINCT login_proba) AS loginy
        FROM logi
        WHERE created_at >= $1
          AND akcja IN ('login_fail','login_blocked','mfa_fail','captcha_fail','hibp_wyciekle_haslo','slabe_haslo','honeypot')
        GROUP BY akcja ORDER BY liczba DESC
      `, [wczoraj]),

      // Podejrzane — jeden IP, wiele różnych loginów
      db.query(`
        SELECT ip, COUNT(DISTINCT login_proba) AS rozne_loginy, COUNT(*) AS prob
        FROM logi
        WHERE created_at >= $1
          AND akcja = 'login_fail' AND ip IS NOT NULL AND login_proba IS NOT NULL
        GROUP BY ip HAVING COUNT(DISTINCT login_proba) >= 3
        ORDER BY rozne_loginy DESC LIMIT 10
      `, [wczoraj]),

      // Operacje wrażliwe
      db.query(`
        SELECT akcja, COUNT(*) AS liczba, array_agg(DISTINCT login_proba) AS wykonali
        FROM logi
        WHERE created_at >= $1
          AND akcja IN ('export_backup','import_backup','delete_uzytkownik','edit_uzytkownik',
                        'sesja_uniewaznienie','mailing_skladka','mailing_zaleglosci')
        GROUP BY akcja ORDER BY akcja
      `, [wczoraj]),

      // Logowania poza godzinami 6-22
      db.query(`
        SELECT login_proba AS login, ip, created_at
        FROM logi
        WHERE created_at >= $1
          AND akcja = 'login_ok'
          AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Warsaw') < 6
            OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Warsaw') >= 22)
        ORDER BY created_at
      `, [wczoraj]),

      // Transakcje
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM logi WHERE created_at >= $1 AND akcja = 'login_ok') AS logowan,
          (SELECT COUNT(*) FROM logi WHERE created_at >= $1 AND akcja LIKE 'add_wplata') AS wplat,
          (SELECT COUNT(*) FROM logi WHERE created_at >= $1 AND akcja LIKE 'add_wyplata') AS wyplat,
          (SELECT COUNT(*) FROM wplaty WHERE created_at >= $1) AS wplat_kwota_n,
          (SELECT COALESCE(SUM(kwota),0) FROM wplaty WHERE created_at >= $1) AS suma_wplat
      `, [wczoraj]),
    ]);

    const get = r => r.status === 'fulfilled' ? r.value.rows : [];
    const [bezpieczenstwo, podejrzane, wrazliwe, aktywnosc, transakcje] = results.map(r => ({ rows: get(r) }));

    // Buduj HTML raportu
    const akcjaLabel = {
      login_fail: 'Błędne logowanie', login_blocked: 'Blokada IP', mfa_fail: 'Błędny kod MFA',
      captcha_fail: 'Błędna CAPTCHA', hibp_wyciekle_haslo: 'Wyciekłe hasło', slabe_haslo: 'Słabe hasło',
      export_backup: 'Eksport backupu', import_backup: 'Import backupu',
      delete_uzytkownik: 'Usunięcie użytkownika', edit_uzytkownik: 'Edycja użytkownika',
      sesja_uniewaznienie: 'Unieważnienie sesji', mailing_skladka: 'Mailing składka',
      mailing_zaleglosci: 'Mailing zaległości',
    };

    let html = '';

    // Bezpieczeństwo
    if (bezpieczenstwo.rows.length) {
      html += `<h3 style="color:#c0392b;margin:20px 0 8px">🔐 Bezpieczeństwo</h3><table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8f9fa"><th style="text-align:left;padding:6px 8px;">Zdarzenie</th><th style="text-align:right;padding:6px 8px;">Liczba</th></tr>`;
      for (const r of bezpieczenstwo.rows) {
        html += `<tr><td style="padding:6px 8px;border-top:1px solid #eee">${akcjaLabel[r.akcja] || r.akcja}</td>
          <td style="text-align:right;padding:6px 8px;border-top:1px solid #eee;font-weight:bold">${r.liczba}</td></tr>`;
      }
      html += '</table>';
    }

    // Podejrzane IP
    if (podejrzane.rows.length) {
      html += `<h3 style="color:#e67e22;margin:20px 0 8px">⚠️ Podejrzane IP (≥3 różne loginy)</h3><table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8f9fa"><th style="text-align:left;padding:6px 8px;">IP</th><th style="padding:6px 8px;">Różnych loginów</th><th style="padding:6px 8px;">Prób</th></tr>`;
      for (const r of podejrzane.rows) {
        html += `<tr><td style="padding:6px 8px;border-top:1px solid #eee;font-family:monospace">${r.ip}</td>
          <td style="text-align:center;padding:6px 8px;border-top:1px solid #eee">${r.rozne_loginy}</td>
          <td style="text-align:center;padding:6px 8px;border-top:1px solid #eee">${r.prob}</td></tr>`;
      }
      html += '</table>';
    }

    // Logowania nocne
    if (aktywnosc.rows.length) {
      html += `<h3 style="color:#8e44ad;margin:20px 0 8px">🌙 Logowania poza godzinami (22:00–06:00)</h3><table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8f9fa"><th style="text-align:left;padding:6px 8px;">Użytkownik</th><th style="padding:6px 8px;">Godzina</th><th style="padding:6px 8px;">IP</th></tr>`;
      for (const r of aktywnosc.rows) {
        const czas = new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
        html += `<tr><td style="padding:6px 8px;border-top:1px solid #eee">${r.login || '—'}</td>
          <td style="text-align:center;padding:6px 8px;border-top:1px solid #eee">${czas}</td>
          <td style="font-family:monospace;padding:6px 8px;border-top:1px solid #eee">${r.ip || '—'}</td></tr>`;
      }
      html += '</table>';
    }

    // Operacje wrażliwe
    if (wrazliwe.rows.length) {
      html += `<h3 style="color:#2c3e50;margin:20px 0 8px">💾 Operacje wrażliwe</h3><table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8f9fa"><th style="text-align:left;padding:6px 8px;">Operacja</th><th style="text-align:right;padding:6px 8px;">Liczba</th></tr>`;
      for (const r of wrazliwe.rows) {
        html += `<tr><td style="padding:6px 8px;border-top:1px solid #eee">${akcjaLabel[r.akcja] || r.akcja}</td>
          <td style="text-align:right;padding:6px 8px;border-top:1px solid #eee">${r.liczba}</td></tr>`;
      }
      html += '</table>';
    }

    // Podsumowanie
    const t = transakcje.rows[0];
    html += `<h3 style="color:#27ae60;margin:20px 0 8px">📊 Podsumowanie dnia</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:5px 8px;">Logowań</td><td style="text-align:right;padding:5px 8px;font-weight:bold">${t.logowan}</td></tr>
        <tr style="background:#f8f9fa"><td style="padding:5px 8px;">Nowych wpłat</td><td style="text-align:right;padding:5px 8px;font-weight:bold">${t.wplat}</td></tr>
        <tr><td style="padding:5px 8px;">Nowych wypłat</td><td style="text-align:right;padding:5px 8px;font-weight:bold">${t.wyplat}</td></tr>
        <tr style="background:#f8f9fa"><td style="padding:5px 8px;">Suma wpłat</td><td style="text-align:right;padding:5px 8px;font-weight:bold">${parseFloat(t.suma_wplat).toFixed(2)} zł</td></tr>
      </table>`;

    if (!html) {
      html = '<p style="color:#888">Brak zdarzeń do zgłoszenia. Spokojny dzień 🎉</p>';
    }

    const dataStr = `ostatnie 24h (od ${wczoraj.toLocaleString('pl-PL', {timeZone:'Europe/Warsaw', hour:'2-digit', minute:'2-digit'})})`;
    const body = `<p>Raport aktywności za <strong>${dataStr}</strong>.</p>${html}
      <p style="color:#999;font-size:12px;margin-top:20px;">Możesz wyłączyć ten raport w Ustawieniach → Powiadomienia email.</p>`;

    for (const admin of admini) {
      await getTransport().sendMail({
        from: process.env.EMAIL_FROM,
        to: admin.email,
        subject: `Raport dzienny — ${appInfo()}`,
        html: layout('Raport dzienny — ostatnie 24h', body, '#2c3e50'),
      });
    }

    console.log(`Raport dzienny wysłany do ${admini.length} admin(ów)`);
  } catch (err) {
    console.error('Błąd raportu dziennego:', err.message);
  }
}

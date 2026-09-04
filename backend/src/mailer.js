import nodemailer from 'nodemailer';
import { PASSWORD_REQUIREMENTS_TEXT } from './passwordPolicy.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

let _transport = null;
function getTransport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER,
      port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
      pool: true,
      maxConnections: 5,
    });
  }
  return _transport;
}

function appInfo(html = false) {
  const cls = process.env.CLASS_NAME || '';
  const school = process.env.SCHOOL_NAME || '';
  const sep = html ? ' &bull; ' : ' · ';
  if (cls && school) return `Klasa ${cls}${sep}${school}`;
  if (cls) return `Klasa ${cls}`;
  if (school) return school;
  return 'Klasowy Księgowy';
}

function layout(title, body, color = '#4a8c4a') {
  return `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Naglowek -->
    <div style="background:${color};padding:24px 32px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">Klasowy Księgowy</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:2px;">${appInfo(true)}</div>
    </div>
    <!-- Tytul -->
    <div style="padding:28px 32px 0;">
      <h2 style="margin:0 0 16px;color:#0f1117;font-size:20px;">${title}</h2>
    </div>
    <!-- Tresc -->
    <div style="padding:0 32px 28px;color:#333;font-size:15px;line-height:1.6;">
      ${body}
    </div>
    <!-- Stopka -->
    <div style="padding:16px 32px;background:#f9f8f6;border-top:1px solid #e8e4dc;text-align:center;">
      <div style="color:#aaa;font-size:11px;">${appInfo(true)} &bull; Klasowy Ksiegowy</div>
    </div>
  </div>
</body>
</html>`;
}

function btn(url, text, color = '#4a8c4a') {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="background:${color};color:#fff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">${text}</a>
  </div>`;
}

function PLN(n) {
  return `${parseFloat(n || 0).toFixed(2)} zł`;
}

// ── Reset hasła (zapomniałem hasła)
export async function sendResetEmail(email, token) {
  const url = `${process.env.APP_URL}/reset-hasla?token=${token}`;
  const body = `
    <p>Otrzymaliśmy prośbę o reset hasła do Twojego konta.</p>
    <p>Kliknij przycisk poniżej aby ustawić nowe hasło. Link jest ważny przez <strong>1 godzine</strong>.</p>
    ${btn(url, 'Ustaw nowe haslo')}
    <p style="background:#f8f9fa;border-left:3px solid #666;padding:10px 14px;margin:16px 0;font-size:13px;color:#444;">
      <strong>Wymagania dotyczące hasła:</strong><br>${escapeHtml(PASSWORD_REQUIREMENTS_TEXT)}
    </p>
    <p style="color:#999;font-size:12px;">Jesli nie prosiłeś o reset hasła, zignoruj te wiadomość.</p>
    <p style="color:#ccc;font-size:11px;word-break:break-all;">${url}</p>
  `;
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Reset hasla — ${appInfo()}`,
    html: layout('Reset hasla', body),
  });
}

// ── Mail powitalny z linkiem do ustawienia hasła
export async function sendWelcome(email, login, resetUrl, expiryLabel = '15 minut') {
  const body = `
    <p>Czesc <strong>${escapeHtml(login)}</strong>!</p>
    <p>Zostalo dla Ciebie utworzone konto w aplikacji <strong>Klasowy Ksiegowy</strong>.</p>
    <p>Kliknij przycisk ponizej aby ustawic swoje haslo. Link jest wazny przez <strong>${escapeHtml(expiryLabel)}</strong>.</p>
    ${btn(resetUrl, 'Ustaw haslo')}
    <p style="background:#f8f9fa;border-left:3px solid #666;padding:10px 14px;margin:16px 0;font-size:13px;color:#444;">
      <strong>Wymagania dotyczące hasła:</strong><br>${escapeHtml(PASSWORD_REQUIREMENTS_TEXT)}
    </p>
    <p style="color:#999;font-size:12px;">Jezeli nie spodziewales sie tego maila, zignoruj go.</p>
    <p style="color:#ccc;font-size:11px;word-break:break-all;">${resetUrl}</p>
  `;
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Witaj w Klasowy Ksiegowy — ustaw swoje haslo`,
    html: layout('Witaj!', body),
  });
}

// ── Alert bezpieczeństwa dla admina
// typ: login_fail | login_blocked | mfa_fail | reset_hasla | masowy_mailing | restore_backup | hibp_wyciekle
export async function sendAdminAlert(login, ip, blokady, typ = 'login_blocked') {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  // Sprawdź preferencje — dynamiczny import żeby uniknąć circular
  try {
    const { adminowieDoPowiadomienia } = await import('./routes/powiadomienia.js');
    const adminowie = await adminowieDoPowiadomienia(typ);
    if (!adminowie.length) return; // nikt nie chce tego powiadomienia
  } catch { /* jeśli błąd — wyślij do ADMIN_EMAIL */ }

  const TYPY_LABELS = {
    login_fail: 'Nieudane próby logowania',
    login_blocked: 'Blokada po nieudanych logowaniach',
    mfa_fail: 'Nieudana weryfikacja MFA',
    captcha_fail: 'Błędna odpowiedź CAPTCHA',
    reset_hasla: 'Wysłanie linku resetu hasła',
    masowy_mailing: 'Masowa wysyłka wiadomości',
    restore_backup: 'Przywrócenie backupu',
    hibp_wyciekle: 'Logowanie z wyciekłym hasłem',
    honeypot: '🍯 Trafienie w honeypot (skanowanie)!',
  };

  const tytul = TYPY_LABELS[typ] || 'Alert bezpieczeństwa';
  const info = blokady.map(b =>
    `<li>${escapeHtml(b.typ)}: <strong>${escapeHtml(String(b.wartosc))}</strong>${b.count ? ` (${b.count} prób)` : ''}</li>`
  ).join('');

  const body = `
    <p><strong>${escapeHtml(tytul)}</strong></p>
    <ul style="margin:12px 0;padding-left:20px;">
      ${login ? `<li>Login / Email: <strong>${escapeHtml(login)}</strong></li>` : ''}
      ${ip ? `<li>IP: <strong>${escapeHtml(ip)}</strong></li>` : ''}
      ${info}
    </ul>
    <p style="color:#999;font-size:13px;">Możesz zarządzać alertami w Ustawieniach → Powiadomienia.</p>
  `;

  await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: adminEmail,
    subject: `[Alert] ${tytul} — ${appInfo()}`,
    html: layout(tytul, body, '#c0392b'),
  });
}

// ── Powiadomienie o nowej składce
export async function sendNowaSkladka(email, uczenImie, skladkaNazwa, kwota, termin, opis) {
  const terminTxt = termin ? `<p>Termin platnosci: <strong>${escapeHtml(new Date(termin).toLocaleDateString('pl-PL'))}</strong></p>` : '';
  const opisTxt = opis ? `<p style="color:#555;font-size:14px;margin-top:8px;">${escapeHtml(opis)}</p>` : '';
  const body = `
    <p>Została założona nowa składka dla <strong>${escapeHtml(uczenImie)}</strong>.</p>
    <div style="background:#f0f7f0;border-radius:10px;padding:16px 20px;margin:16px 0;">
      <div style="font-size:16px;font-weight:600;color:#0f1117;">${escapeHtml(skladkaNazwa)}</div>
      ${opisTxt}
      <div style="font-size:22px;font-weight:700;color:#4a8c4a;margin-top:6px;">${PLN(kwota)} do zapłaty</div>
    </div>
    ${terminTxt}
    <p style="color:#999;font-size:13px;">Zaloguj się do aplikacji, aby zobaczyć szczegóły: <a href="${process.env.APP_URL}" style="color:#4a8c4a;">${process.env.APP_URL}</a></p>
  `;
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Nowa składka: ${skladkaNazwa} — ${appInfo()}`,
    html: layout('Nowa składka', body),
  });
}

// ── Przypomnienie o zaległościach
export async function sendZaleglosci(email, uczenImie, zaleglosci) {
  const suma = zaleglosci.reduce((s, z) => s + z.pozostalo, 0);
  const rows = zaleglosci.map(z => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(z.nazwa)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#c05a00;font-weight:600;">${PLN(z.pozostalo)}</td>
    </tr>
  `).join('');
  const body = `
    <p>Przypominamy o zaległościach w platnościach dla <strong>${escapeHtml(uczenImie)}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;border-radius:8px;overflow:hidden;border:1px solid #eee;">
      <thead>
        <tr style="background:#f5f3ee;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#666;">Składka</th>
          <th style="padding:10px 12px;text-align:right;font-size:13px;color:#666;">Pozostało</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#fff3e0;">
          <td style="padding:10px 12px;font-weight:700;">Razem do zapłaty</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#c05a00;font-size:16px;">${PLN(suma)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="color:#999;font-size:13px;">Zaloguj się do aplikacji, aby zobaczyć szczegóły płatności: <a href="${process.env.APP_URL}" style="color:#4a8c4a;">${process.env.APP_URL}</a></p>
  `;
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Przypomnienie o zaleglościach — ${appInfo()}`,
    html: layout('Przypomnienie o zaległościach', body, '#c05a00'),
  });
}

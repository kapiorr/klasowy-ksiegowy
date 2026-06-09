import nodemailer from 'nodemailer';

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER,
    port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });
}

export async function sendResetEmail(email, token) {
  const url = `${process.env.APP_URL}/reset-hasla?token=${token}`;
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Reset hasla - Klasowy Ksiegowy',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Reset hasla</h2>
        <p>Kliknij ponizszy link aby ustawic nowe haslo. Link jest wazny przez <strong>1 godzine</strong>.</p>
        <a href="${url}"
           style="display:inline-block;background:#4a8c4a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
          Ustaw nowe haslo
        </a>
        <p style="color:#666;font-size:12px;">Jesli nie prosiles o reset hasla, zignoruj te wiadomosc.</p>
        <p style="color:#aaa;font-size:11px;">${url}</p>
      </div>
    `,
  });
}

export async function sendWelcome(email, login, resetUrl, expiryLabel = '15 minut') {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Witaj w Klasowy Ksiegowy — ustaw swoje haslo',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0f1117;">Witaj, ${login}!</h2>
        <p>Zostalo dla Ciebie utworzone konto w aplikacji <strong>Klasowy Ksiegowy</strong>.</p>
        <p>Kliknij ponizszy przycisk aby ustawic swoje haslo. Link jest wazny przez <strong>${expiryLabel}</strong>.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background:#4a8c4a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Ustaw haslo
          </a>
        </div>
        <p style="color:#666;font-size:12px;">Jezeli nie spodziewales sie tego maila, zignoruj go.</p>
        <p style="color:#666;font-size:12px;">Link: ${resetUrl}</p>
      </div>
    `,
  });
}

export async function sendAdminAlert(login, ip, blokady) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const info = blokady.map(b => `- ${b.typ}: ${b.wartosc} (${b.count} prob)`).join('\n');
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: adminEmail,
    subject: 'Alert bezpieczenstwa - Klasowy Ksiegowy',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #c0392b;">Alert bezpieczenstwa</h2>
        <p>Wykryto 5 nieudanych prob logowania:</p>
        <ul>
          <li>Login: <strong>${login}</strong></li>
          <li>IP: <strong>${ip}</strong></li>
        </ul>
        <p>Zablokowane:</p>
        <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${info}</pre>
        <p style="color:#666;font-size:12px;">Blokada trwa 1 godzine. Mozesz ja usunac w panelu Logi &gt; Blokady.</p>
      </div>
    `,
  });
}

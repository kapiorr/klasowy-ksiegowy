import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { mailingLimiter } from './limiters.js';
import cookieParser from 'cookie-parser';
import db from './db.js';
import { hashHaslo } from './crypto.js';
import { activityMiddleware, cleanOldLogs, getIP } from './logger.js';
import { requireAuth } from './middleware/auth.js';
import { startScheduler } from './scheduler.js';
import authRouter from './routes/auth.js';
import ucznowieRouter from './routes/ucznowie.js';
import uzytkownicyRouter from './routes/uzytkownicy.js';
import skladkiRouter from './routes/skladki.js';
import wplatyRouter from './routes/wplaty.js';
import wyplatyRouter from './routes/wyplaty.js';
import backupRouter from './routes/backup.js';
import logiRouter from './routes/logi.js';
import statystykiRouter from './routes/statystyki.js';
import raportRouter from './routes/raport.js';
import mailingRouter from './routes/mailing.js';
import pushRouter from './routes/push.js';
import { captchaImage } from './captcha.js';
import { PASSWORD_REQUIREMENTS_TEXT } from './passwordPolicy.js';
import { encryptField, hmacField } from './fieldCrypto.js';
import powiadomieniaRouter from './routes/powiadomienia.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy — aplikacja działa za Cloudflare Tunnel / nginx
app.set('trust proxy', 1);

// Nagłówki bezpieczeństwa
app.use(helmet({
  contentSecurityPolicy: false, // CSP ustawiony przez nginx
  crossOriginEmbedderPolicy: false,
}));

// CORS — tylko z dozwolonej domeny
app.use(cors({
  origin: process.env.APP_URL || false,
  credentials: true, // wymagane dla httpOnly cookie
}));

app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// Globalny rate limit — 200 requestów / 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Za dużo requestów — spróbuj ponownie za chwilę' },
});
app.use(globalLimiter);

// Middleware blokady IP — sprawdza przed każdym requestem
app.use(async (req, res, next) => {
  // Pomijamy health check
  if (req.path === '/api/health') return next();
  const ip = getIP(req);
  try {
    const result = await db.query(
      `SELECT id FROM blokady WHERE typ='ip' AND wartosc=$1
       AND (zablokowany_do IS NULL OR zablokowany_do > NOW())`,
      [ip]
    );
    if (result.rows.length > 0) {
      return res.status(403).json({ blocked: true, error: 'Adres IP jest zablokowany' });
    }
  } catch {
    return res.status(503).json({ error: 'Błąd serwera — spróbuj ponownie' });
  }
  next();
});

// Middleware aktywności (przed routerami)
app.use(activityMiddleware);


// GET /api/info — publiczne info o klasie (strona logowania)
app.get('/api/info', (req, res) => {
  res.json({
    class_name: process.env.CLASS_NAME || null,
    school_name: process.env.SCHOOL_NAME || null,
  });
});

// GET /api/config — ustawienia aplikacji (wymaga autoryzacji)
app.get('/api/config', requireAuth, (req, res) => {
  res.json({
    payment_account: process.env.PAYMENT_ACCOUNT || null,
    payment_phone: process.env.PAYMENT_PHONE || null,
  });
});

app.get('/api/captcha/image', captchaImage);
app.get('/api/config', (req, res) => {
  res.json({
    sms_enabled: !!process.env.SMSAPI_TOKEN,
    password_requirements: PASSWORD_REQUIREMENTS_TEXT,
  });
});
app.use('/api/auth', authRouter);
app.use('/api/ucznowie', ucznowieRouter);
app.use('/api/uzytkownicy', uzytkownicyRouter);
app.use('/api/skladki', skladkiRouter);
app.use('/api/wplaty', wplatyRouter);
app.use('/api/wyplaty', wyplatyRouter);
app.use('/api/backup', backupRouter);
app.use('/api/logi', logiRouter);
app.use('/api/statystyki', statystykiRouter);
app.use('/api/raport', raportRouter);
app.use('/api/mailing', mailingRouter);
app.use('/api/push', mailingLimiter, pushRouter);
app.use('/api/powiadomienia', powiadomieniaRouter);

// Globalny error handler — łapie nieobsłużone wyjątki z async handlerów
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
});

// Walidacja wymaganych zmiennych środowiskowych
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL', 'PEPPER', 'MFA_ENCRYPTION_KEY', 'APP_URL'];
const OPTIONAL_CRYPTO_ENV = ['DATA_ENCRYPTION_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`BŁĄD: Brak wymaganej zmiennej środowiskowej: ${key}`);
    process.exit(1);
  }
}
if (!process.env.DATA_ENCRYPTION_KEY) {
  console.warn('UWAGA: DATA_ENCRYPTION_KEY nie jest ustawiony — emaile i telefony nie będą szyfrowane');
}

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Endpoint sprawdzający blokadę IP — wywoływany przy starcie frontendu
app.get('/api/check-ip', async (req, res) => {
  const ip = getIP(req);
  try {
    const result = await db.query(
      `SELECT id FROM blokady WHERE typ='ip' AND wartosc=$1
       AND (zablokowany_do IS NULL OR zablokowany_do > NOW())`,
      [ip]
    );
    res.json({ blocked: result.rows.length > 0 });
  } catch {
    res.status(503).json({ blocked: false, error: 'Błąd serwera' });
  }
});

async function migrate() {
  // Advisory lock — zapobiega race condition przy wielu instancjach
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock(12345678)');
    // Dodaj brakujące kolumny jeśli nie istnieją (bezpieczne przy każdym starcie)
  const migrations = [
    `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`,
    `ALTER TABLE ucznowie ADD COLUMN IF NOT EXISTS aktywny BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE skladki ADD COLUMN IF NOT EXISTS kolejnosc INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_wplaty_skladka_id ON wplaty(skladka_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wplaty_uczen_id ON wplaty(uczen_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wyplaty_skladka_id ON wyplaty(skladka_id)`,
    `CREATE INDEX IF NOT EXISTS idx_skladka_ucznowie_skladka ON skladka_ucznowie(skladka_id)`,
    `CREATE INDEX IF NOT EXISTS idx_skladka_ucznowie_uczen ON skladka_ucznowie(uczen_id)`,
    `CREATE INDEX IF NOT EXISTS idx_logi_created_at ON logi(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_logi_uzytkownik ON logi(uzytkownik_id)`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS sessions_invalidated_at TIMESTAMPTZ`,
    // Zawsze aktualizuj constraint roli — bezpieczne bo DROP IF EXISTS
    `ALTER TABLE uzytkownicy DROP CONSTRAINT IF EXISTS uzytkownicy_rola_check`,
    `ALTER TABLE uzytkownicy ADD CONSTRAINT uzytkownicy_rola_check
       CHECK (rola IN ('admin', 'ksiegowy', 'podglad', 'podglad_pelny'))`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS imie VARCHAR(100)`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS nazwisko VARCHAR(100)`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS awaiting_password_reset BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS mfa_secret TEXT`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[]`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS mfa_wymuszone BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS email VARCHAR(200)`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS telefon VARCHAR(30)`,
    `CREATE TABLE IF NOT EXISTS wyplaty_zalaczniki (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       wyplata_id UUID NOT NULL REFERENCES wyplaty(id) ON DELETE CASCADE,
       nazwa VARCHAR(500) NOT NULL,
       typ VARCHAR(100) NOT NULL,
       dane BYTEA NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS wyplaty_zalaczniki_wyplata_idx ON wyplaty_zalaczniki (wyplata_id)`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       uzytkownik_id UUID NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
       subscription JSONB NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_unique_endpoint
     ON push_subscriptions (uzytkownik_id, (subscription->>'endpoint'))`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS sms_powiadomienia BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS pomijaj_hibp BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE admin_powiadomienia ADD COLUMN IF NOT EXISTS captcha_fail BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE admin_powiadomienia ADD COLUMN IF NOT EXISTS raport_dzienny BOOLEAN NOT NULL DEFAULT FALSE`,
    `CREATE TABLE IF NOT EXISTS hibp_logi (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       wycieklo BOOLEAN NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,

    `CREATE TABLE IF NOT EXISTS admin_powiadomienia (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       uzytkownik_id UUID NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE UNIQUE,
       login_fail BOOLEAN NOT NULL DEFAULT TRUE,
       login_blocked BOOLEAN NOT NULL DEFAULT TRUE,
       mfa_fail BOOLEAN NOT NULL DEFAULT TRUE,
       reset_hasla BOOLEAN NOT NULL DEFAULT TRUE,
       masowy_mailing BOOLEAN NOT NULL DEFAULT TRUE,
       restore_backup BOOLEAN NOT NULL DEFAULT TRUE,
       hibp_wyciekle BOOLEAN NOT NULL DEFAULT TRUE,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS hibp_wycieklo BOOLEAN`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS haslo_slabe BOOLEAN`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS email_enc TEXT`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS email_hmac VARCHAR(64)`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS telefon_enc TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uzytkownicy_email_hmac_idx ON uzytkownicy (email_hmac) WHERE email_hmac IS NOT NULL`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS haslo_slabe_dismissed_at TIMESTAMPTZ`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS hibp_sprawdzono_at TIMESTAMPTZ`,
    `ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS hibp_dismissed_at TIMESTAMPTZ`,
    `ALTER TABLE wyplaty DROP COLUMN IF EXISTS zalacznik_nazwa`,
    `ALTER TABLE wyplaty DROP COLUMN IF EXISTS zalacznik_dane`,
    `ALTER TABLE wyplaty DROP COLUMN IF EXISTS zalacznik_typ`,

    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'uzytkownicy_email_unique'
       ) THEN
         ALTER TABLE uzytkownicy ADD CONSTRAINT uzytkownicy_email_unique UNIQUE (email);
       END IF;
     END $$`,
    `CREATE TABLE IF NOT EXISTS tokeny_reset (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      uzytkownik_id UUID NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      wygasa_o TIMESTAMPTZ NOT NULL,
      wykorzystany BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS logi (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      uzytkownik_id UUID REFERENCES uzytkownicy(id) ON DELETE SET NULL,
      login_proba VARCHAR(100),
      ip VARCHAR(64),
      akcja VARCHAR(100) NOT NULL,
      zasob VARCHAR(200),
      szczegoly TEXT,
      sukces BOOLEAN NOT NULL DEFAULT TRUE
    )`,
    `CREATE INDEX IF NOT EXISTS logi_created_at_idx ON logi (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS logi_uzytkownik_idx ON logi (uzytkownik_id)`,
    `CREATE INDEX IF NOT EXISTS logi_ip_idx ON logi (ip)`,
    // Odśwież widok wplaty_summary (dodaj kolumnę aktywny) — DROP+CREATE bo zmienia się struktura
    `DROP VIEW IF EXISTS wplaty_summary`,
    `CREATE VIEW wplaty_summary AS
     SELECT
       su.skladka_id,
       u.id AS uczen_id,
       u.imie,
       u.nazwisko,
       u.aktywny,
       s.kwota_na_osobe,
       COALESCE(SUM(w.kwota), 0) AS wplacono,
       s.kwota_na_osobe - COALESCE(SUM(w.kwota), 0) AS pozostalo
     FROM skladka_ucznowie su
     JOIN ucznowie u ON u.id = su.uczen_id
     JOIN skladki s ON s.id = su.skladka_id
     LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = u.id
     GROUP BY su.skladka_id, u.id, u.imie, u.nazwisko, u.aktywny, s.kwota_na_osobe`,
    `CREATE TABLE IF NOT EXISTS blokady (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      typ VARCHAR(20) NOT NULL CHECK (typ IN ('login', 'ip')),
      wartosc VARCHAR(200) NOT NULL,
      powod TEXT,
      zablokowany_do TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (typ, wartosc)
    )`,
  ];
  for (const sql of migrations) {
    try {
      await client.query(sql);
    } catch (err) {
      console.error('Migracja blad:', err.message.split('\n')[0]);
    }
  }
  // Zaktualizuj konto ADMIN_LOGIN z ksiegowy na admin jeśli istnieje
  const adminLogin = process.env.ADMIN_LOGIN;
  if (adminLogin) {
    const updated = await client.query(
      "UPDATE uzytkownicy SET rola='admin' WHERE login=$1 AND rola='ksiegowy' RETURNING login",
      [adminLogin]
    );
    if (updated.rowCount > 0) {
      console.log(`Zaktualizowano role konta "${adminLogin}": ksiegowy -> admin`);
    }
  }
  console.log('Migracje zakonczone');

  // Szyfruj istniejące emaile i telefony jeśli DATA_ENCRYPTION_KEY jest ustawiony
  if (process.env.DATA_ENCRYPTION_KEY) {
    // Migracja szyfrowania — tylko jeśli kolumny email/telefon jeszcze istnieją
    // (po ich usunięciu ten blok jest bezpieczny — zapytanie zwróci błąd który jest ignorowany)
    const rows = await client.query(
      `SELECT id, email_enc, telefon_enc FROM uzytkownicy WHERE email_enc IS NULL LIMIT 0`
    ).then(() => ({ rows: [] })).catch(() => ({ rows: [] }));
    for (const row of rows.rows) {
      await client.query(
        'UPDATE uzytkownicy SET email_enc=$1, email_hmac=$2, telefon_enc=$3 WHERE id=$4',
        [encryptField(row.email), hmacField(row.email), encryptField(row.telefon), row.id]
      );
    }
    if (rows.rows.length > 0) {
      console.log(`Zaszyfrowano dane ${rows.rows.length} użytkowników`);
    }
  }
  } finally {
    await client.query('SELECT pg_advisory_unlock(12345678)');
    client.release();
  }
}

async function waitForDb(retries = 10, delay = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await db.query('SELECT 1');
      console.log('Polaczenie z baza danych OK');
      return;
    } catch {
      console.log(`Czekam na baze danych... (${i}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Nie mozna polaczyc sie z baza danych');
}

async function seedAdmin() {
  const login = process.env.ADMIN_LOGIN;
  const haslo = process.env.ADMIN_HASLO;
  if (!login || !haslo) return;
  const existing = await db.query('SELECT id, rola FROM uzytkownicy WHERE login=$1', [login]);
  if (existing.rows.length > 0) {
    if (existing.rows[0].rola !== 'admin') {
      await db.query("UPDATE uzytkownicy SET rola='admin' WHERE login=$1", [login]);
      console.log('Zaktualizowano role konta ' + login + ' na admin');
    }
    return;
  }
  const haslo_hash = await hashHaslo(haslo);
  await db.query('INSERT INTO uzytkownicy (login, haslo_hash, rola) VALUES ($1,$2,$3)', [login, haslo_hash, 'admin']);
  console.log('Utworzono konto admin: ' + login);
}

app.listen(PORT, async () => {
  console.log(`Backend dziala na porcie ${PORT}`);
  try {
    await waitForDb();
    await migrate();
    await seedAdmin();
    // Cron: czyszczenie logów co 24h
    setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);
    // Uruchom od razu przy starcie
    await cleanOldLogs();
    // Cron: automatyczny backup o 5:00
    startScheduler();
  } catch (err) {
    console.error('Blad inicjalizacji:', err.message);
    process.exit(1);
  }
});

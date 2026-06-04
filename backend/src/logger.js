import db from './db.js';

// Zapisz log do bazy
export async function log({ uzytkownik_id = null, login_proba = null, ip = null, akcja, zasob = null, szczegoly = null, sukces = true }) {
  try {
    await db.query(
      `INSERT INTO logi (uzytkownik_id, login_proba, ip, akcja, zasob, szczegoly, sukces)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uzytkownik_id || null, login_proba || null, ip || null, akcja, zasob || null, szczegoly || null, sukces]
    );
  } catch (err) {
    console.error('Logger error:', err.message);
  }
}

// Normalizuj IPv4-mapped IPv6 (::ffff:1.2.3.4 -> 1.2.3.4)
function normalizeIP(ip) {
  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

// Pobierz IP z requesta (uwzględnia Cloudflare i lokalne połączenia)
export function getIP(req) {
  const raw =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown';
  return normalizeIP(raw);
}

// Sprawdź czy login lub IP jest zablokowany
export async function isBlocked(login, ip) {
  const result = await db.query(
    `SELECT * FROM blokady
     WHERE (typ='login' AND wartosc=$1) OR (typ='ip' AND wartosc=$2)
     AND (zablokowany_do IS NULL OR zablokowany_do > NOW())`,
    [login, ip]
  );
  return result.rows;
}

// Sprawdź liczbę nieudanych prób i ewentualnie zablokuj
export async function checkFailedLogins(login, ip) {
  const okno = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // ostatnie 15 minut

  const [loginFails, ipFails] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FROM logi
       WHERE akcja='login_fail' AND login_proba=$1 AND created_at > $2`,
      [login, okno]
    ),
    db.query(
      `SELECT COUNT(*) FROM logi
       WHERE akcja='login_fail' AND ip=$1 AND created_at > $2`,
      [ip, okno]
    ),
  ]);

  const loginCount = parseInt(loginFails.rows[0].count);
  const ipCount = parseInt(ipFails.rows[0].count);

  const blokady = [];

  if (loginCount >= 5) {
    await db.query(
      `INSERT INTO blokady (typ, wartosc, powod, zablokowany_do)
       VALUES ('login', $1, $2, NOW() + INTERVAL '1 hour')
       ON CONFLICT (typ, wartosc) DO UPDATE SET powod=EXCLUDED.powod, zablokowany_do=EXCLUDED.zablokowany_do`,
      [login, `${loginCount} nieudanych prob logowania w ciagu 15 minut`]
    );
    blokady.push({ typ: 'login', wartosc: login, count: loginCount });
  }

  if (ipCount >= 5) {
    await db.query(
      `INSERT INTO blokady (typ, wartosc, powod, zablokowany_do)
       VALUES ('ip', $1, $2, NOW() + INTERVAL '1 hour')
       ON CONFLICT (typ, wartosc) DO UPDATE SET powod=EXCLUDED.powod, zablokowany_do=EXCLUDED.zablokowany_do`,
      [ip, `${ipCount} nieudanych prob logowania z tego IP w ciagu 15 minut`]
    );
    blokady.push({ typ: 'ip', wartosc: ip, count: ipCount });
  }

  return blokady;
}

// Middleware logujący requesty (tylko wybrane akcje)
// Logujemy tylko modyfikacje i eksporty — GET-y pomijamy żeby nie zaśmiecać logów
// (logowania są obsługiwane bezpośrednio w auth.js)
const AKCJE_MAP = {
  // wplaty, wyplaty, ucznowie, skladki, uzytkownicy — logowane bezpośrednio w routach (ze szczegółami)
  'GET /api/backup': 'export_backup',
  'POST /api/backup/restore': 'import_backup',
  'GET /api/backup/skladka/': 'export_skladka_backup',
  'POST /api/backup/skladka/restore': 'import_skladka_backup',
  'POST /api/ucznowie/import-csv': 'import_ucznowie_csv',
  'POST /api/uzytkownicy/import-csv': 'import_uzytkownicy_csv',
};

function matchAkcja(method, path) {
  const key = `${method} ${path}`;
  if (AKCJE_MAP[key]) return AKCJE_MAP[key];
  // Sprawdź prefiksy
  for (const [pattern, akcja] of Object.entries(AKCJE_MAP)) {
    if (pattern.endsWith('/') && key.startsWith(pattern.slice(0, -1))) return akcja;
  }
  return null;
}

export function activityMiddleware(req, res, next) {
  // Użyj originalUrl (pełna ścieżka) zamiast path (relatywna do routera)
  const urlPath = req.originalUrl.split('?')[0]; // odetnij query string
  const akcja = matchAkcja(req.method, urlPath);
  if (!akcja) return next();

  // Flaga zapobiegająca podwójnemu logowaniu (np. przy przekierowaniach)
  let logged = false;

  res.on('finish', () => {
    if (logged || !req.user) return;
    logged = true;
    const sukces = res.statusCode < 400;
    log({
      uzytkownik_id: req.user.id,
      ip: getIP(req),
      akcja,
      zasob: urlPath,
      szczegoly: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
      sukces,
    });
  });

  next();
}

// Czyszczenie logów starszych niż 30 dni
export async function cleanOldLogs() {
  try {
    const result = await db.query(
      `DELETE FROM logi WHERE created_at < NOW() - INTERVAL '30 days'`
    );
    if (result.rowCount > 0) {
      console.log(`Usunieto ${result.rowCount} starych logow`);
    }
  } catch (err) {
    console.error('Blad czyszczenia logow:', err.message);
  }
}

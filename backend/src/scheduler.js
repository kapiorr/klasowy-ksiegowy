import fs from 'fs';
import path from 'path';
import db from './db.js';

const BACKUP_DIR = '/app/backups';
const MAX_BACKUPS = 7;

async function generateBackup() {
  const [ucznowie, skladki, skladkaUcznowie, wplaty, wyplatyRaw, uzytkownicy] = await Promise.all([
    db.query('SELECT * FROM ucznowie ORDER BY created_at'),
    db.query('SELECT * FROM skladki ORDER BY created_at'),
    db.query('SELECT * FROM skladka_ucznowie'),
    db.query('SELECT * FROM wplaty ORDER BY created_at'),
    db.query('SELECT id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, zalacznik_dane, created_at FROM wyplaty ORDER BY created_at'),
    db.query('SELECT id, login, imie, nazwisko, rola, email, created_at FROM uzytkownicy ORDER BY created_at'),
  ]);

  const wyplaty = wyplatyRaw.rows.map(w => ({
    ...w,
    zalacznik_dane: w.zalacznik_dane ? w.zalacznik_dane.toString('base64') : null,
  }));

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    data: {
      ucznowie: ucznowie.rows,
      skladki: skladki.rows,
      skladka_ucznowie: skladkaUcznowie.rows,
      wplaty: wplaty.rows,
      wyplaty,
      uzytkownicy: uzytkownicy.rows,
    },
  };
}

function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort() // sortowanie alfabetyczne = chronologiczne dla formatu backup-YYYY-MM-DD
    .reverse(); // najnowsze pierwsze

  // Usuń stare powyżej limitu
  const toDelete = files.slice(MAX_BACKUPS);
  toDelete.forEach(f => {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`Usunieto stary backup: ${f}`);
  });
}

async function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const now = new Date();
    const datestamp = now.toISOString().replace(/T.*/, ''); // YYYY-MM-DD
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `backup-${datestamp}_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    console.log(`Generowanie backupu: ${filename}`);
    const backup = await generateBackup();
    fs.writeFileSync(filepath, JSON.stringify(backup));
    console.log(`Backup zapisany: ${filepath} (${(fs.statSync(filepath).size / 1024).toFixed(1)} KB)`);

    cleanOldBackups();
  } catch (err) {
    console.error('Blad backupu:', err.message);
  }
}

// Zaplanuj backup codziennie o BACKUP_HOUR
function scheduleDaily() {
  const hour = parseInt(process.env.BACKUP_HOUR ?? '5');
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;
  console.log(`Nastepny backup zaplanowany na: ${next.toLocaleString('pl-PL')} (za ${Math.round(delay / 60000)} min)`);

  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000); // co 24h
  }, delay);
}

export function startScheduler() {
  scheduleDaily();
}

export { runBackup };

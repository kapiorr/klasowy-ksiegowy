import fs from 'fs';
import path from 'path';
import db from './db.js';
import { encryptBackup } from './crypto.js';

const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';

// Poziomy retencji:
// daily   — codzienne, trzymane 7 dni
// weekly  — tygodniowe (poniedziałek), trzymane 26 tygodni (6 mies.)
// monthly — miesięczne (1. dzień miesiąca), trzymane 12 miesięcy
// yearly  — roczne (1 stycznia), trzymane 8 lat

const RETENTION = {
  daily:   7,
  weekly:  26,
  monthly: 12,
  yearly:  8,
};

async function generateBackup() {
  const [ucznowie, skladki, skladkaUcznowie, wplaty, wyplatyRaw, uzytkownicy, wyplatyZalaczniki] = await Promise.all([
    db.query('SELECT * FROM ucznowie ORDER BY created_at'),
    db.query('SELECT * FROM skladki ORDER BY created_at'),
    db.query('SELECT * FROM skladka_ucznowie'),
    db.query('SELECT * FROM wplaty ORDER BY created_at'),
    db.query('SELECT id, skladka_id, kwota, opis, data, created_at FROM wyplaty ORDER BY created_at'),
    db.query('SELECT id, login, haslo_hash, imie, nazwisko, rola, email, telefon, sms_powiadomienia, uczen_id, mfa_secret, mfa_enabled, mfa_backup_codes, mfa_wymuszone, force_password_change, awaiting_password_reset, sessions_invalidated_at, created_at FROM uzytkownicy ORDER BY created_at'),
    db.query(`SELECT id, wyplata_id, nazwa, typ, encode(dane, 'base64') AS dane_b64, created_at FROM wyplaty_zalaczniki ORDER BY created_at`),
  ]);

  const wyplaty = wyplatyRaw.rows;

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
      wyplaty_zalaczniki: wyplatyZalaczniki.rows,
    },
  };
}

// Zwraca typ backupu dla danej daty
function backupType(now) {
  const d = now.getDate();
  const m = now.getMonth(); // 0=styczeń
  const dow = now.getDay(); // 0=niedziela, 1=poniedziałek

  if (d === 1 && m === 0) return 'yearly';   // 1 stycznia
  if (d === 1)            return 'monthly';  // 1. dzień miesiąca
  if (dow === 1)          return 'weekly';   // poniedziałek
  return 'daily';
}

function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const all = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));

  for (const [type, keep] of Object.entries(RETENTION)) {
    const prefix = `backup-${type}-`;
    const files = all
      .filter(f => f.startsWith(prefix))
      .sort()
      .reverse(); // najnowsze pierwsze

    const toDelete = files.slice(keep);
    toDelete.forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`Usunieto stary backup (${type}): ${f}`);
    });
  }

  // Usuń stare backupy bez prefiksu typu (format sprzed migracji)
  all
    .filter(f => f.startsWith('backup-') && !Object.keys(RETENTION).some(t => f.startsWith(`backup-${t}-`)))
    .forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`Usunieto stary backup (legacy): ${f}`);
    });
}

let isRunning = false;

export async function runBackup(now = new Date()) {
  if (isRunning) { console.log('Backup już trwa — pomijam'); return; }
  isRunning = true;
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const type = backupType(now);
    const datestamp = now.toISOString().replace(/T.*/, ''); // YYYY-MM-DD
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `backup-${type}-${datestamp}_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    console.log(`Generowanie backupu (${type}): ${filename}`);
    const backup = await generateBackup();
    const encrypted = encryptBackup(JSON.stringify(backup));
    const output = encrypted ?? backup;
    fs.writeFileSync(filepath, JSON.stringify(output));
    console.log(`Backup zapisany: ${filepath} (${(fs.statSync(filepath).size / 1024).toFixed(1)} KB)`);

    cleanOldBackups();
  } catch (err) {
    console.error('Blad backupu:', err.message);
  } finally {
    isRunning = false;
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
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, delay);
}

export function startScheduler() {
  scheduleDaily();
}

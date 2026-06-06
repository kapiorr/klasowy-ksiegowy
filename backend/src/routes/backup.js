import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { runBackup } from '../scheduler.js';

const BACKUP_DIR = '/app/backups';
import { validateFile } from '../filecheck.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /backup
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [ucznowie, skladki, skladkaUcznowie, wplaty, wyplatyRaw, uzytkownicy] = await Promise.all([
      db.query('SELECT * FROM ucznowie ORDER BY created_at'),
      db.query('SELECT * FROM skladki ORDER BY created_at'),
      db.query('SELECT * FROM skladka_ucznowie'),
      db.query('SELECT * FROM wplaty ORDER BY created_at'),
      db.query('SELECT id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, zalacznik_dane, created_at FROM wyplaty ORDER BY created_at'),
      db.query('SELECT id, login, haslo_hash, imie, nazwisko, rola, email, uczen_id, mfa_secret, mfa_enabled, mfa_backup_codes, mfa_wymuszone, force_password_change, awaiting_password_reset, sessions_invalidated_at, created_at FROM uzytkownicy ORDER BY created_at'),
    ]);

    const wyplaty = wyplatyRaw.rows.map(w => ({
      ...w,
      zalacznik_dane: w.zalacznik_dane ? w.zalacznik_dane.toString('base64') : null,
    }));

    const backup = {
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

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd eksportu' });
  }
});

// POST /backup/restore
router.post('/restore', requireAdmin, async (req, res) => {
  const client = await db.connect();
  try {
    const payload = req.body;
    if (payload.version !== 1) {
      return res.status(400).json({ error: 'Nieznana wersja backupu' });
    }
    const { ucznowie, skladki, skladka_ucznowie, wplaty, wyplaty, uzytkownicy } = payload.data;

    await client.query('BEGIN');
    await client.query('DELETE FROM wyplaty');
    await client.query('DELETE FROM wplaty');
    await client.query('DELETE FROM skladka_ucznowie');
    await client.query('DELETE FROM skladki');
    await client.query('DELETE FROM uzytkownicy');
    await client.query('DELETE FROM ucznowie');

    for (const r of ucznowie) {
      await client.query('INSERT INTO ucznowie (id, imie, nazwisko, aktywny, created_at) VALUES ($1,$2,$3,$4,$5)',
        [r.id, r.imie, r.nazwisko, r.aktywny !== false, r.created_at]);
    }
    for (const r of skladki) {
      await client.query('INSERT INTO skladki (id, nazwa, kwota_na_osobe, termin, opis, status, kolejnosc, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
        [r.id, r.nazwa, r.kwota_na_osobe, r.termin, r.opis, r.status || 'aktywna', r.kolejnosc || 0, r.created_at]);
    }
    for (const r of skladka_ucznowie) {
      await client.query('INSERT INTO skladka_ucznowie (skladka_id, uczen_id) VALUES ($1,$2)',
        [r.skladka_id, r.uczen_id]);
    }
    for (const r of wplaty) {
      await client.query('INSERT INTO wplaty (id, skladka_id, uczen_id, kwota, data, notatka, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [r.id, r.skladka_id, r.uczen_id, r.kwota, r.data, r.notatka, r.created_at]);
    }
    for (const r of wyplaty) {
      const dane = r.zalacznik_dane ? Buffer.from(r.zalacznik_dane, 'base64') : null;
      await client.query('INSERT INTO wyplaty (id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, zalacznik_dane, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [r.id, r.skladka_id, r.kwota, r.opis, r.data, r.zalacznik_nazwa, r.zalacznik_typ, dane, r.created_at]);
    }
    for (const r of uzytkownicy) {
      await client.query(
        `INSERT INTO uzytkownicy
           (id, login, haslo_hash, imie, nazwisko, rola, email, uczen_id,
            mfa_secret, mfa_enabled, mfa_backup_codes, mfa_wymuszone,
            force_password_change, awaiting_password_reset, sessions_invalidated_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           haslo_hash = EXCLUDED.haslo_hash,
           rola = EXCLUDED.rola,
           email = EXCLUDED.email,
           imie = EXCLUDED.imie,
           nazwisko = EXCLUDED.nazwisko,
           mfa_secret = EXCLUDED.mfa_secret,
           mfa_enabled = EXCLUDED.mfa_enabled,
           mfa_backup_codes = EXCLUDED.mfa_backup_codes,
           mfa_wymuszone = EXCLUDED.mfa_wymuszone,
           force_password_change = EXCLUDED.force_password_change,
           awaiting_password_reset = EXCLUDED.awaiting_password_reset`,
        [r.id, r.login, r.haslo_hash, r.imie || null, r.nazwisko || null,
         r.rola, r.email || null, r.uczen_id || null,
         r.mfa_secret || null, r.mfa_enabled || false,
         r.mfa_backup_codes || null, r.mfa_wymuszone || false,
         r.force_password_change || false, r.awaiting_password_reset || false,
         r.sessions_invalidated_at || null, r.created_at]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Backup wgrany pomyślnie' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd importu: ' + err.message });
  } finally {
    client.release();
  }
});

// GET /backup/config — konfiguracja backupu
router.get('/config', requireAdmin, (req, res) => {
  res.json({ backup_hour: parseInt(process.env.BACKUP_HOUR ?? '5') });
});

// GET /backup/auto — lista automatycznych backupów
router.get('/auto', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort().reverse()
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { nazwa: f, rozmiar: stat.size, created_at: stat.mtime };
      });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /backup/auto/:nazwa — pobierz konkretny backup
router.get('/auto/:nazwa', requireAdmin, (req, res) => {
  const nazwa = path.basename(req.params.nazwa); // zabezpieczenie przed path traversal
  const filepath = path.join(BACKUP_DIR, nazwa);
  if (!fs.existsSync(filepath) || !nazwa.startsWith('backup-')) {
    return res.status(404).json({ error: 'Nie znaleziono' });
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${nazwa}"`);
  res.sendFile(filepath);
});

// POST /backup/auto/run — uruchom backup ręcznie
router.post('/auto/run', requireAdmin, async (req, res) => {
  try {
    await runBackup();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

// GET /backup/skladka/:id — eksport pojedynczej składki
router.get('/skladka/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [skladka, skladkaUcznowie, wplaty, wyplatyRaw] = await Promise.all([
      db.query('SELECT * FROM skladki WHERE id=$1', [id]),
      db.query('SELECT * FROM skladka_ucznowie WHERE skladka_id=$1', [id]),
      db.query('SELECT * FROM wplaty WHERE skladka_id=$1 ORDER BY created_at', [id]),
      db.query(
        'SELECT id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, zalacznik_dane, created_at FROM wyplaty WHERE skladka_id=$1 ORDER BY created_at',
        [id]
      ),
    ]);

    if (!skladka.rows[0]) return res.status(404).json({ error: 'Nie znaleziono składki' });

    // Pobierz uczniów powiązanych ze składką
    const uczenIds = skladkaUcznowie.rows.map(r => r.uczen_id);
    const ucznowie = uczenIds.length > 0
      ? await db.query('SELECT * FROM ucznowie WHERE id = ANY($1)', [uczenIds])
      : { rows: [] };

    const wyplaty = wyplatyRaw.rows.map(w => ({
      ...w,
      zalacznik_dane: w.zalacznik_dane ? w.zalacznik_dane.toString('base64') : null,
    }));

    const backup = {
      version: 1,
      type: 'skladka',
      exported_at: new Date().toISOString(),
      data: {
        skladka: skladka.rows[0],
        ucznowie: ucznowie.rows,
        skladka_ucznowie: skladkaUcznowie.rows,
        wplaty: wplaty.rows,
        wyplaty,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="skladka-${skladka.rows[0].nazwa.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd eksportu' });
  }
});

// POST /backup/skladka/restore — import składki
router.post('/skladka/restore', requireAdmin, async (req, res) => {
  const client = await db.connect();
  try {
    const payload = req.body;
    if (payload.version !== 1 || payload.type !== 'skladka') {
      return res.status(400).json({ error: 'Nieprawidłowy format backupu składki' });
    }
    const { skladka, ucznowie, skladka_ucznowie, wplaty, wyplaty } = payload.data;

    await client.query('BEGIN');

    // Wstaw składkę (nowe UUID aby uniknąć konfliktów)
    const newSkladka = await client.query(
      `INSERT INTO skladki (id, nazwa, kwota_na_osobe, termin, opis, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET nazwa=EXCLUDED.nazwa
       RETURNING id`,
      [skladka.id, skladka.nazwa, skladka.kwota_na_osobe, skladka.termin, skladka.opis, skladka.status, skladka.created_at]
    );
    const skladkaId = newSkladka.rows[0].id;

    // Wstaw uczniów (ON CONFLICT DO NOTHING — mogą już istnieć)
    for (const u of ucznowie) {
      await client.query(
        'INSERT INTO ucznowie (id, imie, nazwisko, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
        [u.id, u.imie, u.nazwisko, u.created_at]
      );
    }

    // Przypisania uczniów do składki
    for (const su of skladka_ucznowie) {
      await client.query(
        'INSERT INTO skladka_ucznowie (skladka_id, uczen_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [skladkaId, su.uczen_id]
      );
    }

    // Wpłaty
    for (const w of wplaty) {
      await client.query(
        `INSERT INTO wplaty (id, skladka_id, uczen_id, kwota, data, notatka, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [w.id, skladkaId, w.uczen_id, w.kwota, w.data, w.notatka, w.created_at]
      );
    }

    // Wypłaty
    for (const w of wyplaty) {
      const dane = w.zalacznik_dane ? Buffer.from(w.zalacznik_dane, 'base64') : null;
      await client.query(
        `INSERT INTO wyplaty (id, skladka_id, kwota, opis, data, zalacznik_nazwa, zalacznik_typ, zalacznik_dane, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [w.id, skladkaId, w.kwota, w.opis, w.data, w.zalacznik_nazwa, w.zalacznik_typ, dane, w.created_at]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: `Składka "${skladka.nazwa}" została przywrócona` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd importu: ' + err.message });
  } finally {
    client.release();
  }
});

import { Router } from 'express';
import db from '../db.js';
import { requireKsiegowy } from '../middleware/auth.js';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join as pathJoin } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT = pathJoin(__dirname, '../fonts/DejaVuSans.ttf');
const FONT_BOLD = pathJoin(__dirname, '../fonts/DejaVuSans-Bold.ttf');

const router = Router();

const PLN = (n) => `${parseFloat(n || 0).toFixed(2)} zl`;
const DATE = (d) => d ? new Date(d).toLocaleDateString('pl-PL') : '';

router.get('/pdf', requireKsiegowy, async (req, res) => {
  try {
    const [skladkiRes, uczniowieWplatyRes, wyplatyRes] = await Promise.all([
      db.query(`
        SELECT s.*,
          COALESCE(su.liczba_uczniow, 0) AS liczba_uczniow,
          COALESCE(su.liczba_uczniow, 0) * s.kwota_na_osobe AS cel_lacznie,
          COALESCE(w.zebrano, 0) AS zebrano_lacznie,
          COALESCE(wy.wyplacono, 0) AS wyplacono_lacznie,
          COALESCE(w.zebrano, 0) - COALESCE(wy.wyplacono, 0) AS saldo
        FROM skladki s
        LEFT JOIN (SELECT skladka_id, COUNT(*) AS liczba_uczniow FROM skladka_ucznowie GROUP BY skladka_id) su ON su.skladka_id = s.id
        LEFT JOIN (SELECT skladka_id, SUM(kwota) AS zebrano FROM wplaty GROUP BY skladka_id) w ON w.skladka_id = s.id
        LEFT JOIN (SELECT skladka_id, SUM(kwota) AS wyplacono FROM wyplaty GROUP BY skladka_id) wy ON wy.skladka_id = s.id
        ORDER BY s.kolejnosc ASC, s.created_at DESC
      `),
      // Uczniowie przypisani do składek z ich wpłatami
      db.query(`
        SELECT
          su.skladka_id,
          u.id AS uczen_id,
          u.imie,
          u.nazwisko,
          s.kwota_na_osobe,
          COALESCE(SUM(w.kwota), 0) AS zaplacono
        FROM skladka_ucznowie su
        JOIN ucznowie u ON u.id = su.uczen_id
        JOIN skladki s ON s.id = su.skladka_id
        LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = su.uczen_id
        GROUP BY su.skladka_id, u.id, u.imie, u.nazwisko, s.kwota_na_osobe
        ORDER BY u.nazwisko, u.imie
      `),
      db.query(`SELECT * FROM wyplaty ORDER BY skladka_id, data`),
    ]);

    const skladki = skladkiRes.rows;
    const uczniowieWplaty = uczniowieWplatyRes.rows;
    const wyplaty = wyplatyRes.rows;

    // Wpłaty ogólne (bez ucznia)
    const wplatyOgolneRes = await db.query(
      `SELECT * FROM wplaty WHERE uczen_id IS NULL ORDER BY skladka_id, data`
    );
    const wplatyOgolne = wplatyOgolneRes.rows;

    const date = new Date().toLocaleDateString('pl-PL');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    doc.registerFont('Regular', FONT);
    doc.registerFont('Bold', FONT_BOLD);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="raport-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    const W = doc.page.width - 80;
    const GREEN = '#2d7d2d';
    const GREEN_BG = '#e8f5e8';
    const ORANGE = '#c05a00';
    const ORANGE_BG = '#fff3e0';
    const RED = '#c53030';
    const RED_BG = '#fff0f0';
    const DARK = '#0f1117';
    const GRAY = '#666666';
    const LIGHT = '#f5f3ee';

    // Status ucznia
    const statusUcznia = (zaplacono, kwota) => {
      const z = parseFloat(zaplacono || 0);
      const k = parseFloat(kwota || 0);
      if (z <= 0) return 'nieoplacone';
      if (z >= k) return 'oplacone';
      return 'czesciowe';
    };
    const statusKolor = (status) => ({
      oplacone: GREEN,
      czesciowe: ORANGE,
      nieoplacone: RED,
    }[status]);
    const statusBg = (status) => ({
      oplacone: GREEN_BG,
      czesciowe: ORANGE_BG,
      nieoplacone: RED_BG,
    }[status]);
    const statusLabel = (status) => ({
      oplacone: 'Oplacono',
      czesciowe: 'Czesciowe',
      nieoplacone: 'Nie oplacono',
    }[status]);

    // ── Naglowek ──
    doc.fontSize(20).fillColor(DARK).font('Bold').text('Raport finansowy', 40, 40);
    doc.fontSize(10).fillColor(GRAY).font('Regular').text(`Klasowy Ksiegowy  |  Wygenerowano: ${date}`, 40, 66);
    doc.moveTo(40, 82).lineTo(555, 82).strokeColor(DARK).lineWidth(1.5).stroke();

    let y = 95;

    // ── Podsumowanie ──
    doc.fontSize(13).fillColor(DARK).font('Bold').text('Podsumowanie', 40, y); y += 20;

    const totalCel = skladki.reduce((s, r) => s + parseFloat(r.cel_lacznie || 0), 0);
    const totalZebrano = skladki.reduce((s, r) => s + parseFloat(r.zebrano_lacznie || 0), 0);
    const totalWyplacono = skladki.reduce((s, r) => s + parseFloat(r.wyplacono_lacznie || 0), 0);
    const totalSaldo = totalZebrano - totalWyplacono;
    const aktywne = skladki.filter(s => s.status === 'aktywna').length;
    const archiwalne = skladki.filter(s => s.status === 'zakonczona').length;

    const summaryRows = [
      ['Liczba skladek:', `${skladki.length}  (aktywnych: ${aktywne}, archiwalnych: ${archiwalne})`],
      ['Cel laczny:', PLN(totalCel)],
      ['Zebrano lacznie:', PLN(totalZebrano)],
      ['Wyplacono lacznie:', PLN(totalWyplacono)],
      ['Saldo:', PLN(totalSaldo)],
    ];

    summaryRows.forEach(([label, val], i) => {
      const isSaldo = i === 4;
      doc.rect(40, y, W, 18).fill(i % 2 === 0 ? LIGHT : '#ffffff').fillColor(DARK);
      doc.fontSize(isSaldo ? 11 : 10)
        .font('Bold').fillColor(DARK).text(label, 46, y + 4, { width: 140 });
      doc.font(isSaldo ? 'Bold' : 'Regular')
        .fillColor(isSaldo ? (totalSaldo >= 0 ? GREEN : RED) : DARK)
        .text(val, 190, y + 4, { width: W - 150, align: 'right' });
      y += 18;
    });

    // Legenda
    y += 8;
    doc.fontSize(8).font('Regular');
    [['oplacone', 'Oplacono w calosci'], ['czesciowe', 'Czesc oplacona'], ['nieoplacone', 'Nie oplacono']].forEach(([st, label]) => {
      doc.rect(40 + (st === 'oplacone' ? 0 : st === 'czesciowe' ? 90 : 190), y, 8, 8)
        .fill(statusKolor(st));
      doc.fillColor(GRAY).text(label,
        40 + (st === 'oplacone' ? 10 : st === 'czesciowe' ? 100 : 200), y);
    });
    y += 16;

    doc.moveTo(40, y).lineTo(555, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    y += 12;

    // ── Szczegoly skladek ──
    doc.fontSize(13).fillColor(DARK).font('Bold').text('Szczegoly skladek', 40, y); y += 20;

    for (const s of skladki) {
      const isArchiwalna = s.status === 'zakonczona';
      const zebrano = parseFloat(s.zebrano_lacznie || 0);
      const wyplaconoS = parseFloat(s.wyplacono_lacznie || 0);
      const saldoS = zebrano - wyplaconoS;
      const cel = parseFloat(s.cel_lacznie || 0);

      if (y > 700) { doc.addPage(); y = 40; }

      // Naglowek skladki
      const statusLabel2 = isArchiwalna ? 'Archiwalna' : (s.status === 'aktywna' ? 'Aktywna' : 'Wstrzymana');
      doc.rect(40, y, W, 22).fill(isArchiwalna ? '#eeeeee' : '#e8f5e8').fillColor(DARK);
      doc.fontSize(11).font('Bold').fillColor(isArchiwalna ? GRAY : DARK)
        .text(s.nazwa, 46, y + 5, { width: W - 100 });
      doc.fontSize(9).font('Regular').fillColor(isArchiwalna ? GRAY : GREEN)
        .text(`[${statusLabel2}]`, 40, y + 7, { width: W - 10, align: 'right' });
      y += 22;

      // Info
      doc.rect(40, y, W, 16).fill('#fafafa');
      const infoItems = [
        `Kwota/os: ${PLN(s.kwota_na_osobe)}`,
        `Uczniow: ${s.liczba_uczniow}`,
        `Cel: ${PLN(cel)}`,
        `Zebrano: ${PLN(zebrano)}`,
        `Wyplacono: ${PLN(wyplaconoS)}`,
        `Saldo: ${PLN(saldoS)}`,
      ];
      const colW = W / infoItems.length;
      infoItems.forEach((item, i) => {
        const isSaldoItem = i === 5;
        doc.fontSize(8).font('Regular')
          .fillColor(isSaldoItem ? (saldoS >= 0 ? GREEN : RED) : GRAY)
          .text(item, 40 + i * colW, y + 4, { width: colW, align: 'center' });
      });
      y += 16;

      if (!isArchiwalna) {
        // Uczniowie — posortowani alfabetycznie, z kolorami
        const sUczniowie = uczniowieWplaty
          .filter(u => u.skladka_id === s.id);

        if (sUczniowie.length > 0) {
          if (y > 720) { doc.addPage(); y = 40; }

          // Header uczniow
          doc.fontSize(8).font('Bold').fillColor(DARK).text('Uczniowie:', 46, y + 3); y += 14;
          doc.rect(46, y, W - 6, 14).fill('#dce8dc');
          // Kolumny: Uczen(220) | Naleznosc(85) | Zaplacono(85) | Status(115)
          doc.fontSize(7).font('Bold').fillColor(DARK)
            .text('Uczen', 52, y + 3, { width: 215 })
            .text('Naleznosc', 270, y + 3, { width: 80, align: 'right' })
            .text('Zaplacono', 355, y + 3, { width: 80, align: 'right' })
            .text('Status', 438, y + 3, { width: 110, align: 'right' });
          y += 14;

          sUczniowie.forEach((u, i) => {
            if (y > 760) { doc.addPage(); y = 40; }
            const st = statusUcznia(u.zaplacono, u.kwota_na_osobe);
            const bg = i % 2 === 0 ? '#ffffff' : '#f9f9f9';
            doc.rect(46, y, W - 6, 14).fill(bg);
            doc.rect(46, y, 3, 14).fill(statusKolor(st));
            const name = `${u.nazwisko} ${u.imie}`;
            doc.fontSize(7).font('Regular').fillColor(DARK)
              .text(name, 52, y + 3, { width: 215 })
              .text(PLN(u.kwota_na_osobe), 270, y + 3, { width: 80, align: 'right' })
              .text(PLN(u.zaplacono), 355, y + 3, { width: 80, align: 'right' });
            doc.font('Bold').fillColor(statusKolor(st))
              .text(statusLabel(st), 438, y + 3, { width: 110, align: 'right' });
            y += 14;
          });
        }

        // Wplaty ogolne
        const sOgolne = wplatyOgolne.filter(w => w.skladka_id === s.id);
        if (sOgolne.length > 0) {
          if (y > 720) { doc.addPage(); y = 40; }
          doc.fontSize(8).font('Bold').fillColor(DARK).text('Wplaty ogolne:', 46, y + 3); y += 14;
          doc.rect(46, y, W - 6, 14).fill('#dce8dc');
          doc.fontSize(7).font('Bold').fillColor(DARK)
            .text('Opis', 50, y + 3, { width: 340 })
            .text('Data', 395, y + 3, { width: 70, align: 'center' })
            .text('Kwota', 468, y + 3, { width: 75, align: 'right' });
          y += 14;
          sOgolne.forEach((w, i) => {
            if (y > 760) { doc.addPage(); y = 40; }
            doc.rect(46, y, W - 6, 13).fill(i % 2 === 0 ? '#ffffff' : '#f9f9f9');
            doc.fontSize(7).font('Regular').fillColor(DARK)
              .text(w.notatka || 'Wplata ogolna', 50, y + 3, { width: 340 })
              .text(DATE(w.data), 395, y + 3, { width: 70, align: 'center' })
              .text(PLN(w.kwota), 468, y + 3, { width: 75, align: 'right' });
            y += 13;
          });
        }

        // Wyplaty
        const sWyplaty = wyplaty.filter(w => w.skladka_id === s.id);
        if (sWyplaty.length > 0) {
          if (y > 720) { doc.addPage(); y = 40; }
          doc.fontSize(8).font('Bold').fillColor(DARK).text('Wyplaty:', 46, y + 3); y += 14;
          doc.rect(46, y, W - 6, 14).fill('#f0c0c0');
          doc.fontSize(7).font('Bold').fillColor(DARK)
            .text('Opis', 50, y + 3, { width: 340 })
            .text('Data', 395, y + 3, { width: 70, align: 'center' })
            .text('Kwota', 468, y + 3, { width: 75, align: 'right' });
          y += 14;
          sWyplaty.forEach((w, i) => {
            if (y > 760) { doc.addPage(); y = 40; }
            doc.rect(46, y, W - 6, 13).fill(i % 2 === 0 ? '#ffffff' : '#fff5f5');
            doc.fontSize(7).font('Regular').fillColor(DARK)
              .text(w.opis || '', 50, y + 3, { width: 340 })
              .text(DATE(w.data), 395, y + 3, { width: 70, align: 'center' })
              .text(PLN(w.kwota), 468, y + 3, { width: 75, align: 'right' });
            y += 13;
          });
        }
      }

      y += 10;
    }

    doc.end();
  } catch (err) {
    console.error('Raport error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Blad generowania raportu: ' + err.message });
    }
  }
});

// GET /raport/skladka/:id — raport pojedynczej składki
router.get('/skladka/:id', requireKsiegowy, async (req, res) => {
  const id = req.params.id;
  try {
    const [skladkaRes, uczniowieRes, wplatyOgolneRes, wyplatyRes] = await Promise.all([
      db.query(`
        SELECT s.*,
          COALESCE(su.liczba_uczniow, 0) AS liczba_uczniow,
          COALESCE(su.liczba_uczniow, 0) * s.kwota_na_osobe AS cel_lacznie,
          COALESCE(w.zebrano, 0) AS zebrano_lacznie,
          COALESCE(wy.wyplacono, 0) AS wyplacono_lacznie,
          COALESCE(w.zebrano, 0) - COALESCE(wy.wyplacono, 0) AS saldo
        FROM skladki s
        LEFT JOIN (SELECT skladka_id, COUNT(*) AS liczba_uczniow FROM skladka_ucznowie GROUP BY skladka_id) su ON su.skladka_id = s.id
        LEFT JOIN (SELECT skladka_id, SUM(kwota) AS zebrano FROM wplaty GROUP BY skladka_id) w ON w.skladka_id = s.id
        LEFT JOIN (SELECT skladka_id, SUM(kwota) AS wyplacono FROM wyplaty GROUP BY skladka_id) wy ON wy.skladka_id = s.id
        WHERE s.id = $1
      `, [id]),
      db.query(`
        SELECT u.id, u.imie, u.nazwisko, s.kwota_na_osobe,
          COALESCE(SUM(w.kwota), 0) AS zaplacono
        FROM skladka_ucznowie su
        JOIN ucznowie u ON u.id = su.uczen_id
        JOIN skladki s ON s.id = su.skladka_id
        LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = su.uczen_id
        WHERE su.skladka_id = $1
        GROUP BY u.id, u.imie, u.nazwisko, s.kwota_na_osobe
        ORDER BY u.nazwisko, u.imie
      `, [id]),
      db.query(`SELECT * FROM wplaty WHERE skladka_id=$1 AND uczen_id IS NULL ORDER BY data`, [id]),
      db.query(`SELECT * FROM wyplaty WHERE skladka_id=$1 ORDER BY data`, [id]),
    ]);

    const s = skladkaRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Nie znaleziono' });
    const ucznowie = uczniowieRes.rows;
    const ogolne = wplatyOgolneRes.rows;
    const wyplaty = wyplatyRes.rows;

    const GREEN = '#2d7d2d', GREEN_BG = '#e8f5e8';
    const ORANGE = '#c05a00', ORANGE_BG = '#fff3e0';
    const RED = '#c53030', RED_BG = '#fff0f0';
    const DARK = '#0f1117', GRAY = '#666666', LIGHT = '#f5f3ee';
    const PLN = (n) => `${parseFloat(n || 0).toFixed(2)} zl`;
    const DATE = (d) => d ? new Date(d).toLocaleDateString('pl-PL') : '';

    const statusUcznia = (zap, kwota) => {
      const z = parseFloat(zap || 0), k = parseFloat(kwota || 0);
      if (z <= 0) return 'nieoplacone';
      if (z >= k) return 'oplacone';
      return 'czesciowe';
    };
    const statusKolor = (st) => ({ oplacone: GREEN, czesciowe: ORANGE, nieoplacone: RED }[st]);
    const statusLabel = (st) => ({ oplacone: 'Oplacono', czesciowe: 'Czesciowe', nieoplacone: 'Nie oplacono' }[st]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.registerFont('Regular', FONT);
    doc.registerFont('Bold', FONT_BOLD);

    const date = new Date().toLocaleDateString('pl-PL');
    const W = doc.page.width - 80;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="raport-${s.nazwa.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    let y = 40;

    // Naglowek
    doc.fontSize(18).fillColor(DARK).font('Bold').text(s.nazwa, 40, y); y += 24;
    const statusLabel2 = s.status === 'zakonczona' ? 'Archiwalna' : s.status === 'aktywna' ? 'Aktywna' : 'Wstrzymana';
    doc.fontSize(10).fillColor(GRAY).font('Regular')
      .text(`${statusLabel2}  |  Wygenerowano: ${date}${s.termin ? '  |  Termin: ' + DATE(s.termin) : ''}`, 40, y); y += 14;
    doc.moveTo(40, y).lineTo(555, y).strokeColor(DARK).lineWidth(1.5).stroke(); y += 12;

    // Podsumowanie
    const zebrano = parseFloat(s.zebrano_lacznie || 0);
    const wyplacono = parseFloat(s.wyplacono_lacznie || 0);
    const cel = parseFloat(s.cel_lacznie || 0);
    const saldo = parseFloat(s.saldo || 0);
    const pct = cel > 0 ? Math.min(zebrano / cel * 100, 100) : 0;

    const summaryRows = [
      ['Kwota na osobe:', PLN(s.kwota_na_osobe), 'Liczba uczniow:', s.liczba_uczniow.toString()],
      ['Cel laczny:', PLN(cel), 'Zebrano:', PLN(zebrano)],
      ['Wyplacono:', PLN(wyplacono), 'Saldo:', PLN(saldo)],
    ];
    summaryRows.forEach(([l1, v1, l2, v2], i) => {
      const isSaldo = i === 2;
      doc.rect(40, y, W, 18).fill(i % 2 === 0 ? LIGHT : '#fff');
      doc.fontSize(9).font('Bold').fillColor(DARK).text(l1, 46, y + 4, { width: 90 });
      doc.font('Regular').fillColor(isSaldo && i === 2 ? (saldo >= 0 ? GREEN : RED) : DARK)
        .text(v1, 140, y + 4, { width: 100 });
      doc.font('Bold').fillColor(DARK).text(l2, 250, y + 4, { width: 100 });
      doc.font(isSaldo ? 'Bold' : 'Regular')
        .fillColor(isSaldo ? (saldo >= 0 ? GREEN : RED) : DARK)
        .text(v2, 355, y + 4, { width: 190, align: 'right' });
      y += 18;
    });

    // Pasek postepu
    y += 6;
    doc.rect(40, y, W, 8).fill('#e0ece0');
    doc.rect(40, y, W * pct / 100, 8).fill(GREEN);
    doc.fontSize(7).fillColor(GRAY).font('Regular')
      .text(`${pct.toFixed(1)}% zebrano`, 40, y + 10, { width: W, align: 'center' });
    y += 22;

    // Legenda
    [['oplacone', 'Oplacono'], ['czesciowe', 'Czesciowe'], ['nieoplacone', 'Nie oplacono']].forEach(([st, label], i) => {
      doc.rect(40 + i * 100, y, 8, 8).fill(statusKolor(st));
      doc.fontSize(8).font('Regular').fillColor(GRAY).text(label, 52 + i * 100, y + 1);
    });
    y += 18;
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#ccc').lineWidth(0.5).stroke(); y += 10;

    // Uczniowie
    if (ucznowie.length > 0) {
      doc.fontSize(11).font('Bold').fillColor(DARK).text('Uczniowie', 40, y); y += 16;
      doc.rect(46, y, W - 6, 14).fill('#dce8dc');
      doc.fontSize(7).font('Bold').fillColor(DARK)
        .text('Uczen', 52, y + 3, { width: 215 })
        .text('Naleznosc', 270, y + 3, { width: 80, align: 'right' })
        .text('Zaplacono', 355, y + 3, { width: 80, align: 'right' })
        .text('Status', 438, y + 3, { width: 110, align: 'right' });
      y += 14;

      ucznowie.forEach((u, i) => {
        if (y > 760) { doc.addPage(); y = 40; }
        const st = statusUcznia(u.zaplacono, u.kwota_na_osobe);
        doc.rect(46, y, W - 6, 14).fill(i % 2 === 0 ? '#fff' : '#f9f9f9');
        doc.rect(46, y, 3, 14).fill(statusKolor(st));
        doc.fontSize(7).font('Regular').fillColor(DARK)
          .text(`${u.nazwisko} ${u.imie}`, 52, y + 3, { width: 215 })
          .text(PLN(u.kwota_na_osobe), 270, y + 3, { width: 80, align: 'right' })
          .text(PLN(u.zaplacono), 355, y + 3, { width: 80, align: 'right' });
        doc.font('Bold').fillColor(statusKolor(st))
          .text(statusLabel(st), 438, y + 3, { width: 110, align: 'right' });
        y += 14;
      });
      y += 8;
    }

    // Wplaty ogolne
    if (ogolne.length > 0) {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.fontSize(11).font('Bold').fillColor(DARK).text('Wplaty ogolne', 40, y); y += 16;
      doc.rect(46, y, W - 6, 14).fill('#dce8dc');
      doc.fontSize(7).font('Bold').fillColor(DARK)
        .text('Opis', 50, y + 3, { width: 340 })
        .text('Data', 395, y + 3, { width: 70, align: 'center' })
        .text('Kwota', 468, y + 3, { width: 75, align: 'right' });
      y += 14;
      ogolne.forEach((w, i) => {
        if (y > 760) { doc.addPage(); y = 40; }
        doc.rect(46, y, W - 6, 13).fill(i % 2 === 0 ? '#fff' : '#f9f9f9');
        doc.fontSize(7).font('Regular').fillColor(DARK)
          .text(w.notatka || 'Wplata ogolna', 50, y + 3, { width: 340 })
          .text(DATE(w.data), 395, y + 3, { width: 70, align: 'center' })
          .text(PLN(w.kwota), 468, y + 3, { width: 75, align: 'right' });
        y += 13;
      });
      y += 8;
    }

    // Wyplaty
    if (wyplaty.length > 0) {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.fontSize(11).font('Bold').fillColor(DARK).text('Wyplaty', 40, y); y += 16;
      doc.rect(46, y, W - 6, 14).fill('#f0c0c0');
      doc.fontSize(7).font('Bold').fillColor(DARK)
        .text('Opis', 50, y + 3, { width: 340 })
        .text('Data', 395, y + 3, { width: 70, align: 'center' })
        .text('Kwota', 468, y + 3, { width: 75, align: 'right' });
      y += 14;
      wyplaty.forEach((w, i) => {
        if (y > 760) { doc.addPage(); y = 40; }
        doc.rect(46, y, W - 6, 13).fill(i % 2 === 0 ? '#fff' : '#fff5f5');
        doc.fontSize(7).font('Regular').fillColor(DARK)
          .text(w.opis || '', 50, y + 3, { width: 340 })
          .text(DATE(w.data), 395, y + 3, { width: 70, align: 'center' })
          .text(PLN(w.kwota), 468, y + 3, { width: 75, align: 'right' });
        y += 13;
      });
    }

    doc.end();
  } catch (err) {
    console.error('Raport skladka error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Blad generowania raportu: ' + err.message });
  }
});

export default router;

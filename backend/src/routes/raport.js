import { Router } from 'express';
import db from '../db.js';
import { requireKsiegowy } from '../middleware/auth.js';
import PDFDocument from 'pdfkit';

const router = Router();

import { fileURLToPath } from 'url';
import { dirname, join as pathJoin } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT = pathJoin(__dirname, '../fonts/DejaVuSans.ttf');
const FONT_BOLD = pathJoin(__dirname, '../fonts/DejaVuSans-Bold.ttf');
const PLN = (n) => `${parseFloat(n || 0).toFixed(2)} zl`;
const DATE = (d) => d ? new Date(d).toLocaleDateString('pl-PL') : '';

router.get('/pdf', requireKsiegowy, async (req, res) => {
  try {
    const [skladkiRes, wplatyRes, wyplatyRes] = await Promise.all([
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
      db.query(`SELECT w.*, u.imie, u.nazwisko FROM wplaty w LEFT JOIN ucznowie u ON u.id = w.uczen_id ORDER BY w.skladka_id, w.data`),
      db.query(`SELECT * FROM wyplaty ORDER BY skladka_id, data`),
    ]);

    const skladki = skladkiRes.rows;
    const wplaty = wplatyRes.rows;
    const wyplaty = wyplatyRes.rows;

    const date = new Date().toLocaleDateString('pl-PL');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.registerFont('Regular', FONT);
    doc.registerFont('Bold', FONT_BOLD);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="raport-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    const W = doc.page.width - 80; // szerokosc usable
    const GREEN = '#4a8c4a';
    const DARK = '#0f1117';
    const GRAY = '#888888';
    const LIGHT = '#f5f3ee';
    const RED = '#e53e3e';

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
      doc.font(isSaldo ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(isSaldo ? (totalSaldo >= 0 ? GREEN : RED) : DARK)
        .text(val, 190, y + 4, { width: W - 150, align: 'right' });
      y += 18;
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

      // Sprawdz czy potrzebna nowa strona
      if (y > 700) { doc.addPage(); y = 40; }

      // Naglowek skladki
      const statusLabel = isArchiwalna ? 'Archiwalna' : (s.status === 'aktywna' ? 'Aktywna' : 'Wstrzymana');
      const statusColor = isArchiwalna ? GRAY : GREEN;
      doc.rect(40, y, W, 22).fill(isArchiwalna ? '#eeeeee' : '#e8f5e8').fillColor(DARK);
      doc.fontSize(11).font('Bold').fillColor(isArchiwalna ? GRAY : DARK)
        .text(s.nazwa, 46, y + 5, { width: W - 100 });
      doc.fontSize(9).font('Regular').fillColor(statusColor)
        .text(`[${statusLabel}]`, 40, y + 7, { width: W - 10, align: 'right' });
      y += 22;

      // Info wiersz
      const infoY = y;
      doc.rect(40, y, W, 16).fill('#fafafa').fillColor(DARK);
      doc.fontSize(8).font('Regular').fillColor(GRAY);
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
        doc.fillColor(isSaldoItem ? (saldoS >= 0 ? GREEN : RED) : GRAY)
          .text(item, 40 + i * colW, y + 4, { width: colW, align: 'center' });
      });
      y += 16;

      // Szczegoly tylko dla aktywnych
      if (!isArchiwalna) {
        const sWplaty = wplaty.filter(w => w.skladka_id === s.id);
        const sWyplaty = wyplaty.filter(w => w.skladka_id === s.id);

        if (sWplaty.length > 0) {
          if (y > 720) { doc.addPage(); y = 40; }
          doc.fontSize(8).font('Bold').fillColor(DARK).text('Wplaty:', 46, y + 3);
          y += 14;

          // Header
          doc.rect(46, y, W - 6, 14).fill('#c2d9c2').fillColor(DARK);
          doc.fontSize(7).font('Bold')
            .text('Uczen / Opis', 50, y + 3, { width: W - 120 })
            .text('Data', 50 + W - 110, y + 3, { width: 50, align: 'center' })
            .text('Kwota', 50 + W - 60, y + 3, { width: 54, align: 'right' });
          y += 14;

          sWplaty.forEach((w, i) => {
            if (y > 760) { doc.addPage(); y = 40; }
            const name = w.uczen_id
              ? `${w.nazwisko || ''} ${w.imie || ''}`.trim()
              : `Wplata ogolna${w.notatka ? ': ' + w.notatka : ''}`;
            doc.rect(46, y, W - 6, 13).fill(i % 2 === 0 ? '#ffffff' : '#f9f9f9').fillColor(DARK);
            doc.fontSize(7).font('Regular')
              .fillColor(DARK).text(name, 50, y + 3, { width: W - 120 })
              .text(DATE(w.data), 50 + W - 110, y + 3, { width: 50, align: 'center' })
              .text(PLN(w.kwota), 50 + W - 60, y + 3, { width: 54, align: 'right' });
            y += 13;
          });
        }

        if (sWyplaty.length > 0) {
          if (y > 720) { doc.addPage(); y = 40; }
          doc.fontSize(8).font('Bold').fillColor(DARK).text('Wyplaty:', 46, y + 3);
          y += 14;

          doc.rect(46, y, W - 6, 14).fill('#f0c0c0').fillColor(DARK);
          doc.fontSize(7).font('Bold')
            .text('Opis', 50, y + 3, { width: W - 120 })
            .text('Data', 50 + W - 110, y + 3, { width: 50, align: 'center' })
            .text('Kwota', 50 + W - 60, y + 3, { width: 54, align: 'right' });
          y += 14;

          sWyplaty.forEach((w, i) => {
            if (y > 760) { doc.addPage(); y = 40; }
            doc.rect(46, y, W - 6, 13).fill(i % 2 === 0 ? '#ffffff' : '#fff5f5').fillColor(DARK);
            doc.fontSize(7).font('Regular')
              .fillColor(DARK).text(w.opis || '', 50, y + 3, { width: W - 120 })
              .text(DATE(w.data), 50 + W - 110, y + 3, { width: 50, align: 'center' })
              .text(PLN(w.kwota), 50 + W - 60, y + 3, { width: 54, align: 'right' });
            y += 13;
          });
        }
      }

      y += 8;
    }

    doc.end();
  } catch (err) {
    console.error('Raport error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Blad generowania raportu: ' + err.message });
    }
  }
});

export default router;

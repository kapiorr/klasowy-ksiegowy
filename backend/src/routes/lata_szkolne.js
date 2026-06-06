import { Router } from 'express';
import db from '../db.js';
import { requireKsiegowy, requireAdmin } from '../middleware/auth.js';
import { log, getIP } from '../logger.js';

const router = Router();

// GET /lata-szkolne
router.get('/', requireKsiegowy, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM lata_szkolne ORDER BY nazwa DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /lata-szkolne
router.post('/', requireKsiegowy, async (req, res) => {
  const { nazwa } = req.body;
  if (!nazwa) return res.status(400).json({ error: 'Brakuje nazwy' });
  try {
    const result = await db.query(
      'INSERT INTO lata_szkolne (nazwa) VALUES ($1) RETURNING *',
      [nazwa.trim()]
    );
    await log({ uzytkownik_id: req.user.id, ip: getIP(req), akcja: 'add_rok_szkolny',
      szczegoly: nazwa.trim() });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Rok szkolny już istnieje' });
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// DELETE /lata-szkolne/:id
router.delete('/:id', requireKsiegowy, async (req, res) => {
  try {
    // Odepnij składki od tego roku
    await db.query('UPDATE skladki SET rok_szkolny_id=NULL WHERE rok_szkolny_id=$1', [req.params.id]);
    await db.query('DELETE FROM lata_szkolne WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// PATCH /lata-szkolne/kolejnosc-skladek — zapisz kolejność składek
router.patch('/kolejnosc-skladek', requireKsiegowy, async (req, res) => {
  const { kolejnosc } = req.body; // [{ id, kolejnosc }]
  if (!Array.isArray(kolejnosc)) return res.status(400).json({ error: 'Nieprawidłowe dane' });
  try {
    for (const { id, kolejnosc: k } of kolejnosc) {
      await db.query('UPDATE skladki SET kolejnosc=$1 WHERE id=$2', [k, id]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;

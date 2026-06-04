import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [
      rozmiarBazy,
      rozmiarTabel,
      polaczenia,
      cacheHit,
      pgStatStatements,
      aktywnosci,
    ] = await Promise.allSettled([

      // Rozmiar bazy + indeksów
      db.query(`
        SELECT
          pg_size_pretty(pg_database_size(current_database())) AS rozmiar,
          pg_database_size(current_database()) AS rozmiar_bytes,
          pg_size_pretty(
            (SELECT sum(pg_indexes_size(relid)) FROM pg_stat_user_tables)
          ) AS rozmiar_indeksow
      `),

      // Rozmiar tabel
      db.query(`
        SELECT
          relname AS tabela,
          pg_size_pretty(pg_total_relation_size(relid)) AS rozmiar_lacznie,
          pg_size_pretty(pg_relation_size(relid)) AS rozmiar_danych,
          pg_size_pretty(pg_indexes_size(relid)) AS rozmiar_indeksow,
          n_live_tup AS wierszy
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
      `),

      // Połączenia
      db.query(`
        SELECT state, count(*) AS liczba
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
        ORDER BY state
      `),

      // Cache hit ratio
      db.query(`
        SELECT
          sum(heap_blks_hit) AS cache_hit,
          sum(heap_blks_read) AS disk_read,
          CASE
            WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
            ELSE round(
              100.0 * sum(heap_blks_hit) /
              (sum(heap_blks_hit) + sum(heap_blks_read)), 2
            )
          END AS cache_hit_ratio
        FROM pg_statio_user_tables
      `),

      // pg_stat_statements (może nie być dostępne)
      db.query(`
        SELECT
          LEFT(query, 120) AS zapytanie,
          query AS zapytanie_pelne,
          calls AS wywolania,
          round(total_exec_time::numeric, 2) AS czas_lacznie_ms,
          round(mean_exec_time::numeric, 2) AS czas_sredni_ms,
          round(min_exec_time::numeric, 2) AS czas_min_ms,
          round(max_exec_time::numeric, 2) AS czas_max_ms,
          rows AS wierszy_lacznie
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY calls DESC
        LIMIT 20
      `),

      // Aktywne zapytania
      db.query(`
        SELECT
          pid,
          state,
          LEFT(query, 100) AS zapytanie,
          now() - query_start AS czas_trwania,
          wait_event_type,
          wait_event
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND state != 'idle'
          AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY query_start
      `),
    ]);

    const get = (result) => result.status === 'fulfilled' ? result.value.rows : null;

    res.json({
      rozmiar_bazy: get(rozmiarBazy)?.[0] || null,
      rozmiar_tabel: get(rozmiarTabel) || [],
      polaczenia: get(polaczenia) || [],
      cache_hit: get(cacheHit)?.[0] || null,
      top_zapytania: get(pgStatStatements) || null,
      aktywne: get(aktywnosci) || [],
      pg_stat_statements_dostepne: pgStatStatements.status === 'fulfilled',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// POST /statystyki/reset — resetuje pg_stat_statements
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    await db.query('SELECT pg_stat_statements_reset()');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd resetu: ' + err.message });
  }
});

export default router;

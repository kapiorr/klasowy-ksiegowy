import { useEffect, useState, useCallback } from 'react';
import { request } from '../api.js';

function Kafelek({ label, value, sub, color = 'text-ink dark:text-gray-100' }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5">
      <div className="font-body text-sm text-sage-600 dark:text-sage-400 mb-1">{label}</div>
      <div className={`font-display text-2xl font-700 ${color}`}>{value}</div>
      {sub && <div className="font-body text-xs text-sage-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function QueryModal({ query, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-sage-100 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">Pełna treść zapytania</h3>
          <button onClick={onClose} className="text-sage-400 hover:text-ink dark:hover:text-gray-100 text-xl leading-none">✕</button>
        </div>
        <div className="p-5">
          <pre className="font-mono text-xs text-ink dark:text-gray-100 bg-sage-50 dark:bg-gray-900 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
            {query}
          </pre>
          <button onClick={() => { navigator.clipboard?.writeText(query); }}
            className="mt-3 text-xs font-body border border-sage-200 text-sage-600 px-3 py-1.5 rounded-lg hover:bg-sage-50">
            Kopiuj
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Statystyki() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState('');
  const [selectedQuery, setSelectedQuery] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    request('/statystyki')
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReset = async () => {
    if (!confirm('Zresetować statystyki zapytań? Wyczyści historię pg_stat_statements.')) return;
    setResetting(true);
    try {
      await request('/statystyki/reset', { method: 'POST' });
      load();
    } catch (e) {
      alert('Błąd: ' + e.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie statystyk...</div>;
  if (err) return <div className="font-body text-rose-500 py-12 text-center">{err}</div>;
  if (!data) return null;

  const active = data.polaczenia.find(p => p.state === 'active')?.liczba || 0;
  const idle = data.polaczenia.find(p => p.state === 'idle')?.liczba || 0;
  const total = data.polaczenia.reduce((s, p) => s + parseInt(p.liczba), 0);
  const cacheRatio = data.cache_hit?.cache_hit_ratio;

  return (
    <div className="max-w-5xl">
      {selectedQuery && <QueryModal query={selectedQuery} onClose={() => setSelectedQuery(null)} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Statystyki bazy danych</h1>
          <p className="font-body text-sage-600 dark:text-sage-400 mt-1">Dane na żywo z PostgreSQL</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="border border-sage-200 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50">
            ↻ Odśwież
          </button>
          {data.pg_stat_statements_dostepne && (
            <button onClick={handleReset} disabled={resetting}
              className="border border-rose-200 text-rose-500 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-rose-50 disabled:opacity-50">
              {resetting ? '...' : '✕ Reset statystyk'}
            </button>
          )}
        </div>
      </div>

      {/* Kafelki */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Kafelek label="Rozmiar bazy" value={data.rozmiar_bazy?.rozmiar || '—'} />
        <Kafelek label="Rozmiar indeksów" value={data.rozmiar_bazy?.rozmiar_indeksow || '—'} />
        <Kafelek
          label="Cache hit ratio"
          value={cacheRatio != null ? `${cacheRatio}%` : '—'}
          color={cacheRatio >= 95 ? 'text-sage-600' : cacheRatio >= 80 ? 'text-amber-500' : 'text-rose-500'}
          sub="im wyższy tym lepiej"
        />
        <Kafelek label="Połączenia aktywne" value={active} color="text-sage-600" sub={`${idle} idle · ${total} łącznie`} />
        <Kafelek label="Statystyki zapytań" value={data.pg_stat_statements_dostepne ? 'aktywne' : 'nieaktywne'}
          color={data.pg_stat_statements_dostepne ? 'text-sage-600' : 'text-sage-400'} />
      </div>

      {/* Rozmiar tabel */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-sage-100 dark:border-gray-700">
          <h2 className="font-display font-700 text-ink dark:text-gray-100">Rozmiar tabel</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-sage-50 dark:bg-gray-700/50">
              <tr>
                {['Tabela', 'Łącznie', 'Dane', 'Indeksy', 'Wierszy'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-body text-xs font-500 text-sage-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-50 dark:divide-gray-700">
              {data.rozmiar_tabel.map(t => (
                <tr key={t.tabela} className="hover:bg-sage-50/50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-2.5 font-mono text-sm text-ink dark:text-gray-100">{t.tabela}</td>
                  <td className="px-4 py-2.5 font-mono text-sm text-sage-600 dark:text-sage-400">{t.rozmiar_lacznie}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-sage-400">{t.rozmiar_danych}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-sage-400">{t.rozmiar_indeksow}</td>
                  <td className="px-4 py-2.5 font-mono text-sm text-sage-600 dark:text-sage-400">{parseInt(t.wierszy).toLocaleString('pl-PL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Połączenia */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 mb-6 p-5">
        <h2 className="font-display font-700 text-ink dark:text-gray-100 mb-3">Połączenia</h2>
        <div className="flex gap-6 flex-wrap">
          {data.polaczenia.map(p => (
            <div key={p.state || 'null'} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${p.state === 'active' ? 'bg-sage-500' : p.state === 'idle' ? 'bg-gray-300' : 'bg-amber-400'}`} />
              <span className="font-mono text-sm text-ink dark:text-gray-100">{p.state || 'brak'}</span>
              <span className="font-display text-lg font-700 text-sage-600 dark:text-sage-400">{p.liczba}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top zapytania */}
      {data.pg_stat_statements_dostepne && data.top_zapytania?.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-sage-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-display font-700 text-ink dark:text-gray-100">Top 20 zapytań wg czasu</h2>
            <span className="font-body text-xs text-sage-400">kliknij ⋯ by zobaczyć pełne zapytanie</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sage-50 dark:bg-gray-700/50">
                <tr>
                  {['', 'Zapytanie', 'Wywołania', 'Łącznie ms', 'Średnio ms', 'Min ms', 'Max ms', 'Wierszy'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-body text-xs font-500 text-sage-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-50 dark:divide-gray-700">
                {data.top_zapytania.map((q, i) => (
                  <tr key={i} className="hover:bg-sage-50/50 dark:hover:bg-gray-700/50">
                    <td className="pl-4 py-2.5">
                      <button onClick={() => setSelectedQuery(q.zapytanie_pelne || q.zapytanie)}
                        className="text-sage-400 hover:text-sage-700 dark:hover:text-gray-200 font-mono text-sm px-1"
                        title="Pokaż pełne zapytanie">
                        ⋯
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-sage-600 dark:text-gray-300 max-w-xs">
                      <span className="block truncate max-w-xs">{q.zapytanie}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-sm text-ink dark:text-gray-100">{parseInt(q.wywolania).toLocaleString('pl-PL')}</td>
                    <td className="px-4 py-2.5 font-mono text-sm text-ink dark:text-gray-100">{parseFloat(q.czas_lacznie_ms).toLocaleString('pl-PL')}</td>
                    <td className={`px-4 py-2.5 font-mono text-sm font-600 ${
                      parseFloat(q.czas_sredni_ms) > 100 ? 'text-rose-500' :
                      parseFloat(q.czas_sredni_ms) > 10 ? 'text-amber-500' : 'text-sage-600'
                    }`}>{q.czas_sredni_ms}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-sage-400">{q.czas_min_ms}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-sage-400">{q.czas_max_ms}</td>
                    <td className="px-4 py-2.5 font-mono text-sm text-sage-600 dark:text-sage-400">{parseInt(q.wierszy_lacznie).toLocaleString('pl-PL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !data.pg_stat_statements_dostepne && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
          <div className="font-body font-500 text-amber-700 dark:text-amber-400 mb-1">pg_stat_statements niedostępne</div>
          <div className="font-body text-sm text-amber-600 dark:text-amber-500 mb-2">
            Statystyki zapytań wymagają restartu bazy po pierwszym wdrożeniu z nową konfiguracją.
          </div>
          <pre className="font-mono text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 rounded-xl px-3 py-2">
            docker-compose restart db
          </pre>
        </div>
      )}
    </div>
  );
}

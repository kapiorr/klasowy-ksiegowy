import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-sage-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
      <div className="bg-sage-600 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const [skladki, setSkladki] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSkladki().then(setSkladki).finally(() => setLoading(false));
  }, []);

  const aktywne = skladki.filter(s => s.status === 'aktywna');
  // Saldo ze wszystkich składek (nie tylko aktywnych)
  const totalSaldo = skladki.reduce((sum, s) => sum + parseFloat(s.saldo || 0), 0);

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Dashboard</h1>
        <p className="font-body text-sage-600 mt-1">Przegląd aktywnych składek</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5">
          <div className="font-body text-sage-600 text-sm mb-1">Aktywne składki</div>
          <div className="font-display text-3xl font-700 text-ink dark:text-gray-100">{aktywne.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5">
          <div className="font-body text-sage-600 text-sm mb-1">Ogólne saldo</div>
          <div className={`font-display text-3xl font-700 ${totalSaldo >= 0 ? 'text-sage-600' : 'text-rose-500'}`}>
            {totalSaldo.toFixed(2)} zł
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-600 text-ink dark:text-gray-100">Aktywne składki</h2>
          <Link to="/skladki" className="font-body text-sm text-sage-600 hover:text-sage-700">Zobacz wszystkie →</Link>
        </div>

        {aktywne.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-8 text-center">
            <div className="text-3xl mb-3">📭</div>
            <div className="font-body text-sage-600 dark:text-sage-400 dark:text-gray-500">Brak aktywnych składek</div>
          </div>
        ) : (
          <div className="space-y-3">
            {aktywne.map(s => {
              const cel = parseFloat(s.cel_lacznie || 0);
              const zebrano = parseFloat(s.zebrano_lacznie || 0);
              const wyplacono = parseFloat(s.wyplacono_lacznie || 0);
              const saldo = parseFloat(s.saldo || 0);
              return (
                <Link key={s.id} to={`/skladki/${s.id}`}
                  className="block bg-white rounded-2xl border border-sage-100 p-5 hover:border-sage-300 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display font-600 text-ink dark:text-gray-100">{s.nazwa}</div>
                      {s.termin && (
                        <div className="font-body text-xs text-sage-600 mt-0.5">
                          Termin: {new Date(s.termin).toLocaleDateString('pl-PL')}
                        </div>
                      )}
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="font-mono text-sm font-500 text-sage-600 dark:text-sage-400 dark:text-gray-500">
                        {zebrano.toFixed(2)} / {cel.toFixed(2)} zł
                      </div>
                      {wyplacono > 0 && (
                        <div className="font-mono text-xs text-rose-400">
                          −{wyplacono.toFixed(2)} zł wypłat
                        </div>
                      )}
                      {wyplacono > 0 && (
                        <div className={`font-mono text-sm font-600 ${saldo >= 0 ? 'text-sage-600' : 'text-rose-500'}`}>
                          saldo: {saldo.toFixed(2)} zł
                        </div>
                      )}
                    </div>
                  </div>
                  <ProgressBar value={zebrano} max={cel} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getAppConfig } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-sage-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
      <div className="bg-sage-600 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TwojeWplaty({ historiaWplat }) {
  const [open, setOpen] = useState(false);
  const suma = historiaWplat.reduce((s, w) => s + parseFloat(w.kwota || 0), 0);

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 px-5 py-4 hover:border-sage-300 dark:hover:border-gray-500 transition-colors">
        <span className="font-display text-lg font-600 text-ink dark:text-gray-100">Twoje wpłaty</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-600 text-sage-600">{suma.toFixed(2)} zł</span>
          <span className="text-sage-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-sage-100 dark:border-gray-700 overflow-hidden">
          {historiaWplat.length === 0 ? (
            <div className="p-8 text-center font-body text-sage-500 dark:text-sage-400">Brak wpłat</div>
          ) : (
            <div className="divide-y divide-sage-50 dark:divide-gray-700">
              {historiaWplat.map(w => (
                <div key={w.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="font-body text-sm font-500 text-ink dark:text-gray-100">{w.skladka_nazwa}</div>
                    <div className="font-body text-xs text-sage-400">
                      {w.data ? new Date(w.data).toLocaleDateString('pl-PL') : new Date(w.created_at).toLocaleDateString('pl-PL')}
                      {w.skladka_status === 'zakonczona' && <span className="ml-2">(archiwalna)</span>}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-600 text-sage-600">{parseFloat(w.kwota).toFixed(2)} zł</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-3 bg-sage-50 dark:bg-gray-700/50">
                <span className="font-body text-sm font-500 text-sage-600 dark:text-sage-400">Razem wpłacono</span>
                <span className="font-mono text-sm font-700 text-ink dark:text-gray-100">{suma.toFixed(2)} zł</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [skladki, setSkladki] = useState([]);
  const [mojeWplaty, setMojeWplaty] = useState([]);
  const [historiaWplat, setHistoriaWplat] = useState([]);
  const [appConfig, setAppConfig] = useState({});
  const [loading, setLoading] = useState(true);

  const isPodglad = ['podglad', 'podglad_pelny', 'ksiegowy'].includes(user?.rola) && user?.uczen_id;
  const showTwojeWplaty = ['podglad', 'podglad_pelny', 'ksiegowy'].includes(user?.rola) && user?.uczen_id;

  useEffect(() => {
    Promise.all([api.getSkladki(), getAppConfig()]).then(([s, cfg]) => {
      setSkladki(s);
      setAppConfig(cfg);
    }).finally(() => setLoading(false));
  }, []);

  // Historia wszystkich wpłat dla ról podglad i podglad_pelny z uczniem
  useEffect(() => {
    if (!showTwojeWplaty) return;
    api.getMojeWplaty().then(setHistoriaWplat).catch(() => {});
  }, [user?.rola, user?.uczen_id]);

  // Dla podglądu z przypisanym uczniem — pobierz stan wpłat ucznia z aktywnych składek
  useEffect(() => {
    if (!isPodglad) return;
    api.getSkladki().then(async (s) => {
      const aktywneS = s.filter(sk => sk.status === 'aktywna');
      const details = await Promise.all(aktywneS.map(sk => api.getSkladka(sk.id)));
      const uczenId = user?.uczen_id;
      setMojeWplaty(details.map(d => {
        const jegoWplaty = d.wplaty?.filter(w => w.uczen_id === uczenId) || [];
        const przypisany = d.wplaty?.some(w => w.uczen_id === uczenId) || false;
        if (!przypisany) return null;
        const wplacono = jegoWplaty.reduce((s, w) => s + parseFloat(w.wplacono || 0), 0);
        return {
          id: d.id,
          nazwa: d.nazwa,
          kwota_na_osobe: parseFloat(d.kwota_na_osobe || 0),
          wplacono,
        };
      }).filter(Boolean));
    });
  }, [isPodglad]);

  const aktywne = skladki.filter(s => s.status === 'aktywna');
  const totalSaldo = skladki.reduce((sum, s) => sum + parseFloat(s.saldo || 0), 0);
  const doZaplaty = mojeWplaty.filter(w => w.wplacono < w.kwota_na_osobe);
  const sumaDoZaplaty = doZaplaty.reduce((s, w) => s + (w.kwota_na_osobe - w.wplacono), 0);

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Dashboard</h1>
        <p className="font-body text-sage-600 mt-1">Przegląd aktywnych składek</p>
      </div>

      <div className={`grid grid-cols-1 ${user?.rola !== 'podglad' ? 'sm:grid-cols-2' : ''} gap-4 mb-8`}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5">
          <div className="font-body text-sage-600 text-sm mb-1">Aktywne składki</div>
          <div className="font-display text-3xl font-700 text-ink dark:text-gray-100">{aktywne.length}</div>
        </div>
        {user?.rola !== 'podglad' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5">
            <div className="font-body text-sage-600 text-sm mb-1">Ogólne saldo</div>
            <div className={`font-display text-3xl font-700 ${totalSaldo >= 0 ? 'text-sage-600' : 'text-rose-500'}`}>
              {totalSaldo.toFixed(2)} zł
            </div>
          </div>
        )}
      </div>

      {isPodglad && (
        <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 mb-8 ${sumaDoZaplaty > 0 ? 'border-amber-200 dark:border-amber-700' : 'border-sage-200 dark:border-sage-700'}`}>
          {sumaDoZaplaty > 0 ? (<>
            <div className="font-body text-sm text-amber-600 dark:text-amber-400 mb-1">Masz jeszcze do zapłacenia</div>
            <div className="font-display text-3xl font-700 text-amber-600 mb-4">
              {sumaDoZaplaty.toFixed(2)} zł
            </div>
            <div className="space-y-2">
              {mojeWplaty.map(w => {
                const pozostalo = w.kwota_na_osobe - w.wplacono;
                return (
                  <div key={w.id} className="flex items-center justify-between text-sm">
                    <span className="font-body text-ink dark:text-gray-100">{w.nazwa}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sage-500 text-xs">{w.wplacono.toFixed(2)} / {w.kwota_na_osobe.toFixed(2)} zł</span>
                      {pozostalo > 0
                        ? <span className="font-mono font-600 text-amber-600 text-xs bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">brakuje {pozostalo.toFixed(2)} zł</span>
                        : <span className="font-mono font-600 text-sage-600 text-xs bg-sage-50 dark:bg-sage-900/30 px-2 py-0.5 rounded-full">✓ opłacono</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </>) : (<>
            <div className="font-body text-sm text-sage-600 dark:text-sage-400 mb-1">Stan płatności</div>
            <div className="font-display text-xl font-700 text-sage-600 dark:text-sage-400 mb-3">
              ✓ Nie masz żadnych składek do opłacenia
            </div>
            {mojeWplaty.length > 0 && (
              <div className="space-y-2">
                {mojeWplaty.map(w => (
                  <div key={w.id} className="flex items-center justify-between text-sm">
                    <span className="font-body text-ink dark:text-gray-100">{w.nazwa}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sage-500 text-xs">{w.wplacono.toFixed(2)} / {w.kwota_na_osobe.toFixed(2)} zł</span>
                      <span className="font-mono font-600 text-sage-600 text-xs bg-sage-50 dark:bg-sage-900/30 px-2 py-0.5 rounded-full">✓ opłacono</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}
          {(appConfig.payment_account || appConfig.payment_phone) && (
            <div className="mt-4 pt-4 border-t border-sage-100 dark:border-gray-700">
              <div className="font-body text-xs text-sage-600 dark:text-sage-400 space-y-1">
                {appConfig.payment_account && (
                  <div>Wpłaty możesz dokonać na nr konta: <span className="font-mono font-600 text-ink dark:text-gray-100">{appConfig.payment_account}</span></div>
                )}
                {appConfig.payment_phone && (
                  <div>W wyjątkowych sytuacjach BLIKiem na nr: <span className="font-mono font-600 text-ink dark:text-gray-100">{appConfig.payment_phone}</span></div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-600 text-ink dark:text-gray-100">Aktywne składki</h2>
          <Link to="/skladki" className="font-body text-sm text-sage-600 hover:text-sage-700">Zobacz wszystkie →</Link>
        </div>

        {aktywne.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-8 text-center">
            <div className="text-3xl mb-3">📭</div>
            <div className="font-body text-sage-600 dark:text-sage-400">Brak aktywnych składek</div>
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
                      <div className="font-mono text-sm font-500 text-sage-600 dark:text-sage-400">
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

      {showTwojeWplaty && <TwojeWplaty historiaWplat={historiaWplat} />}
    </div>
  );
}

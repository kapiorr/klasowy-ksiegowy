import DateInput from '../components/DateInput.jsx';
import { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

const AKCJE_LABELS = {
  login_ok: '✓ Logowanie',
  login_fail: '✗ Błędne logowanie',
  login_blocked: '⊘ Zablokowany',
  zmiana_hasla: '🔑 Zmiana hasła',
  wymuszona_zmiana_hasla: '🔑 Wymuszona zmiana hasła',
  mfa_wlaczone: '🔒 MFA włączone',
  mfa_wylaczone: '🔓 MFA wyłączone',
  add_skladka: '+ Nowa składka',
  edit_skladka: '✎ Edycja składki',
  delete_skladka: '✕ Usunięcie składki',
  add_wplata: '+ Wpłata',
  edit_wplata: '✎ Edycja wpłaty',
  delete_wplata: '✕ Usunięcie wpłaty',
  add_wplata: '+ Wpłata',
  edit_wplata: '✎ Edycja wpłaty',
  delete_wplata: '✕ Usunięcie wpłaty',
  add_wyplata: '+ Wypłata',
  edit_wyplata: '✎ Edycja wypłaty',
  delete_wyplata: '✕ Usunięcie wypłaty',
  add_uczen_skladka: '+ Uczeń do składki',
  remove_uczen_skladka: '− Uczeń ze składki',
  uczen_aktywowany: '✓ Uczeń aktywowany',
  uczen_dezaktywowany: '⊘ Uczeń dezaktywowany',
  delete_uczen: '✕ Usunięcie ucznia',
  delete_wyplata: '✕ Usunięcie wypłaty',
  add_uczen: '+ Nowy uczeń',
  edit_uczen: '✎ Edycja ucznia',
  add_skladka: '+ Nowa składka',
  edit_skladka: '✎ Edycja składki',
  delete_skladka: '✕ Usunięcie składki',
  add_uzytkownik: '+ Nowy użytkownik',
  edit_uzytkownik: '✎ Edycja użytkownika',
  delete_uzytkownik: '✕ Usunięcie użytkownika',
  mailing_skladka: '✉ Mailing — składka',
  mailing_zaleglosci: '✉ Mailing — zaległości',
  delete_uczen: '✕ Usunięcie ucznia',
  add_uzytkownik: '+ Nowy użytkownik',
  edit_uzytkownik: '✎ Edycja użytkownika',
  delete_uzytkownik: '✕ Usunięcie użytkownika',
  mailing_skladka: '✉ Mailing — składka',
  mailing_zaleglosci: '✉ Mailing — zaległości',
  export_backup: '⬇ Eksport backup',
  import_backup: '⬆ Import backup',
  export_skladka_backup: '⬇ Backup składki',
  import_skladka_backup: '⬆ Import składki',
  import_ucznowie_csv: '⬆ Import uczniów CSV',
  import_uzytkownicy_csv: '⬆ Import użytkowników CSV',
  hibp_wyciekle_haslo: '⚠️ Wyciekłe hasło!',
  captcha_fail: '✗ Błędna CAPTCHA',
  slabe_haslo: '⚠️ Słabe hasło',
  sesja_uniewaznienie: '⎋ Unieważnienie sesji',
  reset_hasla_wyslano: '✉ Reset hasła — wysłano',
};

const AKCJE_COLORS = {
  login_ok: 'text-sage-600',
  login_fail: 'text-rose-500',
  login_blocked: 'text-rose-700',
  add_skladka: 'text-blue-600',
  edit_skladka: 'text-amber-600',
  delete_skladka: 'text-rose-500',
  add_wplata: 'text-blue-600',
  edit_wplata: 'text-amber-600',
  delete_wplata: 'text-rose-500',
  hibp_wyciekle_haslo: 'text-amber-600',
  captcha_fail: 'text-rose-500',
  slabe_haslo: 'text-orange-500',
  sesja_uniewaznienie: 'text-amber-600',
  reset_hasla_wyslano: 'text-blue-500',
};

function BlokadyPanel({ onOdblokuj }) {
  const [blokady, setBlokady] = useState([]);

  const load = () => api.getBlokady().then(setBlokady);
  useEffect(() => { load(); }, []);

  if (blokady.length === 0) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5">
      <h2 className="font-display font-700 text-ink mb-2">Aktywne blokady</h2>
      <div className="font-body text-sm text-sage-400 dark:text-gray-500">Brak aktywnych blokad</div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-rose-100 dark:border-red-900/40 p-5">
      <h2 className="font-display font-700 text-ink mb-3">Aktywne blokady ({blokady.length})</h2>
      <div className="space-y-2">
        {blokady.map(b => (
          <div key={b.id} className="flex items-center justify-between bg-rose-50 rounded-xl px-4 py-2.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  {b.typ === 'login' ? 'Login' : 'IP'}
                </span>
                <span className="font-mono text-sm text-ink dark:text-gray-100">{b.wartosc}</span>
              </div>
              <div className="font-body text-xs text-sage-500 mt-0.5">
                {b.powod} · do {b.zablokowany_do ? new Date(b.zablokowany_do).toLocaleString('pl-PL') : 'odwołania'}
              </div>
            </div>
            <button
              onClick={async () => {
                await api.deleteBlokada(b.id);
                load();
                onOdblokuj();
              }}
              className="text-xs font-body text-rose-400 hover:text-rose-600 underline">
              Odblokuj
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Logi() {
  const [logi, setLogi] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtry, setFiltry] = useState({ sukces: '', akcja: '', od: '', do: '', ip: '' });
  const [blokadyKey, setBlokadyKey] = useState(0);
  const limit = 50;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit, ...filtry });
      const data = await api.getLogi(params.toString());
      setLogi(data.logi);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filtry]);

  const handleExport = () => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({ od: filtry.od, do: filtry.do });
    const url = `/api/logi/export?${params}`;
    const a = document.createElement('a');
    a.href = url;
    // Fetch with auth header
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        a.download = `logi-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(u);
      });
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="max-w-full">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Logi aktywności</h1>
        <p className="font-body text-sage-600 mt-1">Historia zdarzeń — ostatnie 30 dni</p>
      </div>

      <BlokadyPanel key={blokadyKey} onOdblokuj={() => setBlokadyKey(k => k + 1)} />

      {/* Filtry */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-5 mt-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block font-body text-xs text-sage-500 mb-1">Status</label>
            <select value={filtry.sukces} onChange={e => { setFiltry(f => ({ ...f, sukces: e.target.value })); setPage(1); }}
              className="w-full border border-sage-200 rounded-lg px-3 py-2 font-body text-sm text-ink focus:outline-none focus:border-sage-600">
              <option value="">Wszystkie</option>
              <option value="true">Udane</option>
              <option value="false">Nieudane</option>
            </select>
          </div>
          <div>
            <label className="block font-body text-xs text-sage-500 mb-1">Akcja</label>
            <select value={filtry.akcja} onChange={e => { setFiltry(f => ({ ...f, akcja: e.target.value })); setPage(1); }}
              className="w-full border border-sage-200 rounded-lg px-3 py-2 font-body text-sm text-ink focus:outline-none focus:border-sage-600">
              <option value="">Wszystkie</option>
              <option value="login_ok">Logowanie</option>
              <option value="login_fail">Błędne logowanie</option>
              <option value="login_blocked">Zablokowany</option>
              <optgroup label="Hasła i MFA">
                <option value="zmiana_hasla">Zmiana hasła</option>
                <option value="wymuszona_zmiana_hasla">Wymuszona zmiana hasła</option>
                <option value="reset_hasla_wyslano">Reset hasła — wysłano</option>
                <option value="mfa_wlaczone">MFA włączone</option>
                <option value="mfa_wylaczone">MFA wyłączone</option>
                <option value="mfa_fail">Błędny kod MFA</option>
              </optgroup>
              <optgroup label="Bezpieczeństwo">
                <option value="hibp_wyciekle_haslo">Wyciekłe hasło</option>
                <option value="slabe_haslo">Słabe hasło</option>
                <option value="sesja_uniewaznienie">Unieważnienie sesji</option>
                <option value="captcha_fail">Błędna CAPTCHA</option>
              </optgroup>
              <optgroup label="Backup">
                <option value="export_backup">Eksport backup</option>
                <option value="import_backup">Import backup</option>
                <option value="export_skladka_backup">Backup składki</option>
                <option value="import_skladka_backup">Import składki</option>
              </optgroup>
              <optgroup label="Wpłaty i wypłaty">
                <option value="add_wplata">Wpłata</option>
                <option value="edit_wplata">Edycja wpłaty</option>
                <option value="delete_wplata">Usunięcie wpłaty</option>
                <option value="add_wyplata">Wypłata</option>
                <option value="edit_wyplata">Edycja wypłaty</option>
                <option value="delete_wyplata">Usunięcie wypłaty</option>
              </optgroup>
              <optgroup label="Uczniowie">
                <option value="add_uczen">Nowy uczeń</option>
                <option value="edit_uczen">Edycja ucznia</option>
                <option value="add_uczen_skladka">Uczeń dodany do składki</option>
                <option value="remove_uczen_skladka">Uczeń usunięty ze składki</option>
                <option value="uczen_aktywowany">Uczeń aktywowany</option>
                <option value="uczen_dezaktywowany">Uczeń dezaktywowany</option>
                <option value="delete_uczen">Usunięcie ucznia</option>
              </optgroup>
              <optgroup label="Składki">
                <option value="add_skladka">Nowa składka</option>
                <option value="edit_skladka">Edycja składki</option>
                <option value="delete_skladka">Usunięcie składki</option>
              </optgroup>
              <optgroup label="Użytkownicy">
                <option value="add_uzytkownik">Nowy użytkownik</option>
                <option value="edit_uzytkownik">Edycja użytkownika</option>
                <option value="delete_uzytkownik">Usunięcie użytkownika</option>
              </optgroup>
              <optgroup label="Mailing">
                <option value="mailing_skladka">Mailing — składka</option>
                <option value="mailing_zaleglosci">Mailing — zaległości</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block font-body text-xs text-sage-500 mb-1">IP</label>
            <input value={filtry.ip} onChange={e => { setFiltry(f => ({ ...f, ip: e.target.value })); setPage(1); }}
              className="w-full border border-sage-200 rounded-lg px-3 py-2 font-body text-sm text-ink focus:outline-none focus:border-sage-600"
              placeholder="np. 1.2.3.4" />
          </div>
          <div>
            <label className="block font-body text-xs text-sage-500 mb-1">Od</label>
            <input type="date" value={filtry.od} onChange={e => { setFiltry(f => ({ ...f, od: e.target.value })); setPage(1); }}
              className="w-full border border-sage-200 rounded-lg px-3 py-2 font-body text-sm text-ink focus:outline-none focus:border-sage-600" />
          </div>
          <div>
            <label className="block font-body text-xs text-sage-500 mb-1">Do</label>
            <input type="date" value={filtry.do} onChange={e => { setFiltry(f => ({ ...f, do: e.target.value })); setPage(1); }}
              className="w-full border border-sage-200 rounded-lg px-3 py-2 font-body text-sm text-ink focus:outline-none focus:border-sage-600" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="font-body text-xs text-sage-400 dark:text-gray-500">{total} rekordów</span>
          <div className="flex gap-2">
            <button onClick={() => setFiltry({ sukces: '', akcja: '', od: '', do: '', ip: '' })}
              className="text-xs font-body text-sage-500 underline hover:text-sage-700">Wyczyść</button>
            <button onClick={handleExport}
              className="text-xs font-body border border-sage-200 text-sage-600 px-3 py-1.5 rounded-lg hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
              ⬇ Eksport CSV
            </button>
          </div>
        </div>
      </div>

      {/* Logi — tabela na desktop, karty na mobile */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>
        ) : logi.length === 0 ? (
          <div className="font-body text-sage-400 py-12 text-center">Brak logów spełniających kryteria</div>
        ) : (<>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sage-50 dark:bg-gray-700/50 border-b border-sage-100 dark:border-gray-700">
                <tr>
                  {['Data', 'Użytkownik', 'IP', 'Akcja', 'Szczegóły', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-body text-xs font-500 text-sage-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-50 dark:divide-gray-700">
                {logi.map(l => (
                  <tr key={l.id} className={`hover:bg-sage-50/50 ${!l.sukces ? 'bg-rose-50/30 dark:bg-red-900/10' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-sage-600 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('pl-PL')}
                    </td>
                    <td className="px-4 py-2.5 font-body text-sm text-ink dark:text-gray-100">
                      {l.login || l.login_proba || <span className="text-sage-300">—</span>}
                      {l.login_proba && l.login && l.login_proba !== l.login && (
                        <span className="text-xs text-sage-400 ml-1">({l.login_proba})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-sage-500 dark:text-gray-400">{l.ip || '—'}</td>
                    <td className={`px-4 py-2.5 font-body text-sm ${AKCJE_COLORS[l.akcja] || 'text-ink dark:text-gray-100'}`}>
                      {AKCJE_LABELS[l.akcja] || l.akcja}
                    </td>
                    <td className="px-4 py-2.5 font-body text-xs text-sage-600 dark:text-gray-300">
                      {l.szczegoly ? <span className="block break-words">{l.szczegoly}</span> : <span className="text-sage-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${l.sukces ? 'bg-sage-100 text-sage-600' : 'bg-rose-100 text-rose-600'}`}>
                        {l.sukces ? 'OK' : 'BŁĄD'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: karty */}
          <div className="md:hidden divide-y divide-sage-50 dark:divide-gray-700">
            {logi.map(l => (
              <div key={l.id} className={`px-4 py-3 space-y-1.5 ${!l.sukces ? 'bg-rose-50/30 dark:bg-red-900/10' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-body text-sm font-500 ${AKCJE_COLORS[l.akcja] || 'text-ink dark:text-gray-100'}`}>
                    {AKCJE_LABELS[l.akcja] || l.akcja}
                  </span>
                  <span className={`font-mono text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${l.sukces ? 'bg-sage-100 text-sage-600' : 'bg-rose-100 text-rose-600'}`}>
                    {l.sukces ? 'OK' : 'BŁĄD'}
                  </span>
                </div>
                <div className="font-mono text-xs text-sage-500 dark:text-gray-400">
                  {new Date(l.created_at).toLocaleString('pl-PL')}
                  {(l.login || l.login_proba) && (
                    <span className="ml-2 text-sage-600 dark:text-gray-300">· {l.login || l.login_proba}</span>
                  )}
                </div>
                {l.szczegoly && (
                  <div className="font-body text-xs text-sage-600 dark:text-gray-300 break-words">{l.szczegoly}</div>
                )}
                <div className="font-mono text-xs text-sage-400 dark:text-gray-500">{l.ip || '—'}</div>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* Paginacja */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="font-body text-sm px-4 py-2 border border-sage-200 rounded-xl hover:bg-sage-50 dark:hover:bg-gray-700 disabled:opacity-40">
            ← Poprzednia
          </button>
          <span className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="font-body text-sm px-4 py-2 border border-sage-200 rounded-xl hover:bg-sage-50 dark:hover:bg-gray-700 disabled:opacity-40">
            Następna →
          </button>
        </div>
      )}
    </div>
  );
}

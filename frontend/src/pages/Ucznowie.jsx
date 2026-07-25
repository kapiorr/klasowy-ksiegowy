import { useEffect, useState, useRef } from 'react';
import { api, downloadUczniowieCsv } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDialog } from '../components/Dialog.jsx';

function UczenModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || { imie: '', nazwisko: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">{initial ? 'Edytuj ucznia' : 'Nowy uczeń'}</h3>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Imię *</label>
            <input value={form.imie} onChange={e => setForm(f => ({ ...f, imie: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" required />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Nazwisko *</label>
            <input value={form.nazwisko} onChange={e => setForm(f => ({ ...f, nazwisko: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">Anuluj</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
              {saving ? '...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onDone }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(reader.result);
    reader.readAsText(f, 'UTF-8');
  };

  const submit = async () => {
    if (!csv.trim()) return;
    setSaving(true);
    try {
      const res = await api.importUczniowieCsv(csv);
      setResult(res);
      onDone();
    } catch (e) {
      setResult({ blad: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">Import uczniów z CSV</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-sage-50 dark:bg-gray-700/50 rounded-xl px-4 py-3 font-body text-xs text-sage-600 space-y-1">
            <div className="font-500">Format pliku CSV:</div>
            <div className="font-mono">imie;nazwisko</div>
            <div className="font-mono text-sage-400 dark:text-gray-500">Jan;Kowalski</div>
            <div className="font-mono text-sage-400 dark:text-gray-500">Anna;Nowak</div>
            <div className="mt-1">Separator: średnik. Pierwsza linia może być nagłówkiem.</div>
          </div>

          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Wybierz plik CSV</label>
            <input type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFile}
              className="w-full text-sm font-body text-sage-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sage-100 file:text-sage-700 hover:file:bg-sage-200" />
          </div>

          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">lub wklej zawartość</label>
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={5}
              className="w-full border border-sage-200 rounded-xl px-4 py-2.5 font-mono text-xs text-ink focus:outline-none focus:border-sage-600 resize-none"
              placeholder="Jan;Kowalski&#10;Anna;Nowak" />
          </div>

          {result && (
            <div className={`rounded-xl px-4 py-3 font-body text-sm space-y-1 ${result.blad ? 'bg-rose-50 text-rose-600' : 'bg-sage-100 text-sage-700'}`}>
              {result.blad ? (
                <div>Błąd: {result.blad}</div>
              ) : (<>
                <div>✓ Dodano: {result.dodano} uczniów</div>
                {result.pominieto > 0 && <div>⚠ Pominięto: {result.pominieto}</div>}
                {result.bledy?.map((b, i) => <div key={i} className="text-xs text-rose-500">{b}</div>)}
              </>)}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
              {result ? 'Zamknij' : 'Anuluj'}
            </button>
            {!result && (
              <button onClick={submit} disabled={saving || !csv.trim()}
                className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-40">
                {saving ? 'Importuję...' : 'Importuj'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WplatyUczniaModal({ uczen, onClose }) {
  const [wplaty, setWplaty] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWplatyUczen(uczen.id)
      .then(setWplaty)
      .catch(() => setWplaty([]))
      .finally(() => setLoading(false));
  }, [uczen.id]);

  const suma = wplaty.reduce((s, w) => s + parseFloat(w.kwota || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-display font-700 text-ink dark:text-gray-100">Wpłaty ucznia</h3>
            <p className="font-body text-sm text-sage-500">{uczen.nazwisko} {uczen.imie}</p>
          </div>
          <button onClick={onClose} className="text-sage-400 hover:text-ink text-xl dark:hover:text-gray-100">✕</button>
        </div>
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 font-body text-sage-500">Ładowanie...</div>
          ) : wplaty.length === 0 ? (
            <div className="text-center py-8 font-body text-sage-500">Brak wpłat</div>
          ) : (
            <div className="divide-y divide-sage-50 dark:divide-gray-700">
              {wplaty.map(w => (
                <div key={w.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-body text-sm font-500 text-ink dark:text-gray-100">{w.skladka_nazwa}</div>
                    <div className="font-body text-xs text-sage-400">
                      {w.data ? new Date(w.data).toLocaleDateString('pl-PL') : new Date(w.created_at).toLocaleDateString('pl-PL')}
                      {w.skladka_status === 'zakonczona' && <span className="ml-2 text-sage-400">(archiwalna)</span>}
                    </div>
                  </div>
                  <span className="font-mono text-sm font-600 text-sage-600">{parseFloat(w.kwota).toFixed(2)} zł</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {!loading && wplaty.length > 0 && (
          <div className="px-5 py-3 border-t border-sage-100 dark:border-gray-700 flex justify-between items-center">
            <span className="font-body text-sm text-sage-600 dark:text-sage-400">Razem wpłacono</span>
            <span className="font-mono font-700 text-ink dark:text-gray-100">{suma.toFixed(2)} zł</span>
          </div>
        )}
        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full border border-sage-200 dark:border-gray-600 rounded-xl py-2.5 font-body text-ink dark:text-gray-100 hover:bg-sage-50 dark:hover:bg-gray-700">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Ucznowie() {
  const { user } = useAuth();
  const [ucznowie, setUcznowie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [wplatyUczen, setWplatyUczen] = useState(null);
  const { confirm } = useDialog();
  const isKsiegowy = ['admin', 'ksiegowy'].includes(user?.rola);
  const showWplaty = ['admin', 'ksiegowy', 'podglad_pelny'].includes(user?.rola);
  const isPodglad = user?.rola === 'podglad';

  const [pokazNieaktywnych, setPokazNieaktywnych] = useState(false);
  const load = () => api.getUcznowie(isPodglad ? false : pokazNieaktywnych)
    .then(data => setUcznowie([...data].sort((a, b) =>
      `${a.nazwisko} ${a.imie}`.localeCompare(`${b.nazwisko} ${b.imie}`, 'pl')
    )))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, [pokazNieaktywnych]);

  const handleSave = async (form) => {
    if (editing) await api.updateUczen(editing.id, form);
    else await api.addUczen(form);
    setEditing(null);
    load();
  };

  const handleToggleAktywny = async (uczen) => {
    const msg = uczen.aktywny
      ? `Oznaczyć "${uczen.nazwisko} ${uczen.imie}" jako nieaktywny? Nie zostanie dodany do nowych składek.`
      : `Przywrócić "${uczen.nazwisko} ${uczen.imie}" jako aktywny?`;
    if (!await confirm(msg)) return;
    await api.toggleAktywnyUczen(uczen.id, !uczen.aktywny);
    load();
  };

  const handleDelete = async (id) => {
    if (!await confirm('Usunąć ucznia? Usunie też jego wpłaty.')) return;
    await api.deleteUczen(id);
    load();
  };

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>;

  return (
    <div className="max-w-2xl">
      {(modal || editing) && (
        <UczenModal initial={editing} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} />
      )}
      {importModal && <ImportModal onClose={() => setImportModal(false)} onDone={load} />}
      {wplatyUczen && <WplatyUczniaModal uczen={wplatyUczen} onClose={() => setWplatyUczen(null)} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Uczniowie</h1>
          <p className="font-body text-sage-600 mt-1">{ucznowie.length} uczniów w klasie</p>
        </div>
        {!isPodglad && (
          <div className="flex gap-2 flex-wrap justify-end">
            <button onClick={() => setPokazNieaktywnych(p => !p)}
              className={`font-body text-sm px-4 py-2.5 rounded-xl border transition-colors ${pokazNieaktywnych ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-sage-200 text-sage-600 hover:bg-sage-50'}`}>
              {pokazNieaktywnych ? 'Ukryj nieaktywnych' : 'Pokaż nieaktywnych'}
            </button>
            {isKsiegowy && (<>
              <button onClick={() => setImportModal(true)}
                className="border border-sage-200 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50">
                ⬆ Import CSV
              </button>
              <button onClick={downloadUczniowieCsv}
                className="border border-sage-200 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50">
                ⬇ Eksport CSV
              </button>
              <button onClick={() => setModal(true)}
                className="bg-ink text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700">
                + Dodaj ucznia
              </button>
            </>)}
          </div>
        )}
      </div>

      {ucznowie.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <div className="font-body text-sage-600 dark:text-sage-400 dark:text-gray-500">Brak uczniów. Dodaj pierwszego!</div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 divide-y divide-sage-50 dark:divide-gray-700">
          {ucznowie.map((u, i) => (
            <div key={u.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 gap-2 ${!u.aktywny ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-sage-400 flex-shrink-0">{i + 1}.</span>
                <span className={`font-body truncate ${u.aktywny ? 'text-ink dark:text-gray-100' : 'text-sage-400 line-through'}`}>{u.nazwisko} {u.imie}</span>
                {!u.aktywny && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 flex-shrink-0">Nieaktywny</span>}
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3 pl-5 sm:pl-0">
                {showWplaty && (
                  <button onClick={() => setWplatyUczen(u)}
                    className="text-xs font-body text-sage-600 hover:text-sage-700 underline py-1">Wpłaty</button>
                )}
                {isKsiegowy && (<>
                  <button onClick={() => setEditing(u)}
                    className="text-xs font-body text-sage-600 hover:text-sage-700 underline py-1">Edytuj</button>
                  <button onClick={() => handleToggleAktywny(u)}
                    className={`text-xs font-body underline py-1 ${u.aktywny ? 'text-amber-500 hover:text-amber-600' : 'text-sage-500 hover:text-sage-700'}`}>
                    {u.aktywny ? 'Dezaktywuj' : 'Przywróć'}
                  </button>
                  <button onClick={() => handleDelete(u.id)}
                    className="text-xs font-body text-rose-400 hover:text-rose-500 underline py-1">Usuń</button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

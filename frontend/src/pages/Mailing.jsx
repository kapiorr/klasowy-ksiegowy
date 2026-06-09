import { useEffect, useState } from 'react';
import { getMailingZaleglosci, sendMailingZaleglosci } from '../api.js';
import { useDialog } from '../components/Dialog.jsx';

export default function Mailing() {
  const { confirm } = useDialog();
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getMailingZaleglosci()
      .then(d => { setLista(d); setSelected(new Set(d.map(u => u.id))); })
      .catch(() => setLista([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const toggleAll = () => setSelected(
    selected.size === lista.length ? new Set() : new Set(lista.map(u => u.id))
  );

  const handleSend = async () => {
    if (selected.size === 0) return;
    if (!await confirm(`Wysłać przypomnienie o zaległościach do ${selected.size} użytkowników?`)) return;
    setSending(true); setMsg('');
    try {
      const ids = [...selected];
      const r = await sendMailingZaleglosci(ids);
      setMsg(`✓ Wysłano ${r.wyslano} maili${r.bledy?.length ? `. Błędy: ${r.bledy.join(', ')}` : ''}`);
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Mailing — zaległości</h1>
        <p className="font-body text-sage-600 dark:text-sage-400 mt-1">
          Wyślij przypomnienie o zaległościach do wybranych użytkowników
        </p>
      </div>

      {loading ? (
        <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>
      ) : lista.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <div className="font-body text-sage-600 dark:text-sage-400">Brak zaległości — wszyscy zapłacili!</div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 overflow-hidden mb-4">
            {/* Nagłówek z zaznacz wszystkich */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-sage-50 dark:border-gray-700 bg-sage-50 dark:bg-gray-700/50">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox"
                  checked={selected.size === lista.length}
                  onChange={toggleAll}
                  className="rounded border-sage-300" />
                <span className="font-body text-sm font-500 text-ink dark:text-gray-100">
                  Zaznacz wszystkich ({lista.length})
                </span>
              </label>
              <span className="font-body text-xs text-sage-400">{selected.size} zaznaczonych</span>
            </div>

            {/* Lista */}
            <div className="divide-y divide-sage-50 dark:divide-gray-700">
              {lista.map(u => (
                <label key={u.id} className="flex items-center justify-between px-4 py-3 hover:bg-sage-50/50 dark:hover:bg-gray-700/30 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <input type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="rounded border-sage-300" />
                    <div>
                      <div className="font-body text-sm text-ink dark:text-gray-100">
                        {u.uczen_nazwisko} {u.uczen_imie}
                        <span className="text-sage-400 ml-2 text-xs">({u.login})</span>
                      </div>
                      <div className="font-body text-xs text-sage-400">{u.email}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm font-600 text-amber-600">
                      {parseFloat(u.suma_zaleglosci).toFixed(2)} zł
                    </div>
                    <div className="font-body text-xs text-sage-400">
                      {u.liczba_zaleglosci} skład{u.liczba_zaleglosci == 1 ? 'ka' : 'ki'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {msg && (
            <div className={`font-body text-sm px-4 py-3 rounded-xl mb-4 ${msg.startsWith('✓') ? 'bg-sage-50 text-sage-700 border border-sage-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
              {msg}
            </div>
          )}

          <button onClick={handleSend} disabled={sending || selected.size === 0}
            className="w-full bg-ink dark:bg-sage-700 text-white font-display font-600 px-5 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50 transition-colors">
            {sending ? '⏳ Wysyłanie...' : `✉ Wyślij przypomnienie do ${selected.size} użytkowników`}
          </button>
        </>
      )}
    </div>
  );
}

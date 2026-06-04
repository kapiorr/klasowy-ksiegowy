import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadSkladkaBackup } from '../api.js';

const STATUS_NEXT = {
  aktywna: { label: 'Archiwizuj', next: 'zakonczona', cls: 'text-sage-500 hover:text-sage-700' },
  zakonczona: { label: 'Przywróć', next: 'aktywna', cls: 'text-blue-500 hover:text-blue-700' },
  wstrzymana: { label: 'Aktywuj', next: 'aktywna', cls: 'text-amber-500 hover:text-amber-700' },
};
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABELS = { aktywna: 'Aktywna', zakonczona: 'Zakończona', wstrzymana: 'Wstrzymana' };
const STATUS_STYLES = {
  aktywna: 'bg-sage-100 text-sage-700',
  zakonczona: 'bg-gray-100 text-gray-500',
  wstrzymana: 'bg-amber-100 text-amber-700',
};

function Modal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || { nazwa: '', kwota_na_osobe: '', termin: '', opis: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h2 className="font-display font-700 text-ink text-lg">
            {initial ? 'Edytuj składkę' : 'Nowa składka'}
          </h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Nazwa *</label>
            <input
              value={form.nazwa}
              onChange={e => setForm(f => ({ ...f, nazwa: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="np. Wycieczka do Krakowa"
              required
            />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Kwota na osobę (zł) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.kwota_na_osobe}
              onChange={e => setForm(f => ({ ...f, kwota_na_osobe: e.target.value }))}
              className="w-full border border-sage-200 rounded-xl px-4 py-2.5 font-mono text-ink focus:outline-none focus:border-sage-600"
              placeholder="50.00"
              required
            />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Termin płatności</label>
            <input
              type="date"
              value={form.termin}
              onChange={e => setForm(f => ({ ...f, termin: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
            />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Opis</label>
            <textarea
              value={form.opis}
              onChange={e => setForm(f => ({ ...f, opis: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600 resize-none"
              rows={2}
              placeholder="Opcjonalne szczegóły..."
            />
          </div>
          {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
              Anuluj
            </button>
            <button type="submit" disabled={saving} className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
              {saving ? 'Zapisuję...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Skladki() {
  const { user } = useAuth();
  const [skladki, setSkladki] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const isKsiegowy = ['admin', 'ksiegowy'].includes(user?.rola);

  const load = () => api.getSkladki().then(setSkladki).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (editing) {
      await api.updateSkladka(editing.id, { ...form, status: editing.status });
    } else {
      await api.addSkladka(form);
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Usunąć składkę i wszystkie wpłaty?')) return;
    await api.deleteSkladka(id);
    load();
  };

  const handleStatus = async (id, status) => {
    await api.setSkladkaStatus(id, status);
    load();
  };

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>;

  return (
    <div className="max-w-4xl">
      {(modal || editing) && (
        <Modal
          initial={editing}
          onClose={() => { setModal(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Składki</h1>
          <p className="font-body text-sage-600 mt-1">{skladki.length} składek łącznie</p>
        </div>
        {isKsiegowy && (
          <button
            onClick={() => setModal(true)}
            className="bg-ink text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700 transition-colors"
          >
            + Nowa składka
          </button>
        )}
      </div>

      {skladki.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-body text-sage-600 dark:text-sage-400 dark:text-gray-500">Brak składek. Dodaj pierwszą!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {skladki.map(s => {
            const cel = parseFloat(s.cel_lacznie || 0);
            const zebrano = parseFloat(s.zebrano_lacznie || 0);
            const wyplacono = parseFloat(s.wyplacono_lacznie || 0);
            const saldo = parseFloat(s.saldo || 0);
            const pct = cel > 0 ? Math.min((zebrano / cel) * 100, 100) : 0;
            const archiwalna = s.status === 'zakonczona';

            return (
              <div key={s.id} className={`rounded-2xl border p-5 ${archiwalna ? 'bg-gray-50 border-gray-200' : 'bg-white border-sage-100'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1">
                    <Link to={`/skladki/${s.id}`} className={`font-display font-600 hover:opacity-70 ${archiwalna ? 'text-gray-400' : 'text-ink hover:text-sage-600'}`}>
                      {s.nazwa}
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${STATUS_STYLES[s.status]}`}>
                        {STATUS_LABELS[s.status]}
                      </span>
                      {s.termin && (
                        <span className={`font-body text-xs ${archiwalna ? 'text-gray-400' : 'text-sage-600'}`}>
                          do {new Date(s.termin).toLocaleDateString('pl-PL')}
                        </span>
                      )}
                      <span className="font-body text-xs text-gray-400">
                        {s.kwota_na_osobe} zł/os · {s.liczba_uczniow} uczniów
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-4 space-y-0.5">
                    <div className={`font-mono text-sm font-500 ${archiwalna ? 'text-gray-400' : 'text-sage-600'}`}>
                      {zebrano.toFixed(2)} / {cel.toFixed(2)} zł
                    </div>
                    {wyplacono > 0 && (
                      <div className="font-mono text-xs text-rose-400">
                        −{wyplacono.toFixed(2)} zł wypłat
                      </div>
                    )}
                    {wyplacono > 0 && (
                      <div className={`font-mono text-sm font-600 ${saldo >= 0 ? (archiwalna ? 'text-gray-400' : 'text-sage-600') : 'text-rose-500'}`}>
                        saldo: {saldo.toFixed(2)} zł
                      </div>
                    )}
                  </div>
                </div>

                <div className={`w-full rounded-full h-1.5 mt-3 ${archiwalna ? 'bg-gray-200' : 'bg-sage-100'}`}>
                  <div className={`h-1.5 rounded-full transition-all ${archiwalna ? 'bg-gray-400' : 'bg-sage-600'}`} style={{ width: `${pct}%` }} />
                </div>

                {isKsiegowy && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Link
                      to={`/skladki/${s.id}`}
                      className={`text-xs font-body underline leading-none ${archiwalna ? 'text-gray-400 hover:text-gray-600' : 'text-sage-600 hover:text-sage-700'}`}
                    >
                      {archiwalna ? 'Podgląd' : 'Zarządzaj wpłatami'}
                    </Link>
                    {!archiwalna && <><span className="text-sage-200">·</span>
                    <button
                      onClick={() => setEditing(s)}
                      className="text-xs font-body text-sage-600 hover:text-sage-700 underline"
                    >
                      Edytuj
                    </button></>}
                    <span className="text-gray-200">·</span>
                    <button
                      onClick={() => handleStatus(s.id, STATUS_NEXT[s.status]?.next)}
                      className={`text-xs font-body underline ${STATUS_NEXT[s.status]?.cls || ''}`}
                    >
                      {STATUS_NEXT[s.status]?.label}
                    </button>
                    <span className="text-sage-200">·</span>
                    <button
                      onClick={() => downloadSkladkaBackup(s.id, s.nazwa)}
                      className="text-xs font-body text-sage-600 hover:text-sage-700 underline"
                    >
                      Backup
                    </button>
                    <span className="text-sage-200">·</span>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs font-body text-rose-400 hover:text-rose-500 underline"
                    >
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

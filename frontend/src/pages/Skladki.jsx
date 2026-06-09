import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadSkladkaBackup, downloadRaportPdf } from '../api.js';
import { useDialog } from '../components/Dialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABELS = { aktywna: 'Aktywna', zakonczona: 'Archiwalna', wstrzymana: 'Wstrzymana' };
const STATUS_STYLES = {
  aktywna: 'bg-sage-100 text-sage-700',
  zakonczona: 'bg-gray-100 text-gray-500',
  wstrzymana: 'bg-amber-100 text-amber-700',
};
const STATUS_NEXT = {
  aktywna: { label: 'Archiwizuj', next: 'zakonczona', cls: 'text-sage-500 hover:text-sage-700' },
  zakonczona: { label: 'Przywróć', next: 'aktywna', cls: 'text-blue-500 hover:text-blue-700' },
  wstrzymana: { label: 'Aktywuj', next: 'aktywna', cls: 'text-amber-500 hover:text-amber-700' },
};

function SkladkaModal({ skladka, onClose, onSave }) {
  const [form, setForm] = useState(skladka ? {
    nazwa: skladka.nazwa,
    kwota_na_osobe: skladka.kwota_na_osobe,
    termin: skladka.termin ? skladka.termin.split('T')[0] : '',
    opis: skladka.opis || '',
    status: skladka.status,
  } : {
    nazwa: '',
    kwota_na_osobe: '',
    termin: '',
    opis: '',
    status: 'aktywna',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">{skladka ? 'Edytuj składkę' : 'Nowa składka'}</h3>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block font-body text-sm font-500 text-ink dark:text-gray-100 mb-1">Nazwa *</label>
            <input value={form.nazwa} onChange={e => setForm(f => ({ ...f, nazwa: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              required />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink dark:text-gray-100 mb-1">Kwota na osobę (zł) *</label>
            <input type="number" min="0" step="0.01" value={form.kwota_na_osobe}
              onChange={e => setForm(f => ({ ...f, kwota_na_osobe: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-mono text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              required />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink dark:text-gray-100 mb-1">Termin płatności</label>
            <input type="date" value={form.termin} onChange={e => setForm(f => ({ ...f, termin: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink dark:text-gray-100 mb-1">Opis</label>
            <textarea value={form.opis} onChange={e => setForm(f => ({ ...f, opis: e.target.value }))} rows={2}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600 resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-sage-200 dark:border-gray-600 rounded-xl py-2.5 font-body text-ink dark:text-gray-100 hover:bg-sage-50 dark:hover:bg-gray-700">Anuluj</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-ink dark:bg-sage-700 text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
              {saving ? '...' : 'Zapisz'}
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
  const [generujePdf, setGenerujePdf] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { confirm, alert } = useDialog();
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
    if (!await confirm('Usunąć składkę i wszystkie wpłaty?')) return;
    await api.deleteSkladka(id);
    load();
  };

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e, id) => { e.preventDefault(); setDragOver(id); };
  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return; }
    const from = skladki.findIndex(s => s.id === dragId);
    const to = skladki.findIndex(s => s.id === targetId);
    const reordered = [...skladki];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withKolejnosc = reordered.map((s, i) => ({ ...s, kolejnosc: i }));
    setSkladki(withKolejnosc);
    await api.setSkladkiKolejnosc(withKolejnosc.map((s, i) => ({ id: s.id, kolejnosc: i })));
    setDragId(null); setDragOver(null);
  };

  const handleStatus = async (id, status) => {
    await api.setSkladkaStatus(id, status);
    load();
  };

  return (
    <div className="max-w-2xl">
      {(modal || editing) && (
        <SkladkaModal
          skladka={editing}
          onClose={() => { setModal(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Składki</h1>
          <p className="font-body text-sage-600 dark:text-sage-400 mt-1">{skladki.length} składek</p>
        </div>
        {isKsiegowy && (
          <div className="flex gap-2">
            <button onClick={async () => {
                setGenerujePdf(true);
                try { await downloadRaportPdf(); }
                catch (e) { await alert('Błąd: ' + e.message, 'error'); }
                finally { setGenerujePdf(false); }
              }} disabled={generujePdf}
              className="border border-sage-200 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50 disabled:opacity-50">
              {generujePdf ? '⏳ Generuję...' : '📄 Raport PDF'}
            </button>
            <button onClick={() => setModal(true)}
              className="bg-ink dark:bg-sage-700 text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700">
              + Nowa składka
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="font-body text-sage-600 dark:text-sage-400 py-12 text-center">Ładowanie...</div>
      ) : skladki.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-body text-sage-600 dark:text-sage-400">Brak składek. Dodaj pierwszą!</div>
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
              <div key={s.id}
                draggable={isKsiegowy}
                onDragStart={() => handleDragStart(s.id)}
                onDragOver={e => handleDragOver(e, s.id)}
                onDrop={e => handleDrop(e, s.id)}
                onDragEnd={() => { setDragId(null); setDragOver(null); }}
                className={`rounded-2xl border p-5 transition-all select-none
                  ${isKsiegowy ? 'cursor-grab active:cursor-grabbing' : ''}
                  ${dragOver === s.id ? 'ring-2 ring-sage-400' : ''}
                  ${dragId === s.id ? 'opacity-40' : ''}
                  ${archiwalna ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700' : 'bg-white dark:bg-gray-800 border-sage-100 dark:border-gray-700'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1">
                    <Link to={`/skladki/${s.id}`} className={`font-display font-600 hover:opacity-70 ${archiwalna ? 'text-gray-400' : 'text-ink dark:text-gray-100 hover:text-sage-600'}`}>
                      {s.nazwa}
                    </Link>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${STATUS_STYLES[s.status]}`}>
                        {STATUS_LABELS[s.status]}
                      </span>
                      {s.termin && (
                        <span className={`font-body text-xs ${archiwalna ? 'text-gray-400' : 'text-sage-600 dark:text-sage-400'}`}>
                          do {new Date(s.termin).toLocaleDateString('pl-PL')}
                        </span>
                      )}
                      <span className="font-body text-xs text-gray-400">
                        {s.kwota_na_osobe} zł/os · {s.liczba_uczniow} uczniów
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className={`font-mono text-sm font-500 ${archiwalna ? 'text-gray-400' : 'text-sage-600 dark:text-sage-400'}`}>
                      {zebrano.toFixed(2)} / {cel.toFixed(2)} zł
                    </div>
                    {wyplacono > 0 && (
                      <div className="font-mono text-xs text-rose-400">
                        −{wyplacono.toFixed(2)} zł wypłat
                      </div>
                    )}
                    {wyplacono > 0 && (
                      <div className={`font-mono text-sm font-600 ${saldo >= 0 ? (archiwalna ? 'text-gray-400' : 'text-sage-600 dark:text-sage-400') : 'text-rose-500'}`}>
                        saldo: {saldo.toFixed(2)} zł
                      </div>
                    )}
                  </div>
                </div>

                <div className={`w-full rounded-full h-1.5 mt-3 ${archiwalna ? 'bg-gray-200 dark:bg-gray-700' : 'bg-sage-100 dark:bg-gray-700'}`}>
                  <div className={`h-1.5 rounded-full transition-all ${archiwalna ? 'bg-gray-400' : 'bg-sage-600'}`} style={{ width: `${pct}%` }} />
                </div>

                {isKsiegowy && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Link
                      to={`/skladki/${s.id}`}
                      className={`text-xs font-body underline leading-none ${archiwalna ? 'text-gray-400 hover:text-gray-600' : 'text-sage-600 hover:text-sage-700'}`}>
                      {archiwalna ? 'Podgląd' : 'Zarządzaj wpłatami'}
                    </Link>
                    {!archiwalna && <><span className="text-sage-200">·</span>
                    <button onClick={() => setEditing(s)}
                      className="text-xs font-body text-sage-600 hover:text-sage-700 underline leading-none">
                      Edytuj
                    </button></>}
                    <span className="text-gray-200">·</span>
                    <button
                      onClick={() => handleStatus(s.id, STATUS_NEXT[s.status]?.next)}
                      className={`text-xs font-body underline leading-none ${STATUS_NEXT[s.status]?.cls || ''}`}>
                      {STATUS_NEXT[s.status]?.label}
                    </button>
                    <span className="text-sage-200">·</span>
                    <button
                      onClick={() => downloadSkladkaBackup(s.id, s.nazwa)}
                      className="text-xs font-body text-sage-600 hover:text-sage-700 underline leading-none">
                      Backup
                    </button>
                    <span className="text-sage-200">·</span>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs font-body text-rose-400 hover:text-rose-500 underline leading-none">
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

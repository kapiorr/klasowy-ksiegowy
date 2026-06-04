import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// ── Podgląd załącznika z dymkiem ────────────────────────────────────────────
function ZalacznikPreview({ wyplataId, nazwa, typ }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const isImage = typ && typ.startsWith('image/');

  const prefetch = async () => {
    if (!isImage || blobUrl) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/wyplaty/${wyplataId}/zalacznik`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        setBlobUrl(URL.createObjectURL(blob));
      }
    } finally {
      setLoading(false);
    }
  };

  const open = () => api.openZalacznik(wyplataId);

  return (
    <div className="relative inline-block">
      <button
        onClick={open}
        onMouseEnter={() => { setShow(true); prefetch(); }}
        onMouseLeave={() => setShow(false)}
        className="font-body text-xs text-sage-600 underline hover:text-sage-700 block text-left"
      >
        📎 {nazwa}
      </button>

      {show && isImage && (
        <div className="absolute bottom-full left-0 mb-2 z-50 pointer-events-none">
          <div className="bg-white border border-sage-200 rounded-xl shadow-xl p-1.5" style={{ width: '200px' }}>
            {loading && (
              <div className="w-full h-32 flex items-center justify-center text-sage-400 text-xs font-body">
                Ładowanie...
              </div>
            )}
            {blobUrl && (
              <img
                src={blobUrl}
                alt={nazwa}
                className="w-full rounded-lg object-contain max-h-48"
              />
            )}
            <div className="text-xs text-sage-400 font-body mt-1 px-1 truncate">{nazwa}</div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Eksport do Excel ─────────────────────────────────────────────────────────
function exportToExcel(wplaty, ogolne, nazwaSkladki) {
  // Budujemy CSV z BOM (Excel poprawnie odczytuje polskie znaki)
  const rows = [
    ['Nazwisko', 'Imię', 'Wymagana (zł)', 'Wpłacono (zł)', 'Pozostało (zł)', 'Status'],
    ...wplaty.map(w => {
      const wplacono = parseFloat(w.wplacono);
      const wymagana = parseFloat(w.kwota_na_osobe);
      const pozostalo = Math.max(wymagana - wplacono, 0);
      const status = wplacono >= wymagana ? 'Zapłacone' : wplacono > 0 ? 'Częściowo' : 'Nie zapłacone';
      return [w.nazwisko, w.imie, wymagana.toFixed(2), wplacono.toFixed(2), pozostalo.toFixed(2), status];
    }),
  ];

  if (ogolne.length > 0) {
    rows.push([]);
    rows.push(['Wpłaty ogólne (bez przypisania)']);
    rows.push(['Data', 'Kwota (zł)', 'Notatka']);
    ogolne.forEach(w => {
      rows.push([new Date(w.data).toLocaleDateString('pl-PL'), parseFloat(w.kwota).toFixed(2), w.notatka || '']);
    });
  }

  const csv = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nazwaSkladki.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal: dodaj ucznia do składki ──────────────────────────────────────────
function DodajUczniaModal({ skladkaId, obecniIds, onClose, onSave }) {
  const [wszyscy, setWszyscy] = useState([]);
  const [wybrani, setWybrani] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getUcznowie(false).then(u => setWszyscy(u.filter(u => !obecniIds.has(u.id))));
  }, []);

  const toggle = (id) => setWybrani(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const submit = async () => {
    if (wybrani.size === 0) return;
    setSaving(true);
    for (const uczenId of wybrani) {
      await api.addUczenToSkladka(skladkaId, uczenId);
    }
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">Dodaj ucznia do składki</h3>
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">Zaznacz uczniów do dodania</p>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {wszyscy.length === 0 && (
            <div className="text-center py-6 font-body text-sage-400 text-sm">
              Wszyscy uczniowie są już w tej składce
            </div>
          )}
          {wszyscy.map(u => (
            <button key={u.id} onClick={() => toggle(u.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-colors ${
                wybrani.has(u.id) ? 'bg-sage-100 text-sage-700' : 'hover:bg-sage-50 dark:hover:bg-gray-700 text-ink'
              }`}>
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 ${
                wybrani.has(u.id) ? 'bg-sage-600 border-sage-600 text-white' : 'border-sage-200'
              }`}>
                {wybrani.has(u.id) ? '✓' : ''}
              </span>
              <span className="font-body text-sm">{u.nazwisko} {u.imie}</span>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-sage-100 dark:border-gray-700 flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
            Anuluj
          </button>
          <button onClick={submit} disabled={saving || wybrani.size === 0}
            className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-40">
            {saving ? '...' : `Dodaj (${wybrani.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal wpłaty ─────────────────────────────────────────────────────────────
function WplataModal({ uczen, wplataEdit, skladkaId, onClose, onSave }) {
  const pozostalo = uczen ? parseFloat(uczen.pozostalo) || 0 : 0;
  const [kwota, setKwota] = useState(wplataEdit ? String(wplataEdit.kwota) : '');
  const [data, setData] = useState(
    wplataEdit ? (wplataEdit.data || '').split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [notatka, setNotatka] = useState(wplataEdit ? wplataEdit.notatka || '' : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      if (wplataEdit) await onSave({ id: wplataEdit.id, kwota, data, notatka });
      else await onSave({ skladka_id: skladkaId, uczen_id: uczen?.uczen_id || null, kwota, data, notatka });
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">{wplataEdit ? 'Edytuj wpłatę' : 'Dodaj wpłatę'}</h3>
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
            {uczen ? `${uczen.nazwisko} ${uczen.imie}` : 'Wpłata ogólna'}
          </p>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Kwota (zł) *</label>
            <input type="number" min="0.01" step="0.01" value={kwota}
              onChange={e => setKwota(e.target.value)}
              className="w-full border border-sage-200 rounded-xl px-4 py-2.5 font-mono text-ink focus:outline-none focus:border-sage-600"
              placeholder={pozostalo > 0 ? pozostalo.toFixed(2) : '0.00'} required />
            {!wplataEdit && pozostalo > 0 && (
              <button type="button" onClick={() => setKwota(pozostalo.toFixed(2))}
                className="mt-1 text-xs text-sage-600 underline font-body">
                Uzupełnij brakującą kwotę ({pozostalo.toFixed(2)} zł)
              </button>
            )}
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Opis / notatka</label>
            <input value={notatka} onChange={e => setNotatka(e.target.value)}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="Opcjonalnie..." />
          </div>
          {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">Anuluj</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
              {saving ? '...' : wplataEdit ? 'Zapisz zmiany' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Szuflada historii wpłat ucznia ──────────────────────────────────────────
function HistoriaDrawer({ uczen, skladkaId, onClose, onEdytuj, onUsun, onDodaj }) {
  const [historia, setHistoria] = useState(null);

  useEffect(() => {
    api.getWplatyHistoria(skladkaId, uczen.uczen_id).then(setHistoria);
  }, [skladkaId, uczen.uczen_id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-display font-700 text-ink dark:text-gray-100">{uczen.nazwisko} {uczen.imie}</h3>
            <p className="font-mono text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
              {parseFloat(uczen.wplacono).toFixed(2)} / {parseFloat(uczen.kwota_na_osobe).toFixed(2)} zł
            </p>
          </div>
          <button onClick={onClose} className="text-sage-400 hover:text-sage-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {historia === null && <div className="text-center font-body text-sage-400 py-4">Ładowanie...</div>}
          {historia?.length === 0 && <div className="text-center font-body text-sage-400 py-4">Brak wpłat</div>}
          {historia?.map(w => (
            <div key={w.id} className="flex items-center justify-between bg-sage-50 rounded-xl px-4 py-3">
              <div>
                <div className="font-mono text-sm font-500 text-sage-700">{parseFloat(w.kwota).toFixed(2)} zł</div>
                <div className="font-body text-xs text-sage-400 dark:text-gray-500">
                  {new Date(w.data).toLocaleDateString('pl-PL')}
                  {w.notatka && <span className="ml-2 text-sage-500 dark:text-gray-400">— {w.notatka}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onEdytuj(w)}
                  className="text-xs text-sage-600 underline hover:text-sage-700 font-body">Edytuj</button>
                <button onClick={() => onUsun(w.id)}
                  className="text-xs text-rose-400 underline hover:text-rose-500 font-body">Usuń</button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <button onClick={onDodaj}
            className="w-full bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700">
            + Dodaj wpłatę
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal wypłaty ────────────────────────────────────────────────────────────
function WyplataModal({ skladkaId, wyplataEdit, onClose, onSave }) {
  const [kwota, setKwota] = useState(wyplataEdit ? String(wyplataEdit.kwota) : '');
  const [opis, setOpis] = useState(wyplataEdit ? wyplataEdit.opis || '' : '');
  const [data, setData] = useState(wyplataEdit ? (wyplataEdit.data || '').split('T')[0] : new Date().toISOString().split('T')[0]);
  const [plik, setPlik] = useState(null);
  const [usunZalacznik, setUsunZalacznik] = useState(false);
  const [plikLoading, setPlikLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const MAX_IMG_PX = 1920;   // max szerokość/wysokość po skalowaniu
  const MAX_FILE_MB = 10;    // limit przed skalowaniem (obrazki będą zmniejszone)

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setErr('');
    setPlikLoading(true);

    // PDF — bez skalowania, tylko limit 5 MB
    if (f.type === 'application/pdf') {
      if (f.size > 5 * 1024 * 1024) { setErr('PDF max 5 MB'); setPlikLoading(false); return; }
      const reader = new FileReader();
      reader.onload = () => { setPlik({ nazwa: f.name, typ: f.type, dane: reader.result.split(',')[1], rozmiar: f.size }); setPlikLoading(false); };
      reader.readAsDataURL(f);
      return;
    }

    // Obrazek — sprawdź limit przed skalowaniem
    if (f.size > MAX_FILE_MB * 1024 * 1024) { setErr(`Plik max ${MAX_FILE_MB} MB`); setPlikLoading(false); return; }

    // Wczytaj i przeskaluj przez canvas
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });

    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });

    const skala = Math.min(1, MAX_IMG_PX / Math.max(img.width, img.height));
    const w = Math.round(img.width * skala);
    const h = Math.round(img.height * skala);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Konwertuj do JPEG jeśli to nie PNG z przezroczystością
    const outType = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const outData = canvas.toDataURL(outType, 0.85).split(',')[1];
    const outSize = Math.round(atob(outData).length);

    setPlik({ nazwa: f.name, typ: outType, dane: outData, rozmiar: outSize, oryg: f.size, przeskalowany: skala < 1 });
    setPlikLoading(false);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      if (wyplataEdit) {
        await onSave({ id: wyplataEdit.id, kwota, opis, data, zalacznik: plik, usun_zalacznik: usunZalacznik });
      } else {
        await onSave({ skladka_id: skladkaId, kwota, opis, data, zalacznik: plik });
      }
      onClose();
    }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">{wyplataEdit ? 'Edytuj wypłatę' : 'Dodaj wypłatę'}</h3>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Kwota (zł) *</label>
            <input type="number" min="0.01" step="0.01" value={kwota} onChange={e => setKwota(e.target.value)}
              className="w-full border border-sage-200 rounded-xl px-4 py-2.5 font-mono text-ink focus:outline-none focus:border-sage-600" required />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Opis *</label>
            <input value={opis} onChange={e => setOpis(e.target.value)}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="np. Wpłata za hotel" required />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">
              Załącznik
              <span className="font-normal text-sage-400 ml-1">(obrazki auto-skalowane do 1920px, PDF max 5 MB)</span>
            </label>
            {wyplataEdit?.zalacznik_nazwa && !usunZalacznik && !plik && (
              <div className="flex items-center justify-between bg-sage-50 rounded-xl px-3 py-2 mb-2">
                <span className="font-body text-xs text-sage-600 dark:text-sage-400 dark:text-gray-500">📎 {wyplataEdit.zalacznik_nazwa}</span>
                <button type="button" onClick={() => setUsunZalacznik(true)}
                  className="text-xs text-rose-400 hover:text-rose-500 font-body underline ml-2">Usuń</button>
              </div>
            )}
            {usunZalacznik && (
              <div className="text-xs text-rose-400 font-body mb-2">
                Załącznik zostanie usunięty.{' '}
                <button type="button" onClick={() => setUsunZalacznik(false)} className="underline">Cofnij</button>
              </div>
            )}
            <input type="file" onChange={handleFile} accept="image/*,application/pdf"
              className="w-full text-sm font-body text-sage-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sage-100 file:text-sage-700 hover:file:bg-sage-200" />
            {plikLoading && (
              <div className="text-xs text-sage-400 mt-1 font-body">⏳ Przetwarzanie obrazka...</div>
            )}
            {plik && !plikLoading && (
              <div className="text-xs text-sage-500 mt-1 space-y-0.5">
                <div>✓ {plik.nazwa}</div>
                {plik.przeskalowany
                  ? <div className="text-sage-400 dark:text-gray-500">
                      Zmniejszono: {(plik.oryg / 1024).toFixed(0)} KB → {(plik.rozmiar / 1024).toFixed(0)} KB
                    </div>
                  : <div className="text-sage-400 dark:text-gray-500">{(plik.rozmiar / 1024).toFixed(0)} KB</div>
                }
              </div>
            )}
          </div>
          {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">Anuluj</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-rose-500 text-white rounded-xl py-2.5 font-display font-600 hover:bg-rose-600 disabled:opacity-50">
              {saving ? '...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Główny komponent ─────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'nazwisko', label: 'Alfabetycznie' },
  { value: 'niezaplacone', label: 'Najpierw nieopłacone' },
  { value: 'zaplacone', label: 'Najpierw opłacone' },
  { value: 'czesciowo', label: 'Najpierw częściowe' },
];

export default function SkladkaDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [ogolne, setOgolne] = useState([]);
  const [wyplaty, setWyplaty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('wplaty');
  const [sortuj, setSortuj] = useState('nazwisko');
  const [filtruj, setFiltruj] = useState('wszystkie'); // wszystkie | zaplacone | czesciowo | niezaplacone

  const [historiaUczen, setHistoriaUczen] = useState(null);
  const [wplataModal, setWplataModal] = useState(null);
  const [wyplataModal, setWyplataModal] = useState(false);
  const [wyplataEdit, setWyplataEdit] = useState(null);
  const [dodajUczniaModal, setDodajUczniaModal] = useState(false);

  const isKsiegowy = ['admin', 'ksiegowy'].includes(user?.rola);
  const moznaEdytowac = isKsiegowy && data?.status === 'aktywna';

  const load = async () => {
    const [skladka, wplatyAll, wyplatyAll] = await Promise.all([
      api.getSkladka(id),
      api.getWplaty(id),
      api.getWyplaty(id),
    ]);
    setData(skladka);
    setOgolne(wplatyAll.filter(w => !w.uczen_id));
    setWyplaty(wyplatyAll);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleSaveWplata = async (form) => {
    if (form.id) await api.updateWplata(form.id, { kwota: form.kwota, data: form.data, notatka: form.notatka });
    else await api.addWplata(form);
    setWplataModal(null);
    load();
  };

  const handleSaveWyplata = async (form) => {
    if (form.id) {
      await api.updateWyplata(form.id, { kwota: form.kwota, opis: form.opis, data: form.data, zalacznik: form.zalacznik, usun_zalacznik: form.usun_zalacznik });
    } else {
      await api.addWyplata(form);
    }
    setWyplataEdit(null);
    load();
  };

  const handleDeleteWplata = async (wplataId) => {
    if (!confirm('Usunąć tę wpłatę?')) return;
    await api.deleteWplata(wplataId);
    load();
  };

  const handleRemoveUczen = async (uczenId) => {
    if (!confirm('Usunąć ucznia z tej składki? Jego wpłaty zostaną.')) return;
    await api.removeUczenFromSkladka(id, uczenId);
    load();
  };

  const wplaty = data?.wplaty || [];

  // Sortowanie i filtrowanie
  const statusOf = w => {
    const wp = parseFloat(w.wplacono), wym = parseFloat(w.kwota_na_osobe);
    return wp >= wym ? 'zaplacone' : wp > 0 ? 'czesciowo' : 'niezaplacone';
  };

  const sortWeight = { niezaplacone: 0, czesciowo: 1, zaplacone: 2 };

  const przefiltrowane = useMemo(() => {
    let list = [...wplaty];
    if (filtruj !== 'wszystkie') list = list.filter(w => statusOf(w) === filtruj);
    list.sort((a, b) => {
      if (sortuj === 'nazwisko') return `${a.nazwisko} ${a.imie}`.localeCompare(`${b.nazwisko} ${b.imie}`, 'pl');
      if (sortuj === 'niezaplacone') return sortWeight[statusOf(a)] - sortWeight[statusOf(b)];
      if (sortuj === 'zaplacone') return sortWeight[statusOf(b)] - sortWeight[statusOf(a)];
      if (sortuj === 'czesciowo') {
        const wa = statusOf(a) === 'czesciowo' ? -1 : 0;
        const wb = statusOf(b) === 'czesciowo' ? -1 : 0;
        return wa - wb || `${a.nazwisko}`.localeCompare(`${b.nazwisko}`, 'pl');
      }
      return 0;
    });
    return list;
  }, [wplaty, sortuj, filtruj]);

  const obecniIds = useMemo(() => new Set(wplaty.map(w => w.uczen_id)), [wplaty]);

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>;
  if (!data) return <div className="font-body text-rose-500 py-12 text-center">Nie znaleziono składki</div>;

  const zaplacili = wplaty.filter(w => statusOf(w) === 'zaplacone').length;
  const czesciowo = wplaty.filter(w => statusOf(w) === 'czesciowo').length;
  const niezaplacili = wplaty.filter(w => statusOf(w) === 'niezaplacone').length;
  const totalWplaty = wplaty.reduce((s, w) => s + parseFloat(w.wplacono), 0);
  const totalOgolne = ogolne.reduce((s, w) => s + parseFloat(w.kwota), 0);
  const totalZebrano = totalWplaty + totalOgolne;
  const totalCel = wplaty.reduce((s, w) => s + parseFloat(w.kwota_na_osobe), 0);
  const totalWyplaty = wyplaty.reduce((s, w) => s + parseFloat(w.kwota), 0);
  const saldo = totalZebrano - totalWyplaty;
  const pct = totalCel > 0 ? Math.min((totalZebrano / totalCel) * 100, 100) : 0;

  return (
    <div className="max-w-3xl">
      {dodajUczniaModal && (
        <DodajUczniaModal
          skladkaId={id}
          obecniIds={obecniIds}
          onClose={() => setDodajUczniaModal(false)}
          onSave={load}
        />
      )}
      {historiaUczen && (
        <HistoriaDrawer
          uczen={historiaUczen}
          skladkaId={id}
          onClose={() => setHistoriaUczen(null)}
          onEdytuj={(w) => setWplataModal({ wplataEdit: w, uczen: historiaUczen })}
          onUsun={handleDeleteWplata}
          onDodaj={() => setWplataModal({ uczen: historiaUczen })}
        />
      )}
      {wplataModal && (
        <WplataModal
          uczen={wplataModal.uczen || null}
          wplataEdit={wplataModal.wplataEdit || null}
          skladkaId={id}
          onClose={() => setWplataModal(null)}
          onSave={handleSaveWplata}
        />
      )}
      {(wyplataModal || wyplataEdit) && (
        <WyplataModal skladkaId={id} wyplataEdit={wyplataEdit} onClose={() => { setWyplataModal(false); setWyplataEdit(null); }}
          onSave={handleSaveWyplata} />
      )}

      <div className="mb-6">
        <Link to="/skladki" className="font-body text-sm text-sage-600 hover:text-sage-700">← Wróć do składek</Link>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-700 text-ink dark:text-gray-100">{data.nazwa}</h1>
              {data.status !== 'aktywna' && (
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full ${
                  data.status === 'zakonczona' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'
                }`}>
                  {data.status === 'zakonczona' ? 'Archiwalna' : 'Wstrzymana'}
                </span>
              )}
            </div>
            {data.opis && <p className="font-body text-sage-600 mt-1 text-sm">{data.opis}</p>}
            {data.termin && (
              <p className="font-body text-xs text-sage-500 mt-1">
                Termin: {new Date(data.termin).toLocaleDateString('pl-PL')}
              </p>
            )}
          </div>
          <div className="font-mono text-right">
            <div className="text-2xl font-700 text-sage-600 dark:text-sage-400 dark:text-gray-500">{totalZebrano.toFixed(2)} zł</div>
            <div className="text-xs text-sage-400 dark:text-gray-500">z {totalCel.toFixed(2)} zł</div>
            {totalWyplaty > 0 && <>
              <div className="text-xs text-rose-400 mt-1">−{totalWyplaty.toFixed(2)} zł wypłat</div>
              <div className={`text-sm font-600 mt-0.5 ${saldo >= 0 ? 'text-sage-600' : 'text-rose-500'}`}>
                saldo: {saldo.toFixed(2)} zł
              </div>
            </>}
          </div>
        </div>
        <div className="w-full bg-sage-100 dark:bg-gray-700 rounded-full h-2 mb-3">
          <div className="bg-sage-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-4 text-xs font-mono flex-wrap">
          <span className="text-sage-600 cursor-pointer hover:underline" onClick={() => { setTab('wplaty'); setFiltruj('zaplacone'); }}>✓ {zaplacili} zapłaciło</span>
          <span className="text-amber-600 cursor-pointer hover:underline" onClick={() => { setTab('wplaty'); setFiltruj('czesciowo'); }}>◑ {czesciowo} częściowo</span>
          <span className="text-rose-400 cursor-pointer hover:underline" onClick={() => { setTab('wplaty'); setFiltruj('niezaplacone'); }}>✗ {niezaplacili} nie zapłaciło</span>
          {totalOgolne > 0 && <span className="text-sage-400 dark:text-gray-500">+{totalOgolne.toFixed(2)} zł ogólnych</span>}
        </div>
      </div>

      {/* Akcje */}
      {moznaEdytowac && (
        <div className="flex gap-3 mb-5">
          <button onClick={() => setWplataModal({ uczen: null })}
            className="flex-1 border-2 border-dashed border-sage-200 rounded-xl py-2.5 font-body text-sm text-sage-500 hover:border-sage-400 hover:text-sage-600 transition-colors">
            + Wpłata ogólna
          </button>
          <button onClick={() => setWyplataModal(true)}
            className="flex-1 border-2 border-dashed border-rose-200 rounded-xl py-2.5 font-body text-sm text-rose-400 hover:border-rose-400 hover:text-rose-500 transition-colors">
            − Wypłata / wydatek
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-sage-100 dark:bg-gray-700 rounded-xl p-1 overflow-x-auto">
        {[['wplaty', 'Wpłaty uczniów'], ['ogolne', 'Wpłaty ogólne'], ['wyplaty', 'Wypłaty']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg font-body text-sm transition-all ${
              tab === key ? 'bg-white text-ink shadow-sm font-500' : 'text-sage-500 hover:text-sage-700'
            }`}>
            {label}
            {key === 'wyplaty' && wyplaty.length > 0 && <span className="ml-1 text-xs text-rose-400">({wyplaty.length})</span>}
          </button>
        ))}
      </div>

      {/* Tab: Wpłaty uczniów */}
      {tab === 'wplaty' && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap overflow-x-auto">
            {/* Filtry */}
            <div className="flex gap-1">
              {[
                ['wszystkie', 'Wszyscy', 'text-sage-600 bg-sage-50 border-sage-200'],
                ['niezaplacone', 'Nieopłacone', 'text-rose-500 bg-rose-50 border-rose-200'],
                ['czesciowo', 'Częściowe', 'text-amber-600 bg-amber-50 border-amber-200'],
                ['zaplacone', 'Opłacone', 'text-sage-600 bg-sage-100 border-sage-300'],
              ].map(([val, lbl, cls]) => (
                <button key={val} onClick={() => setFiltruj(val)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-body transition-all ${
                    filtruj === val ? cls + ' font-500' : 'text-sage-400 bg-white border-sage-100 hover:border-sage-200'
                  }`}>
                  {lbl}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Sortowanie */}
            <select value={sortuj} onChange={e => setSortuj(e.target.value)}
              className="text-xs font-body border border-sage-200 rounded-lg px-2.5 py-1.5 text-sage-600 focus:outline-none focus:border-sage-400 bg-white">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Eksport */}
            <button onClick={() => exportToExcel(wplaty, ogolne, data.nazwa)}
              className="text-xs font-body border border-sage-200 rounded-lg px-2.5 py-1.5 text-sage-600 hover:border-sage-400 hover:bg-sage-50 dark:hover:bg-gray-700 bg-white flex items-center gap-1">
              ⬇ Excel
            </button>

            {/* Dodaj ucznia */}
            {isKsiegowy && (
              <button onClick={() => setDodajUczniaModal(true)}
                className="text-xs font-body border border-sage-200 rounded-lg px-2.5 py-1.5 text-sage-600 hover:border-sage-400 hover:bg-sage-50 dark:hover:bg-gray-700 bg-white flex items-center gap-1">
                + Uczeń
              </button>
            )}
          </div>

          <div className="space-y-2">
            {przefiltrowane.length === 0 && (
              <div className="text-center py-8 font-body text-sage-400 dark:text-gray-500">
                {filtruj === 'wszystkie' ? 'Brak uczniów w składce' : 'Brak wyników dla wybranego filtra'}
              </div>
            )}
            {przefiltrowane.map(w => {
              const wplacono = parseFloat(w.wplacono);
              const wymagana = parseFloat(w.kwota_na_osobe);
              const status = statusOf(w);
              const nieaktywny = w.aktywny === false || w.aktywny === 'false';
              const icons = { zaplacone: '✓', czesciowo: '◑', niezaplacone: '✗' };
              const colors = { zaplacone: 'text-sage-600', czesciowo: 'text-amber-600', niezaplacone: 'text-rose-400' };
              const rowBgMap = { zaplacone: 'bg-white', czesciowo: 'bg-amber-50/40', niezaplacone: 'bg-rose-50/30' };
              const rowBg = nieaktywny ? 'bg-gray-50' : rowBgMap[status];
              return (
                <div key={w.uczen_id} className={`${rowBg} rounded-xl border ${nieaktywny ? 'border-gray-200 opacity-60' : 'border-sage-100'} px-4 py-3`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-lg ${nieaktywny ? 'text-gray-400' : colors[status]}`}>{icons[status]}</span>
                      <div>
                        <div className={`font-body text-sm font-500 flex items-center gap-2 ${nieaktywny ? 'text-gray-400' : 'text-ink'}`}>
                          {w.nazwisko} {w.imie}
                          {nieaktywny && <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">Nieaktywny</span>}
                        </div>
                        {status === 'czesciowo' && (
                          <div className="font-mono text-xs text-amber-600">brakuje {parseFloat(w.pozostalo).toFixed(2)} zł</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-sm ${colors[status]}`}>
                        {wplacono.toFixed(2)} / {wymagana.toFixed(2)} zł
                      </span>
                      {isKsiegowy && (
                        <div className="flex gap-2 items-center">
                          <button onClick={() => setHistoriaUczen(w)}
                            className="text-xs border border-sage-200 text-sage-600 px-3 py-1 rounded-lg hover:bg-sage-50 dark:hover:bg-gray-700 font-body">
                            Edytuj
                          </button>
                          <button onClick={() => handleRemoveUczen(w.uczen_id)}
                            className="text-xs text-sage-300 hover:text-rose-400 font-body" title="Usuń ze składki">✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Wpłaty ogólne */}
      {tab === 'ogolne' && (
        <div className="space-y-2">
          {ogolne.length === 0 && <div className="text-center py-8 font-body text-sage-500 dark:text-gray-400">Brak wpłat ogólnych</div>}
          {ogolne.map(w => (
            <div key={w.id} className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-body text-sm text-ink dark:text-gray-100">{w.notatka || 'Wpłata ogólna'}</div>
                <div className="font-body text-xs text-sage-400 dark:text-gray-500">{new Date(w.data).toLocaleDateString('pl-PL')}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-500 text-amber-700">{parseFloat(w.kwota).toFixed(2)} zł</span>
                {moznaEdytowac && (
                  <div className="flex gap-2">
                    <button onClick={() => setWplataModal({ wplataEdit: w })}
                      className="text-xs text-sage-600 underline hover:text-sage-700 font-body">Edytuj</button>
                    <button onClick={() => handleDeleteWplata(w.id)}
                      className="text-xs text-rose-400 underline hover:text-rose-500 font-body">Usuń</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Wypłaty */}
      {tab === 'wyplaty' && (
        <div className="space-y-2">
          {wyplaty.length === 0 && <div className="text-center py-8 font-body text-sage-500 dark:text-gray-400">Brak wypłat</div>}
          {wyplaty.map(w => (
            <div key={w.id} className="bg-white dark:bg-gray-800 border border-rose-100 dark:border-red-900/40 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-body text-sm font-500 text-ink dark:text-gray-100">{w.opis}</div>
                <div className="font-body text-xs text-sage-400 dark:text-gray-500">{new Date(w.data).toLocaleDateString('pl-PL')}</div>
                {w.zalacznik_nazwa && (
                  <ZalacznikPreview
                    wyplataId={w.id}
                    nazwa={w.zalacznik_nazwa}
                    typ={w.zalacznik_typ}
                  />
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-500 text-rose-500">−{parseFloat(w.kwota).toFixed(2)} zł</span>
                {moznaEdytowac && (
                  <div className="flex gap-2">
                    <button onClick={() => setWyplataEdit(w)}
                      className="text-xs text-sage-600 underline hover:text-sage-700 font-body">Edytuj</button>
                    <button onClick={async () => { if (!confirm('Usunąć?')) return; await api.deleteWyplata(w.id); load(); }}
                      className="text-xs text-rose-400 underline hover:text-rose-500 font-body">Usuń</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

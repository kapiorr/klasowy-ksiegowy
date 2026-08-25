import { useEffect, useState, useRef } from 'react';
import { api, wylogujUzytkownika, wylogujWszystkich, downloadUzytkownicyCsv } from '../api.js';
import { useDialog } from '../components/Dialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// ── Modal: dodaj użytkownika ──────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
  { value: 15,   label: '15 minut' },
  { value: 60,   label: '1 godzina' },
  { value: 120,  label: '2 godziny' },
  { value: 360,  label: '6 godzin' },
  { value: 1440, label: '1 dzień' },
  { value: 2880, label: '2 dni' },
  { value: 7200, label: '5 dni' },
  { value: 10080,label: '7 dni' },
];
function DodajModal({ ucznowie, onClose, onSave }) {
  const [form, setForm] = useState({ login: '', haslo: '', rola: 'podglad', uczen_id: '', email: '', telefon: '', imie: '', nazwisko: '', sms_powiadomienia: false, pomijaj_hibp: false });
  const [wyslijMail, setWyslijMail] = useState(false);
  const [linkExpiry, setLinkExpiry] = useState(15);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showHaslo, setShowHaslo] = useState(false);

  // Generuj bezpieczne hasło przy otwarciu formularza
  useEffect(() => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const haslo = Array.from(arr).map(b => chars[b % chars.length]).join('');
    setForm(f => ({ ...f, haslo }));
  }, []);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    if (wyslijMail && !form.email) { setErr('Podaj email aby wysłać zaproszenie'); setSaving(false); return; }
    if (!wyslijMail && form.haslo.length < 8) { setErr('Hasło min. 8 znaków'); setSaving(false); return; }
    if (form.rola === 'podglad' && !form.uczen_id) { setErr('Rola "Podgląd" wymaga przypisania ucznia'); setSaving(false); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setErr('Nieprawidłowy format adresu email'); setSaving(false); return; }

    try { await onSave(form, wyslijMail, linkExpiry); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">Nowy użytkownik</h3>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">Imię</label>
              <input value={form.imie} onChange={e => setForm(f => ({ ...f, imie: e.target.value }))}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-3 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
            </div>
            <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">Nazwisko</label>
              <input value={form.nazwisko} onChange={e => setForm(f => ({ ...f, nazwisko: e.target.value }))}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-3 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
            </div>
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Login *</label>
            <input value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" required />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">
              {wyslijMail ? 'Hasło (opcjonalne — użytkownik ustawi przez link)' : 'Hasło * (min. 8 znaków)'}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type={showHaslo ? 'text' : 'password'} value={form.haslo}
                  onChange={e => setForm(f => ({ ...f, haslo: e.target.value }))}
                  className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 pr-10 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600 disabled:opacity-40"
                  minLength={wyslijMail ? 0 : 8} disabled={wyslijMail}
                  placeholder={wyslijMail ? 'zostanie ustawione przez użytkownika' : ''} />
                {!wyslijMail && (
                  <button type="button" onClick={() => setShowHaslo(s => !s)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${showHaslo ? 'text-rose-500' : 'text-sage-400 hover:text-sage-600'}`}
                    title={showHaslo ? 'Ukryj hasło' : 'Pokaż hasło'}>
                    {showHaslo ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {!wyslijMail && (
                <button type="button" title="Generuj nowe hasło" onClick={() => {
                  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
                  const arr = new Uint8Array(16);
                  crypto.getRandomValues(arr);
                  const haslo = Array.from(arr).map(b => chars[b % chars.length]).join('');
                  setForm(f => ({ ...f, haslo }));
                  setShowHaslo(true);
                }} className="border border-sage-200 text-sage-500 hover:text-sage-700 hover:bg-sage-50 rounded-xl px-3 py-2.5 text-sm">
                  ↺
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="opcjonalnie" />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Telefon <span className="text-sage-400 text-xs">(opcjonalny)</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-body text-sage-500 select-none">+48</span>
              <input type="tel" value={form.telefon} onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                  const fmt = digits.length > 6 ? digits.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1 $2 $3').trim()
                    : digits.length > 3 ? digits.replace(/(\d{3})(\d{0,3})/, '$1 $2').trim() : digits;
                  setForm(f => ({ ...f, telefon: fmt }));
                }}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl pl-14 pr-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
                placeholder="600 123 456" maxLength={11} />
            </div>
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Rola *</label>
            <select value={form.rola} onChange={e => setForm(f => ({ ...f, rola: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600">
              <option value="admin">Admin</option>
              <option value="ksiegowy">Księgowy</option>
              <option value="podglad_pelny">Podgląd pełny</option>
              <option value="podglad">Podgląd (własny uczeń)</option>
            </select>
          </div>
          {form.telefon && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.sms_powiadomienia || false} onChange={e => setForm(f => ({ ...f, sms_powiadomienia: e.target.checked }))}
                className="rounded border-sage-300" />
              <span className="font-body text-sm text-ink dark:text-gray-100">Wysyłaj powiadomienia SMS</span>
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.pomijaj_hibp || false} onChange={e => setForm(f => ({ ...f, pomijaj_hibp: e.target.checked }))}
                className="rounded border-sage-300" />
              <span className="font-body text-sm text-ink dark:text-gray-100">Pomiń sprawdzanie hasła w bazie wycieków <span className="text-sage-400 text-xs">(HIBP)</span></span>
            </label>
          <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">
                Powiązany uczeń {form.rola === 'podglad' ? <span className="text-rose-400 text-xs">* wymagane</span> : <span className="text-sage-400 text-xs">(opcjonalne)</span>}
              </label>
              <select value={form.uczen_id} onChange={e => setForm(f => ({ ...f, uczen_id: e.target.value }))}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600">
                <option value="">— brak powiązania —</option>
                {ucznowie.map(u => <option key={u.id} value={u.id}>{u.nazwisko} {u.imie}</option>)}
              </select>
            </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={wyslijMail} onChange={e => setWyslijMail(e.target.checked)}
              className="mt-0.5 rounded border-sage-300" />
            <span className="font-body text-sm text-ink dark:text-gray-100">
              Wyślij mail powitalny z linkiem do ustawienia hasła
            </span>
          </label>
          {wyslijMail && (
            <div className="flex items-center gap-2 pl-6">
              <label className="font-body text-sm text-sage-600">Link ważny przez</label>
              <select value={linkExpiry} onChange={e => setLinkExpiry(parseInt(e.target.value))}
                className="border border-sage-200 rounded-lg px-2 py-1.5 font-body text-sm text-ink focus:outline-none focus:border-sage-600">
                {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50">Anuluj</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
              {saving ? '...' : wyslijMail ? 'Dodaj i wyślij mail' : 'Dodaj'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal: edytuj użytkownika ─────────────────────────────────────────────────
function EdytujModal({ user, ucznowie, onClose, onSave }) {
  const [form, setForm] = useState({
    rola: user.rola,
    email: user.email || '',
    telefon: user.telefon || '',
    uczen_id: user.uczen_id || '',
    imie: user.imie || '',
    nazwisko: user.nazwisko || '',
    sms_powiadomienia: user.sms_powiadomienia || false,
    pomijaj_hibp: user.pomijaj_hibp || false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('');
    try { await onSave(user.id, form); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-sage-100 dark:border-gray-700 dark:border-gray-700">
          <h3 className="font-display font-700 text-ink dark:text-gray-100">Edytuj użytkownika</h3>
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">{user.login}</p>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">Imię</label>
              <input value={form.imie} onChange={e => setForm(f => ({ ...f, imie: e.target.value }))}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-3 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
            </div>
            <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">Nazwisko</label>
              <input value={form.nazwisko} onChange={e => setForm(f => ({ ...f, nazwisko: e.target.value }))}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-3 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600" />
            </div>
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Rola</label>
            <select value={form.rola} onChange={e => setForm(f => ({ ...f, rola: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600">
              <option value="admin">Admin</option>
              <option value="ksiegowy">Księgowy</option>
              <option value="podglad_pelny">Podgląd pełny</option>
              <option value="podglad">Podgląd (własny uczeń)</option>
            </select>
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="opcjonalnie" />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Telefon <span className="text-sage-400 text-xs">(opcjonalny)</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-body text-sage-500 select-none">+48</span>
              <input type="tel" value={form.telefon || ''} onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                  const fmt = digits.length > 6 ? digits.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1 $2 $3').trim()
                    : digits.length > 3 ? digits.replace(/(\d{3})(\d{0,3})/, '$1 $2').trim() : digits;
                  setForm(f => ({ ...f, telefon: fmt }));
                }}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl pl-14 pr-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
                placeholder="600 123 456" maxLength={11} />
            </div>
          </div>
          {form.telefon && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.sms_powiadomienia || false} onChange={e => setForm(f => ({ ...f, sms_powiadomienia: e.target.checked }))}
                className="rounded border-sage-300" />
              <span className="font-body text-sm text-ink dark:text-gray-100">Wysyłaj powiadomienia SMS</span>
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.pomijaj_hibp || false} onChange={e => setForm(f => ({ ...f, pomijaj_hibp: e.target.checked }))}
                className="rounded border-sage-300" />
              <span className="font-body text-sm text-ink dark:text-gray-100">Pomiń sprawdzanie hasła w bazie wycieków <span className="text-sage-400 text-xs">(HIBP)</span></span>
            </label>
          <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">
                Powiązany uczeń {form.rola === 'podglad' ? <span className="text-rose-400 text-xs">* wymagane</span> : <span className="text-sage-400 text-xs">(opcjonalne)</span>}
              </label>
              <select value={form.uczen_id} onChange={e => setForm(f => ({ ...f, uczen_id: e.target.value }))}
                className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600">
                <option value="">— brak powiązania —</option>
                {ucznowie.map(u => <option key={u.id} value={u.id}>{u.nazwisko} {u.imie}</option>)}
              </select>
            </div>
          {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50">Anuluj</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
              {saving ? '...' : 'Zapisz'}
            </button>
          </div>
          {user.email && (
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-2">
                <span className="font-body text-sm text-sage-600">Link ważny przez</span>
                <select id="editLinkExpiry" defaultValue={15}
                  className="border border-sage-200 rounded-lg px-2 py-1.5 font-body text-sm text-ink focus:outline-none focus:border-sage-600">
                  {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button type="button"
                onClick={async () => {
                  const minuty = parseInt(document.getElementById('editLinkExpiry')?.value || 15);
                  const label = EXPIRY_OPTIONS.find(o => o.value === minuty)?.label || `${minuty} minut`;
                  if (!await confirm(`Wysłać link do ustawienia hasła na ${user.email}? Link będzie ważny ${label}.`)) return;
                  try { await api.wyslijZaproszenie(user.id, minuty); onClose(); await alert('Mail wysłany!', 'success'); }
                  catch (e) { await alert('Błąd: ' + e.message, 'error'); }
                }}
                className="w-full border border-sage-200 text-sage-600 font-body text-sm py-2.5 rounded-xl hover:bg-sage-50">
                ✉ Wyślij link do ustawienia hasła
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ── Modal: import CSV użytkowników ────────────────────────────────────────────
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
      const res = await api.importUzytkownicyCsv(csv);
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
          <h3 className="font-display font-700 text-ink dark:text-gray-100">Import użytkowników z CSV</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-sage-50 dark:bg-gray-700/50 rounded-xl px-4 py-3 font-body text-xs text-sage-600 space-y-1">
            <div className="font-500">Format pliku CSV (separator: średnik):</div>
            <div className="font-mono text-xs break-all">login;haslo;rola;email;imie;nazwisko;telefon;sms_powiadomienia</div>
            <div className="font-body text-xs text-sage-400 mt-1">Rola: admin / ksiegowy / podglad_pelny / podglad &nbsp;·&nbsp; SMS: tak / nie &nbsp;·&nbsp; Nagłówek opcjonalny</div>
            <div className="font-mono text-sage-400 dark:text-gray-500">jan.k;haslo123;podglad;jan@szkola.pl;Jan;Kowalski</div>
            <div className="mt-1 space-y-0.5">
              <div>• rola: <span className="font-mono">ksiegowy</span> / <span className="font-mono">podglad_pelny</span> / <span className="font-mono">podglad</span> (domyślnie podglad)</div>
              <div>• email, imie, nazwisko — opcjonalne</div>
              <div>• hasło wymagane przy następnym logowaniu</div>
            </div>
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Wybierz plik CSV</label>
            <input type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFile}
              className="w-full text-sm font-body text-sage-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sage-100 file:text-sage-700 hover:file:bg-sage-200" />
          </div>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">lub wklej zawartość</label>
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={4}
              className="w-full border border-sage-200 rounded-xl px-4 py-2.5 font-mono text-xs text-ink focus:outline-none focus:border-sage-600 resize-none"
              placeholder="login;haslo;rola;email;imie;nazwisko;telefon;sms_powiadomienia" />
          </div>
          {result && (
            <div className={`rounded-xl px-4 py-3 font-body text-sm space-y-1 ${result.blad ? 'bg-rose-50 text-rose-600' : 'bg-sage-100 text-sage-700'}`}>
              {result.blad ? <div>Błąd: {result.blad}</div> : (<>
                <div>✓ Dodano: {result.dodano} użytkowników</div>
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

// ── Główny komponent ──────────────────────────────────────────────────────────
export default function Uzytkownicy() {
  const [uzytkownicy, setUzytkownicy] = useState([]);
  const [ucznowie, setUcznowie] = useState([]);
  const [dodajModal, setDodajModal] = useState(false);
  const [edytujUser, setEdytujUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: 'ok' });

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: 'ok' }), 3000);
  };

  const { user } = useAuth();
  const { confirm, alert } = useDialog();
  const isAdmin = user?.rola === 'admin';

  const load = async () => {
    const [u, uc] = await Promise.all([api.getUzytkownicy(), api.getUcznowie()]);
    setUzytkownicy(u); setUcznowie(uc); setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDodaj = async (form, wyslijMail, linkExpiry = 15) => {
    // Jeśli wysyłamy mail — ustaw tymczasowe hasło jeśli nie podano
    const dataDoWyslania = { ...form };
    if (wyslijMail && !form.haslo) {
      dataDoWyslania.haslo = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    const nowy = await api.addUzytkownik(dataDoWyslania);
    if (wyslijMail && nowy?.id) {
      try {
        await api.wyslijZaproszenie(nowy.id, linkExpiry);
        showMsg('Użytkownik dodany — mail powitalny wysłany');
      } catch {
        showMsg('Użytkownik dodany, ale nie udało się wysłać maila', 'err');
      }
    } else {
      showMsg('Użytkownik dodany');
    }
    load();
  };
  const handleEdytuj = async (id, form) => { await api.updateUzytkownik(id, form); showMsg('Zapisano'); load(); };
  const handleDelete = async (id) => {
    if (!await confirm('Usunąć użytkownika?')) return;
    await api.deleteUzytkownik(id); load();
  };
  const handleMfaWymuszone = async (id, current) => { await api.setMfaWymuszone(id, !current); load(); };
  const handleResetMfa = async (id) => {
    if (!await confirm('Zresetować MFA temu użytkownikowi? Będzie musiał skonfigurować je ponownie.')) return;
    await api.resetMfa(id);
    showMsg('MFA zostało zresetowane');
    load();
  };

  const handleWymusHaslo = async (u) => {
    if (u.force_password_change) {
      if (!await confirm('Cofnąć wymuszenie zmiany hasła?')) return;
      await api.cofnijWymuszenieHasla(u.id);
      showMsg('Wymuszenie zmiany hasła cofnięte');
    } else {
      if (!await confirm('Wymusić zmianę hasła przy następnym logowaniu?')) return;
      await api.wymusPrzycZmianyHasla(u.id);
      showMsg('Zmiana hasła zostanie wymuszona');
    }
    load();
  };

  const roleLabel = (r) => r === 'admin' ? 'Admin' : r === 'ksiegowy' ? 'Księgowy' : r === 'podglad_pelny' ? 'Podgląd pełny' : 'Podgląd';
  const roleBg = (r) => r === 'admin' ? 'bg-purple-100 text-purple-700' : r === 'ksiegowy' ? 'bg-sage-100 text-sage-700' : r === 'podglad_pelny' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500';

  if (loading) return <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>;

  return (
    <div className="max-w-5xl">
      {dodajModal && <DodajModal ucznowie={ucznowie} onClose={() => setDodajModal(false)} onSave={handleDodaj} />}
      {edytujUser && <EdytujModal user={edytujUser} ucznowie={ucznowie} onClose={() => setEdytujUser(null)} onSave={handleEdytuj} />}
      {importModal && <ImportModal onClose={() => setImportModal(false)} onDone={load} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Użytkownicy</h1>
          <p className="font-body text-sage-600 mt-1">{uzytkownicy.length} kont</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImportModal(true)}
            className="border border-sage-200 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50">
            ⬆ Import CSV
          </button>
          <button onClick={downloadUzytkownicyCsv}
            className="border border-sage-200 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50">
            ⬇ Eksport CSV
          </button>
          <button onClick={async () => {
            if (!await confirm('Unieważnić sesje WSZYSTKICH użytkowników? Zostaną wylogowani przy następnym requeście.')) return;
            const r = await wylogujWszystkich();
            await alert(`Wylogowano ${r.wylogowano} użytkowników`, 'success');
          }} className="border border-rose-200 text-rose-500 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-rose-50">
            ⎋ Wyloguj wszystkich
          </button>
          <button onClick={() => setDodajModal(true)}
            className="bg-ink text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700">
            + Nowy użytkownik
          </button>
        </div>
      </div>

      {msg.text && (
        <div className={`rounded-xl px-4 py-3 font-body text-sm mb-4 ${msg.type === 'ok' ? 'bg-sage-100 border border-sage-200 text-sage-700' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 divide-y divide-sage-50 dark:divide-gray-700">
        {uzytkownicy.filter(u => isAdmin || u.rola !== 'admin').map(u => (
          <div key={u.id} className="px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-body font-500 text-ink dark:text-gray-100">{u.login}</span>
                  {(u.imie || u.nazwisko) && (
                    <span className="font-body text-sm text-sage-500 dark:text-gray-400">({u.imie} {u.nazwisko})</span>
                  )}
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${roleBg(u.rola)}`}>
                    {roleLabel(u.rola)}
                  </span>
                  {u.mfa_enabled && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-green-50 text-green-600">MFA ✓</span>}
                  {u.force_password_change && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Zmiana hasła ⚠</span>}
                </div>
                {u.email && <div className="font-body text-xs text-sage-400 mt-0.5">{u.email}</div>}
                {u.telefon && <div className="font-body text-xs text-sage-400">+48 {u.telefon}</div>}
                {u.uczen_imie && <div className="font-body text-xs text-sage-400 mt-0.5">↳ {u.uczen_imie} {u.uczen_nazwisko}</div>}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  {/* Desktop: wszystkie przyciski */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => setEdytujUser(u)}
                      className="text-xs font-body border border-sage-200 text-sage-600 px-3 py-1 rounded-lg hover:bg-sage-50">
                      Edytuj
                    </button>
                    <button onClick={() => handleMfaWymuszone(u.id, u.mfa_wymuszone)}
                      className={`text-xs font-body px-3 py-1 rounded-lg border transition-colors ${
                        u.mfa_wymuszone ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-sage-200 text-sage-400 hover:border-sage-400'
                      }`}>
                      {u.mfa_wymuszone ? 'MFA ✓' : 'MFA'}
                    </button>
                    {u.mfa_enabled && (
                      <button onClick={() => u.id !== user?.id && handleResetMfa(u.id)}
                        disabled={u.id === user?.id}
                        className={`text-xs font-body border px-3 py-1 rounded-lg transition-colors ${
                          u.id === user?.id ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-rose-200 text-rose-500 hover:bg-rose-50'
                        }`}>
                        Reset MFA
                      </button>
                    )}
                    <button onClick={() => handleWymusHaslo(u)}
                      className={`text-xs font-body border px-3 py-1 rounded-lg transition-colors ${
                        u.force_password_change ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'border-amber-200 text-amber-600 hover:bg-amber-50'
                      }`}>
                      {u.force_password_change ? 'Cofnij wymuszenie' : 'Wymuś hasło'}
                    </button>
                    {u.id !== user?.id && (
                      <button onClick={async () => {
                        if (!await confirm(`Unieważnić sesję użytkownika ${u.login}?`)) return;
                        await wylogujUzytkownika(u.id);
                        showMsg('Sesja unieważniona');
                      }} className="text-xs font-body border border-amber-200 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-50">
                        ⎋ Wyloguj
                      </button>
                    )}
                    <button onClick={() => handleDelete(u.id)} disabled={u.id === user?.id}
                      className={`text-xs font-body border px-3 py-1 rounded-lg transition-colors ${
                        u.id === user?.id ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-rose-200 text-rose-500 hover:bg-rose-50'
                      }`}>
                      Usuń
                    </button>
                  </div>
                  {/* Mobile: przycisk Edytuj + menu ··· */}
                  <div className="flex sm:hidden items-center gap-1.5">
                    <button onClick={() => setEdytujUser(u)}
                      className="text-xs font-body border border-sage-200 text-sage-600 px-3 py-1.5 rounded-lg hover:bg-sage-50">
                      Edytuj
                    </button>
                    <div className="relative">
                      <button onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                        className="text-xs font-body border border-sage-200 text-sage-600 px-3 py-1.5 rounded-lg hover:bg-sage-50">
                        ···
                      </button>
                      {menuOpen === u.id && (
                        <div className="absolute right-0 top-8 bg-white dark:bg-gray-800 border border-sage-100 dark:border-gray-700 rounded-xl shadow-lg z-10 min-w-[160px] py-1">
                          <button onClick={() => { handleMfaWymuszone(u.id, u.mfa_wymuszone); setMenuOpen(null); }}
                            className="w-full text-left text-xs font-body px-4 py-2.5 hover:bg-sage-50 dark:hover:bg-gray-700 text-ink dark:text-gray-100">
                            {u.mfa_wymuszone ? '✓ MFA wymuszone' : 'Wymuś MFA'}
                          </button>
                          {u.mfa_enabled && (
                            <button onClick={() => { if (u.id !== user?.id) { handleResetMfa(u.id); setMenuOpen(null); } }}
                              disabled={u.id === user?.id}
                              className="w-full text-left text-xs font-body px-4 py-2.5 hover:bg-sage-50 dark:hover:bg-gray-700 text-rose-500 disabled:text-gray-300">
                              Reset MFA
                            </button>
                          )}
                          <button onClick={() => { handleWymusHaslo(u); setMenuOpen(null); }}
                            className="w-full text-left text-xs font-body px-4 py-2.5 hover:bg-sage-50 dark:hover:bg-gray-700 text-amber-600">
                            {u.force_password_change ? 'Cofnij wymuszenie hasła' : 'Wymuś zmianę hasła'}
                          </button>
                          {u.id !== user?.id && (
                            <button onClick={async () => {
                              setMenuOpen(null);
                              if (!await confirm(`Unieważnić sesję ${u.login}?`)) return;
                              await wylogujUzytkownika(u.id);
                              showMsg('Sesja unieważniona');
                            }} className="w-full text-left text-xs font-body px-4 py-2.5 hover:bg-sage-50 dark:hover:bg-gray-700 text-amber-600">
                              ⎋ Wyloguj
                            </button>
                          )}
                          <div className="border-t border-sage-50 dark:border-gray-700 mt-1 pt-1">
                            <button onClick={() => { setMenuOpen(null); handleDelete(u.id); }}
                              disabled={u.id === user?.id}
                              className="w-full text-left text-xs font-body px-4 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 disabled:text-gray-300">
                              Usuń
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api, getMailingConfig, getMe, updateMeSms, getPushVapidKey, getPushStatus, pushSubscribe, pushUnsubscribe, pushTest, getPowiadomieniaAdmin, savePowiadomieniaAdmin } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// ── Sekcja: zmiana hasła ──────────────────────────────────────────────────────
function ZmianaHasla() {
  const [form, setForm] = useState({ stare_haslo: '', nowe_haslo: '', nowe_haslo2: '' });
  const [status, setStatus] = useState(''); // '' | 'ok' | 'error'
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.nowe_haslo !== form.nowe_haslo2) { setStatus('error'); setMsg('Hasła nie są identyczne'); return; }
    if (form.nowe_haslo.length < 8) { setStatus('error'); setMsg('Hasło min. 8 znaków'); return; }
    setLoading(true); setStatus(''); setMsg('');
    try {
      await api.zmienHaslo({ stare_haslo: form.stare_haslo, nowe_haslo: form.nowe_haslo });
      setStatus('ok'); setMsg('Hasło zostało zmienione');
      setForm({ stare_haslo: '', nowe_haslo: '', nowe_haslo2: '' });
    } catch (e) { setStatus('error'); setMsg(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
      <h2 className="font-display font-700 text-ink text-lg mb-4">Zmiana hasła</h2>
      <form onSubmit={submit} className="space-y-4 w-full max-w-sm">
        {[
          { key: 'stare_haslo', label: 'Obecne hasło' },
          { key: 'nowe_haslo', label: 'Nowe hasło' },
          { key: 'nowe_haslo2', label: 'Powtórz nowe hasło' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="block font-body text-sm font-500 text-ink mb-1">{label}</label>
            <input type="password" value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="••••••••" required />
          </div>
        ))}
        {msg && (
          <div className={`rounded-xl px-4 py-3 font-body text-sm ${status === 'ok' ? 'bg-sage-100 text-sage-700' : 'bg-rose-50 text-rose-500'}`}>
            {msg}
          </div>
        )}
        <button type="submit" disabled={loading}
          className="bg-ink text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700 disabled:opacity-50">
          {loading ? 'Zapisywanie...' : 'Zmień hasło'}
        </button>
      </form>
    </div>
  );
}

// ── Sekcja: MFA ───────────────────────────────────────────────────────────────
function MfaSekcja() {
  const [mfaStatus, setMfaStatus] = useState(null);
  const [krok, setKrok] = useState('idle'); // idle | setup | aktywny | wylacz
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [kod, setKod] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [hasloWylacz, setHasloWylacz] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  const loadStatus = async () => {
    const s = await api.mfaStatus();
    setMfaStatus(s);
  };

  useEffect(() => { loadStatus(); }, []);

  const startSetup = async () => {
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const data = await api.mfaSetup();
      setQr(data.qr); setSecret(data.secret);
      setKrok('setup');
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
    finally { setLoading(false); }
  };

  const aktywuj = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      const data = await api.mfaAktywuj(kod);
      setBackupCodes(data.backup_codes);
      setKrok('backup');
      await loadStatus();
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
    finally { setLoading(false); }
  };

  const wylacz = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg({ text: '', type: '' });
    try {
      await api.mfaWylacz(hasloWylacz);
      setKrok('idle'); setHasloWylacz('');
      setMsg({ text: 'MFA zostało wyłączone', type: 'ok' });
      await loadStatus();
    } catch (e) { setMsg({ text: e.message, type: 'error' }); }
    finally { setLoading(false); }
  };

  if (!mfaStatus) return <div className="font-body text-sage-400 text-sm py-4">Ładowanie...</div>;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-700 text-ink text-lg">Uwierzytelnianie dwuskładnikowe (MFA)</h2>
        <span className={`text-xs font-mono px-2.5 py-1 rounded-full ${mfaStatus.mfa_enabled ? 'bg-sage-100 text-sage-700' : 'bg-gray-100 text-gray-500'}`}>
          {mfaStatus.mfa_enabled ? 'Włączone' : 'Wyłączone'}
        </span>
      </div>

      {mfaStatus.mfa_wymuszone && !mfaStatus.mfa_enabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 font-body text-sm text-amber-700">
          ⚠ Księgowy wymaga włączenia MFA dla Twojego konta.
        </div>
      )}

      {msg.text && (
        <div className={`rounded-xl px-4 py-3 mb-4 font-body text-sm ${msg.type === 'ok' ? 'bg-sage-100 text-sage-700' : 'bg-rose-50 text-rose-500'}`}>
          {msg.text}
        </div>
      )}

      {/* Nie skonfigurowane */}
      {!mfaStatus.mfa_enabled && krok === 'idle' && (
        <div className="space-y-3">
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
            Zwiększ bezpieczeństwo konta. Przy logowaniu będziesz proszona/y o kod z aplikacji
            takiej jak Google Authenticator lub Authy.
          </p>
          <button onClick={startSetup} disabled={loading}
            className="bg-ink text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700 disabled:opacity-50">
            {loading ? '...' : 'Włącz MFA'}
          </button>
        </div>
      )}

      {/* Setup — QR kod */}
      {krok === 'setup' && (
        <div className="space-y-4">
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
            Zeskanuj kod QR w aplikacji uwierzytelniającej (Google Authenticator, Authy, itp.),
            a następnie wpisz 6-cyfrowy kod który pojawi się w aplikacji.
          </p>
          <div className="flex justify-center">
            <img src={qr} alt="QR kod MFA" className="w-48 h-48 rounded-xl border border-sage-100 dark:border-gray-700" />
          </div>
          <div className="bg-sage-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">
            <div className="font-body text-xs text-sage-500 mb-1">Klucz ręczny (jeśli nie możesz zeskanować):</div>
            <div className="font-mono text-sm text-ink break-all">{secret}</div>
          </div>
          <form onSubmit={aktywuj} className="space-y-3">
            <div>
              <label className="block font-body text-sm font-500 text-ink mb-1">Kod weryfikacyjny</label>
              <input type="text" inputMode="numeric" maxLength={6} value={kod}
                onChange={e => setKod(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-sage-200 rounded-xl px-4 py-2.5 font-mono text-ink text-center text-xl tracking-widest focus:outline-none focus:border-sage-600"
                placeholder="000000" required autoFocus />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setKrok('idle')}
                className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
                Anuluj
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-ink text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700 disabled:opacity-50">
                {loading ? '...' : 'Aktywuj MFA'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Backup codes */}
      {krok === 'backup' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="font-body text-sm font-500 text-amber-700 mb-1">⚠ Zapisz kody zapasowe!</div>
            <div className="font-body text-xs text-amber-600">
              Jeśli stracisz dostęp do aplikacji uwierzytelniającej, użyj jednego z tych kodów.
              Każdy kod działa tylko raz. Przechowuj je w bezpiecznym miejscu.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <div key={i} className="bg-sage-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 font-mono text-sm text-ink text-center">
                {code}
              </div>
            ))}
          </div>
          <button onClick={() => { setKrok('idle'); setMsg({ text: 'MFA zostało włączone ✓', type: 'ok' }); }}
            className="w-full bg-sage-600 text-white font-display font-600 py-2.5 rounded-xl hover:bg-sage-700">
            Zapisałem/am kody — zamknij
          </button>
        </div>
      )}

      {/* MFA włączone */}
      {mfaStatus.mfa_enabled && krok === 'idle' && (
        <div className="space-y-3">
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
            MFA jest aktywne. Pozostało {mfaStatus.backup_codes_count ?? 0} kodów zapasowych.
          </p>
          {!mfaStatus.mfa_wymuszone && (
            <button onClick={() => setKrok('wylacz')}
              className="text-sm font-body text-rose-400 hover:text-rose-500 underline">
              Wyłącz MFA
            </button>
          )}
          {mfaStatus.mfa_wymuszone && (
            <p className="font-body text-xs text-sage-400 dark:text-gray-500">MFA jest wymuszone przez księgowego — nie możesz go wyłączyć.</p>
          )}
        </div>
      )}

      {/* Wyłącz MFA */}
      {krok === 'wylacz' && (
        <form onSubmit={wylacz} className="space-y-4 w-full max-w-sm">
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">Podaj hasło aby potwierdzić wyłączenie MFA.</p>
          <div>
            <label className="block font-body text-sm font-500 text-ink mb-1">Hasło</label>
            <input type="password" value={hasloWylacz} onChange={e => setHasloWylacz(e.target.value)}
              className="w-full border border-sage-200 dark:border-gray-600 rounded-xl px-4 py-2.5 font-body text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
              placeholder="••••••••" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setKrok('idle')}
              className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
              Anuluj
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-rose-500 text-white rounded-xl py-2.5 font-display font-600 hover:bg-rose-600 disabled:opacity-50">
              {loading ? '...' : 'Wyłącz MFA'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Główna strona ustawień ────────────────────────────────────────────────────
function SmsSekcja() {
  const [me, setMe] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smsAvail, setSmsAvail] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([getMailingConfig(), getMe()])
      .then(([cfg, meData]) => {
        setSmsAvail(cfg.sms_enabled);
        setMe(meData);
        setEnabled(meData.sms_powiadomienia || false);
      }).catch(() => {});
  }, []);

  if (!smsAvail) return null;
  if (!me?.telefon) return null; // brak telefonu — nie ma sensu

  const handleToggle = async (val) => {
    setSaving(true); setMsg('');
    try {
      await updateMeSms(val);
      setEnabled(val);
      setMsg(val ? 'Powiadomienia SMS włączone' : 'Powiadomienia SMS wyłączone');
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
      <h2 className="font-display font-700 text-ink dark:text-gray-100 mb-1">📱 Powiadomienia SMS</h2>
      <p className="font-body text-sm text-sage-600 dark:text-sage-400 mb-4">
        Numer telefonu: <span className="font-500 text-ink dark:text-gray-100">+48 {me.telefon}</span>
      </p>
      {msg && (
        <div className="font-body text-sm px-4 py-2.5 rounded-xl mb-4 bg-sage-50 text-sage-700 dark:bg-gray-700 dark:text-sage-300">
          {msg}
        </div>
      )}
      <label className="flex items-center gap-3 cursor-pointer">
        <div className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-sage-600' : 'bg-sage-200 dark:bg-gray-600'}`}
          onClick={() => !saving && handleToggle(!enabled)}>
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </div>
        <span className="font-body text-sm text-ink dark:text-gray-100">
          {enabled ? 'SMS włączone — otrzymuję powiadomienia' : 'SMS wyłączone — nie otrzymuję powiadomień'}
        </span>
      </label>
    </div>
  );
}

function PushSekcja() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [vapidKey, setVapidKey] = useState(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false); setLoading(false); return;
    }
    Promise.all([getPushVapidKey(), getPushStatus()])
      .then(([vk, ps]) => { setVapidKey(vk.key); setSubscribed(ps.subscribed); })
      .catch((e) => console.error('Push init:', e))
      .finally(() => setLoading(false));
  }, []);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  };

  const handleSubscribe = async () => {
    setLoading(true); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setMsg('Brak zgody na powiadomienia'); setLoading(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await pushSubscribe(sub.toJSON());
      setSubscribed(true);
      setMsg('Powiadomienia włączone!');
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally { setLoading(false); }
  };

  const handleUnsubscribe = async () => {
    setLoading(true); setMsg('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await pushUnsubscribe(sub.endpoint); await sub.unsubscribe(); }
      setSubscribed(false);
      setMsg('Powiadomienia wyłączone');
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally { setLoading(false); }
  };

  const handleTest = async () => {
    try { await pushTest(); setMsg('Testowe powiadomienie wysłane!'); }
    catch (e) { setMsg('Błąd: ' + e.message); }
  };

  if (!supported) return null;
  if (loading) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
      <h2 className="font-display font-700 text-ink dark:text-gray-100 mb-1">🔔 Powiadomienia push</h2>
      <p className="font-body text-sm text-sage-600 dark:text-sage-400 mb-4">
        Otrzymuj powiadomienia o nowych składkach i zaległościach nawet gdy aplikacja jest zamknięta.
      </p>
      {msg && (
        <div className={`font-body text-sm px-4 py-2.5 rounded-xl mb-4 ${msg.includes('Błąd') ? 'bg-rose-50 text-rose-600' : 'bg-sage-50 text-sage-700'}`}>
          {msg}
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        {!subscribed ? (
          <button onClick={handleSubscribe} disabled={loading}
            className="bg-ink dark:bg-gray-900 text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700 disabled:opacity-50">
            {loading ? '⏳' : '🔔 Włącz powiadomienia'}
          </button>
        ) : (<>
          <button onClick={handleUnsubscribe} disabled={loading}
            className="border border-sage-200 dark:border-gray-600 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50 disabled:opacity-50">
            🔕 Wyłącz powiadomienia
          </button>
          <button onClick={handleTest} disabled={loading}
            className="border border-sage-200 dark:border-gray-600 text-sage-600 font-body text-sm px-4 py-2.5 rounded-xl hover:bg-sage-50">
            ↗ Wyślij testowe
          </button>
        </>)}
      </div>
      {subscribed && (
        <p className="font-body text-xs text-sage-400 mt-3">✓ Powiadomienia są aktywne na tym urządzeniu</p>
      )}
    </div>
  );
}


function PowiadomieniaSekcja() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const OPCJE = [
    { key: 'login_blocked', label: 'Blokada po nieudanych logowaniach' },
    { key: 'login_fail', label: 'Nieudane próby logowania' },
    { key: 'mfa_fail', label: 'Nieudana weryfikacja MFA' },
    { key: 'reset_hasla', label: 'Wysłanie linku resetu hasła' },
    { key: 'masowy_mailing', label: 'Masowa wysyłka wiadomości (>10 odbiorców)' },
    { key: 'restore_backup', label: 'Przywrócenie backupu' },
    { key: 'hibp_wyciekle', label: 'Logowanie z wyciekłym hasłem' },
  ];

  useEffect(() => {
    getPowiadomieniaAdmin().then(setPrefs).catch(() => {});
  }, []);

  if (user?.rola !== 'admin') return null;
  if (!prefs) return null;

  const toggle = (key) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await savePowiadomieniaAdmin(prefs);
      setMsg('Zapisano preferencje powiadomień');
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
      <h2 className="font-display font-700 text-ink dark:text-gray-100 mb-1">🔔 Powiadomienia email (admin)</h2>
      <p className="font-body text-sm text-sage-600 dark:text-sage-400 mb-4">
        Wybierz o czym chcesz być informowany mailem na <span className="font-500">{process.env.ADMIN_EMAIL || 'ADMIN_EMAIL'}</span>.
      </p>
      {msg && (
        <div className="font-body text-sm px-4 py-2.5 rounded-xl mb-4 bg-sage-50 text-sage-700 dark:bg-gray-700 dark:text-sage-300">{msg}</div>
      )}
      <div className="space-y-3 mb-5">
        {OPCJE.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={prefs[key] ?? true} onChange={() => toggle(key)}
              className="rounded border-sage-300 w-4 h-4" />
            <span className="font-body text-sm text-ink dark:text-gray-100">{label}</span>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="bg-ink dark:bg-gray-900 text-white font-display font-600 px-5 py-2.5 rounded-xl hover:bg-sage-700 disabled:opacity-50 text-sm">
        {saving ? '⏳ Zapisywanie...' : 'Zapisz'}
      </button>
    </div>
  );
}

export default function Ustawienia() {
  const { user } = useAuth();
  return (
    <div className="max-w-2xl space-y-6">
      <div className="mb-2">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Ustawienia</h1>
        <p className="font-body text-sage-600 mt-1">Konto: <span className="font-500">{user?.login}</span></p>
      </div>
      <ZmianaHasla />
      <MfaSekcja />
      <SmsSekcja />
      <PushSekcja />
      <PowiadomieniaSekcja />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export default function Login() {
  const [appInfo, setAppInfo] = useState({});
  useEffect(() => {
    fetch('/api/info').then(r => r.json()).then(setAppInfo).catch(() => {});
  }, []);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', haslo: '', mfa_kod: '', nowe_haslo: '', nowe_haslo2: '' });
  const [step, setStep] = useState('haslo'); // haslo | mfa | zmiana_hasla
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.login({
        login: form.login,
        haslo: form.haslo,
        ...(step === 'mfa' ? { mfa_kod: form.mfa_kod } : {}),
      });

      if (data?.awaiting_reset) {
        setError('Zmiana hasła możliwa tylko przez link wysłany na email. Sprawdź skrzynkę pocztową.');
        setLoading(false); return;
      }
      if (data?.mfa_required) {
        setStep('mfa'); setLoading(false); return;
      }
      if (data?.password_change_required) {
        setUserId(data.user_id);
        setStep('zmiana_hasla'); setLoading(false); return;
      }

      await login(data);
      navigate(data.user?.mfaSetupRequired ? '/ustawienia' : '/');
    } catch (err) {
      if (err.message?.includes('zablokowany')) {
        window.location.href = '/zablokowany';
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitZmianaHasla = async (e) => {
    e.preventDefault();
    if (form.nowe_haslo !== form.nowe_haslo2) { setError('Hasła nie są identyczne'); return; }
    if (form.nowe_haslo.length < 8) { setError('Hasło min. 8 znaków'); return; }
    setError(''); setLoading(true);
    try {
      await api.wymuszonaZmianaHasla(form.nowe_haslo);
      // Po zmianie hasła — zaloguj normalnie
      const data = await api.login({ login: form.login, haslo: form.nowe_haslo });
      await login(data);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-ink rounded-2xl mb-4">
            <span className="text-2xl">📒</span>
          </div>
          <h1 className="font-display text-3xl font-800 text-ink dark:text-gray-100">Klasowy Księgowy</h1>
          {(appInfo.class_name || appInfo.school_name) && (
            <p className="font-body text-sm font-500 text-ink dark:text-gray-200 mt-1">
              {appInfo.class_name && <span>Klasa {appInfo.class_name}</span>}
              {appInfo.class_name && appInfo.school_name && <span className="mx-2 text-sage-300">·</span>}
              {appInfo.school_name && <span>{appInfo.school_name}</span>}
            </p>
          )}
          <p className="font-body text-sage-600 mt-1">
            {step === 'mfa' && 'Podaj kod z aplikacji uwierzytelniającej'}
            {step === 'zmiana_hasla' && 'Ustaw nowe hasło aby kontynuować'}
            {step === 'haslo' && 'Zaloguj się aby zarządzać kasą'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-sage-100 p-8">
          {/* Krok: hasło */}
          {step === 'haslo' && (
            <form onSubmit={submitLogin} className="space-y-5">
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Login lub email</label>
                <input type="text" value={form.login}
                  onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="login lub email" required />
              </div>
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Hasło</label>
                <input type="password" value={form.haslo}
                  onChange={e => setForm(f => ({ ...f, haslo: e.target.value }))}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="••••••••" required />
                <div className="text-right mt-1">
                  <Link to="/reset-hasla" className="font-body text-xs text-sage-500 hover:text-sage-700">
                    Zapomniałem hasła
                  </Link>
                </div>
              </div>
              {error && <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-500 font-body text-sm">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-ink text-white font-display font-600 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50">
                {loading ? 'Logowanie...' : 'Zaloguj się'}
              </button>
            </form>
          )}

          {/* Krok: MFA */}
          {step === 'mfa' && (
            <form onSubmit={submitLogin} className="space-y-5">
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Kod MFA (6 cyfr)</label>
                <input type="text" inputMode="numeric" maxLength={6}
                  value={form.mfa_kod}
                  onChange={e => setForm(f => ({ ...f, mfa_kod: e.target.value.replace(/\D/g, '') }))}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-mono text-ink text-center text-xl tracking-widest focus:outline-none focus:border-sage-600"
                  placeholder="000000" autoFocus required />
                <p className="font-body text-xs text-sage-400 mt-2 text-center">Możesz też użyć kodu zapasowego</p>
              </div>
              {error && <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-500 font-body text-sm">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-ink text-white font-display font-600 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50">
                {loading ? '...' : 'Weryfikuj'}
              </button>
              <button type="button" onClick={() => setStep('haslo')}
                className="w-full text-center font-body text-sm text-sage-500 hover:text-sage-700">
                ← Wróć
              </button>
            </form>
          )}

          {/* Krok: wymuszona zmiana hasła */}
          {step === 'zmiana_hasla' && (
            <form onSubmit={submitZmianaHasla} className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 font-body text-sm text-amber-700">
                Administrator wymaga ustawienia nowego hasła przed pierwszym logowaniem.
              </div>
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Nowe hasło</label>
                <input type="password" value={form.nowe_haslo}
                  onChange={e => setForm(f => ({ ...f, nowe_haslo: e.target.value }))}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="min. 8 znaków" minLength={8} required />
              </div>
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Powtórz hasło</label>
                <input type="password" value={form.nowe_haslo2}
                  onChange={e => setForm(f => ({ ...f, nowe_haslo2: e.target.value }))}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="••••••••" required />
              </div>
              {error && <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-500 font-body text-sm">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-ink text-white font-display font-600 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50">
                {loading ? 'Zapisywanie...' : 'Ustaw nowe hasło i zaloguj'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

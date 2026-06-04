import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function ResetHasla() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [haslo, setHaslo] = useState('');
  const [haslo2, setHaslo2] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sent | done | error
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submitEmail = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.resetHaslaWyslij(email);
      setStatus('sent');
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const submitHaslo = async (e) => {
    e.preventDefault();
    if (haslo !== haslo2) { setErr('Hasła nie są identyczne'); return; }
    if (haslo.length < 8) { setErr('Hasło min. 8 znaków'); return; }
    setLoading(true); setErr('');
    try {
      await api.resetHaslaUstaw({ token, nowe_haslo: haslo });
      setStatus('done');
      setTimeout(() => navigate('/login'), 2500);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-ink rounded-2xl mb-4">
            <span className="text-2xl">📒</span>
          </div>
          <h1 className="font-display text-2xl font-700 text-ink dark:text-gray-100">Reset hasła</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-sage-100 p-8">
          {/* Krok 1: podaj email */}
          {!token && status === 'idle' && (
            <form onSubmit={submitEmail} className="space-y-5">
              <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
                Podaj adres email powiązany z Twoim kontem. Wyślemy link do resetowania hasła.
              </p>
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="twoj@email.pl" required />
              </div>
              {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-ink text-white font-display font-600 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50">
                {loading ? 'Wysyłanie...' : 'Wyślij link'}
              </button>
              <div className="text-center">
                <Link to="/login" className="font-body text-sm text-sage-500 hover:text-sage-700">← Wróć do logowania</Link>
              </div>
            </form>
          )}

          {/* Email wysłany */}
          {status === 'sent' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">📬</div>
              <div className="font-display font-700 text-ink dark:text-gray-100">Sprawdź skrzynkę</div>
              <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">
                Jeśli podany email istnieje w systemie, otrzymasz wiadomość z linkiem do resetowania hasła.
              </p>
              <Link to="/login" className="inline-block font-body text-sm text-sage-500 underline">
                Wróć do logowania
              </Link>
            </div>
          )}

          {/* Krok 2: nowe hasło (z linku w emailu) */}
          {token && status === 'idle' && (
            <form onSubmit={submitHaslo} className="space-y-5">
              <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">Ustaw nowe hasło dla swojego konta.</p>
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Nowe hasło</label>
                <input type="password" value={haslo} onChange={e => setHaslo(e.target.value)}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="min. 8 znaków" minLength={8} required />
              </div>
              <div>
                <label className="block font-body text-sm font-500 text-ink mb-1.5">Powtórz hasło</label>
                <input type="password" value={haslo2} onChange={e => setHaslo2(e.target.value)}
                  className="w-full border border-sage-200 rounded-xl px-4 py-3 font-body text-ink focus:outline-none focus:border-sage-600"
                  placeholder="••••••••" required />
              </div>
              {err && <div className="text-rose-500 font-body text-sm">{err}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-ink text-white font-display font-600 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50">
                {loading ? 'Zapisywanie...' : 'Ustaw nowe hasło'}
              </button>
            </form>
          )}

          {/* Sukces */}
          {status === 'done' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <div className="font-display font-700 text-ink dark:text-gray-100">Hasło zmienione</div>
              <p className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">Za chwilę zostaniesz przekierowany do logowania...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

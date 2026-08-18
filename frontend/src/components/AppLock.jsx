import { useState, useEffect, useCallback } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { getWebAuthnAuthOptions, verifyWebAuthnAuth, getWebAuthnStatus, verifyPin } from '../api.js';

// Czas nieaktywności przed blokadą (minuty)
const LOCK_TIMEOUT_MIN = 5;
const LOCK_KEY = 'app_lock_method'; // 'pin' | 'webauthn' | null

export function useAppLock() {
  const [locked, setLocked] = useState(false);
  const [lockMethod, setLockMethod] = useState(null);

  const isMobile = /android|iphone|ipad|ipod|mobile|phone/i.test(navigator.userAgent);

  const lock = useCallback(() => { if (isMobile) setLocked(true); }, [isMobile]);
  const unlock = useCallback(() => {
    localStorage.setItem('lastActivity', String(Date.now()));
    setLocked(false);
  }, []);

  // Sprawdź blokadę przy starcie — zawsze blokuj jeśli skonfigurowana
  useEffect(() => {
    if (!isMobile) return;
    getWebAuthnStatus()
      .then(s => {
        const method = s.ma_pin ? 'pin' : s.liczba_kluczy > 0 ? 'webauthn' : null;
        setLockMethod(method);
        if (method) lock(); // zawsze blokuj przy starcie
      })
      .catch(() => {});
  }, [isMobile, lock]);

  // Timer nieaktywności + visibilitychange
  useEffect(() => {
    if (!lockMethod || !isMobile) return;

    let timer;

    const reset = () => {
      localStorage.setItem('lastActivity', String(Date.now()));
      clearTimeout(timer);
      timer = setTimeout(lock, LOCK_TIMEOUT_MIN * 60 * 1000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const lastActivity = parseInt(localStorage.getItem('lastActivity') || '0');
        const elapsed = Date.now() - lastActivity;
        if (elapsed >= LOCK_TIMEOUT_MIN * 60 * 1000) {
          lock();
        } else {
          clearTimeout(timer);
          timer = setTimeout(lock, LOCK_TIMEOUT_MIN * 60 * 1000 - elapsed);
        }
      } else {
        // Aplikacja schowana — zapisz timestamp
        localStorage.setItem('app_closed_at', String(Date.now()));
      }
    };

    // pagehide — odpala się przy zamknięciu PWA na iOS
    const onPageHide = () => {
      localStorage.setItem('app_closed_at', String(Date.now()));
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [lockMethod, lock, isMobile]);

  return { locked, lock, unlock, lockMethod };
}

export default function AppLock({ onUnlock, lockMethod }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePin = async () => {
    if (!pin) return;
    setLoading(true); setError('');
    try {
      await verifyPin(pin);
      setPin('');
      onUnlock();
    } catch {
      setError('Nieprawidłowy PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleWebAuthn = async () => {
    setLoading(true); setError('');
    try {
      const options = await getWebAuthnAuthOptions();
      const response = await startAuthentication({ optionsJSON: options });
      await verifyWebAuthnAuth(response);
      onUnlock();
    } catch (e) {
      setError(e.message === 'NotAllowedError' ? 'Anulowano weryfikację' : 'Weryfikacja nieudana');
    } finally {
      setLoading(false);
    }
  };

  const handlePinKey = (digit) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length >= 4) {
        // Autosubmit po 4-6 cyfrach (zależy od długości PIN)
        setTimeout(async () => {
          setLoading(true); setError('');
          try {
            await verifyPin(newPin);
            setPin('');
            onUnlock();
          } catch {
            setError('Nieprawidłowy PIN');
            setPin('');
          } finally {
            setLoading(false);
          }
        }, 100);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/95 dark:bg-gray-950/98 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl font-700 text-ink dark:text-gray-100 mb-2">Aplikacja zablokowana</h2>
        <p className="font-body text-sm text-sage-500 mb-6">Odblokuj by kontynuować</p>

        {error && (
          <div className="bg-rose-50 text-rose-600 font-body text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>
        )}

        {lockMethod === 'pin' && (
          <>
            {/* Wyświetlacz PIN */}
            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3, 4, 5].slice(0, 4).map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${i < pin.length ? 'bg-ink border-ink dark:bg-white dark:border-white' : 'border-sage-300'}`} />
              ))}
            </div>
            {/* Klawiatura numeryczna */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
                <button key={i} onClick={() => {
                  if (d === '⌫') setPin(p => p.slice(0, -1));
                  else if (d !== '') handlePinKey(String(d));
                }}
                  disabled={loading || d === ''}
                  className={`h-14 rounded-2xl font-display text-xl font-600 transition-colors
                    ${d === '' ? 'invisible' : 'bg-sage-50 dark:bg-gray-700 text-ink dark:text-gray-100 hover:bg-sage-100 dark:hover:bg-gray-600 active:scale-95'}`}>
                  {d}
                </button>
              ))}
            </div>
          </>
        )}

        {lockMethod === 'webauthn' && (
          <button onClick={handleWebAuthn} disabled={loading}
            className="w-full bg-ink text-white font-display font-600 py-3.5 rounded-2xl hover:bg-sage-700 disabled:opacity-50 text-lg mb-3">
            {loading ? '⏳ Weryfikacja...' : '👆 Użyj biometrii / PIN urządzenia'}
          </button>
        )}

        {lockMethod === 'pin' && pin.length >= 4 && (
          <button onClick={handlePin} disabled={loading}
            className="w-full bg-ink text-white font-display font-600 py-3 rounded-2xl hover:bg-sage-700 disabled:opacity-50 mt-2">
            {loading ? '⏳...' : 'Odblokuj'}
          </button>
        )}
      </div>
    </div>
  );
}

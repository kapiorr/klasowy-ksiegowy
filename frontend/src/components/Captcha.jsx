import { useState, useEffect, useCallback } from 'react';

export default function Captcha({ onChange }) {
  const [imgSrc, setImgSrc] = useState('');
  const [token, setToken] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setAnswer('');
    onChange(null);
    try {
      const res = await fetch('/api/captcha/image', { cache: 'no-store' });
      const blob = await res.blob();
      const captchaToken = res.headers.get('X-Captcha-Token');
      setToken(captchaToken || '');
      setImgSrc(URL.createObjectURL(blob));
    } catch {
      setImgSrc('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleChange = (e) => {
    const v = e.target.value;
    setAnswer(v);
    if (v.trim() && token) {
      onChange({ captcha_token: token, captcha_answer: v.trim() });
    } else {
      onChange(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0">
        {loading ? (
          <div className="w-44 h-14 bg-sage-50 dark:bg-gray-700 rounded-xl flex items-center justify-center text-sage-400 text-sm">
            Ładowanie...
          </div>
        ) : imgSrc ? (
          <img src={imgSrc} alt="CAPTCHA" className="rounded-xl border border-sage-200 dark:border-gray-600"
            style={{ width: 180, height: 56 }} />
        ) : (
          <div className="w-44 h-14 bg-rose-50 rounded-xl flex items-center justify-center text-rose-400 text-xs">
            Błąd ładowania
          </div>
        )}
      </div>
      <input
        type="number"
        value={answer}
        onChange={handleChange}
        placeholder="?"
        className="w-20 border border-sage-200 dark:border-gray-600 rounded-xl px-3 py-2.5 font-mono text-center text-ink dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:border-sage-600"
        required
      />
      <button type="button" onClick={refresh} title="Nowe zadanie"
        className="text-sage-400 hover:text-sage-600 text-xl">↻</button>
    </div>
  );
}

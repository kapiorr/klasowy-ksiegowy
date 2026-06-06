import { useState, useEffect, useRef } from 'react';
import { downloadBackup, uploadBackup, uploadSkladkaBackup, getAutoBackups, downloadAutoBackup, runAutoBackup, getBackupConfig } from '../api.js';

function SkladkaRestore() {
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState('');
  const [plik, setPlik] = useState(null);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPlik(f);
    setState('confirm');
  };

  const handleRestore = async () => {
    if (!plik) return;
    setState('loading');
    try {
      const data = await uploadSkladkaBackup(plik);
      setState('done');
      setMsg(data.message || 'Składka przywrócona');
    } catch (e) {
      setState('error');
      setMsg(e.message);
    }
  };

  const reset = () => { setPlik(null); setState('idle'); setMsg(''); if (fileRef.current) fileRef.current.value = ''; };

  return (
    <div className="space-y-3">
      {state === 'idle' && (
        <label className="cursor-pointer inline-block">
          <span className="border-2 border-dashed border-blue-200 text-blue-500 hover:border-blue-400 font-body text-sm px-5 py-2.5 rounded-xl transition-colors inline-block">
            ⬆ Wybierz plik backup składki (.json)
          </span>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
        </label>
      )}
      {state === 'confirm' && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <div className="font-body text-sm font-500 text-blue-700">Plik: {plik?.name}</div>
            <div className="font-body text-xs text-blue-600 mt-1">Składka zostanie dodana do systemu.</div>
          </div>
          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 border border-sage-200 rounded-xl py-2.5 font-body text-ink hover:bg-sage-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">Anuluj</button>
            <button onClick={handleRestore} className="flex-1 bg-blue-500 text-white rounded-xl py-2.5 font-display font-600 hover:bg-blue-600">Wgraj składkę</button>
          </div>
        </div>
      )}
      {state === 'loading' && <div className="font-body text-sm text-sage-600 dark:text-sage-400 dark:text-gray-500">⏳ Wgrywanie...</div>}
      {state === 'done' && <div className="bg-sage-100 border border-sage-200 rounded-xl px-4 py-3 font-body text-sm text-sage-700">✓ {msg}</div>}
      {state === 'error' && (
        <div className="space-y-2">
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 font-body text-sm text-rose-600">✗ {msg}</div>
          <button onClick={reset} className="text-sm font-body text-sage-600 underline">Spróbuj ponownie</button>
        </div>
      )}
    </div>
  );
}

function AutoBackupy() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [backupHour, setBackupHour] = useState(5);

  const load = () => getAutoBackups().then(setLista).catch(() => setLista([])).finally(() => setLoading(false));
  useEffect(() => {
    load();
    getBackupConfig().then(c => setBackupHour(c.backup_hour)).catch(e => console.error('backup config error:', e));
  }, []);

  const handleRun = async () => {
    setRunning(true); setMsg('');
    try {
      await runAutoBackup();
      setMsg('Backup wykonany pomyślnie');
      load();
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
      <div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4 mb-1">
            <h2 className="font-display font-700 text-ink dark:text-gray-100">🕔 Automatyczne backupy</h2>
            <button onClick={handleRun} disabled={running}
              className="text-xs font-body border border-sage-200 text-sage-600 px-3 py-1.5 rounded-lg hover:bg-sage-50 disabled:opacity-50">
              {running ? '⏳ Trwa...' : '▶ Wykonaj teraz'}
            </button>
          </div>
          <p className="font-body text-sm text-sage-600 dark:text-sage-400 mb-4">
            Codziennie o {backupHour}:00 — przechowywane 7 ostatnich kopii.
          </p>
          {msg && <div className="font-body text-sm text-sage-700 dark:text-sage-400 bg-sage-50 dark:bg-gray-700 rounded-xl px-4 py-2 mb-3">{msg}</div>}
          {loading ? (
            <div className="font-body text-sm text-sage-400">Ładowanie...</div>
          ) : lista.length === 0 ? (
            <div className="font-body text-sm text-sage-400">Brak zapisanych backupów — pierwszy zostanie wykonany dziś o 5:00.</div>
          ) : (
            <div className="divide-y divide-sage-50 dark:divide-gray-700 border border-sage-100 dark:border-gray-700 rounded-xl overflow-hidden">
              {lista.map(b => (
                <div key={b.nazwa} className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-sage-50/50 dark:hover:bg-gray-700/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-body text-sm font-500 text-ink dark:text-gray-100">{new Date(b.created_at).toLocaleString('pl-PL')}</div>
                    <div className="font-body text-xs text-sage-400">{(b.rozmiar / 1024).toFixed(1)} KB</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => downloadAutoBackup(b.nazwa)}
                      className="text-xs font-body border border-sage-200 text-sage-600 px-3 py-1 rounded-lg hover:bg-sage-50">
                      ⬇ Pobierz
                    </button>
                    <button onClick={async () => {
                        if (!confirm(`Przywrócić backup "${b.nazwa}"? Istniejące dane zostaną nadpisane.`)) return;
                        try {
                          const token = localStorage.getItem('token');
                          const fileRes = await fetch(`/api/backup/auto/${b.nazwa}`, { headers: { Authorization: `Bearer ${token}` } });
                          const data = await fileRes.json();
                          const restoreRes = await fetch('/api/backup/restore', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(data),
                          });
                          if (!restoreRes.ok) throw new Error((await restoreRes.json()).error);
                          setMsg(`Przywrócono backup: ${b.nazwa}`);
                        } catch (e) { setMsg('Błąd: ' + e.message); }
                      }}
                      className="text-xs font-body border border-amber-200 text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-50">
                      ↩ Przywróć
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Backup() {
  const [restoreState, setRestoreState] = useState('idle'); // idle | confirm | loading | done | error
  const [restoreMsg, setRestoreMsg] = useState('');
  const [plik, setPlik] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef();

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadBackup(); }
    catch (e) { alert('Błąd eksportu: ' + e.message); }
    finally { setDownloading(false); }
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPlik(f);
    setRestoreState('confirm');
    setRestoreMsg('');
  };

  const handleRestore = async () => {
    if (!plik) return;
    setRestoreState('loading');
    try {
      await uploadBackup(plik);
      setRestoreState('done');
      setRestoreMsg('Backup wgrany pomyślnie. Strona zostanie odświeżona.');
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      setRestoreState('error');
      setRestoreMsg(e.message);
    }
  };

  const resetRestore = () => {
    setPlik(null);
    setRestoreState('idle');
    setRestoreMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Backup</h1>
        <p className="font-body text-sage-600 mt-1">Eksport i import danych aplikacji</p>
      </div>

      {/* Import składki */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-6">
        <h2 className="font-display font-700 text-ink dark:text-gray-100 mb-1">📦 Import składki</h2>
        <p className="font-body text-sm text-sage-600 dark:text-sage-400 mb-4">
          Wgrywa backup pojedynczej składki (plik z przycisku "Backup" na liście składek).
          Składka zostanie dodana — istniejące dane nie są usuwane.
        </p>
        <SkladkaRestore />
      </div>
      {/* Automatyczne backupy */}
      <AutoBackupy />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getMailingConfig, getMailingZaleglosci, sendMailingZaleglosci } from '../api.js';
import { useDialog } from '../components/Dialog.jsx';

export default function Mailing() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  // selected: Map<id, { email: bool, sms: bool }>
  const [selected, setSelected] = useState(new Map());
  const [emailAll, setEmailAll] = useState(true); // globalny checkbox email
  const { confirm } = useDialog();

  useEffect(() => {
    Promise.all([getMailingZaleglosci(), getMailingConfig()])
      .then(([d, cfg]) => {
        setLista(d);
        setSmsEnabled(cfg.sms_enabled);
        // Domyślnie: email=true, sms=true jeśli user ma telefon i ma włączone
        const m = new Map();
        d.forEach(u => m.set(u.id, {
          email: true,
          sms: cfg.sms_enabled && !!u.telefon && !!u.sms_powiadomienia,
        }));
        setSelected(m);
      })
      .catch(() => setLista([]))
      .finally(() => setLoading(false));
  }, []);

  const toggleEmail = (id) => setSelected(prev => {
    const m = new Map(prev);
    m.set(id, { ...m.get(id), email: !m.get(id).email });
    return m;
  });

  const toggleSms = (id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const m = new Map(prev);
      m.set(id, { ...m.get(id), sms: !m.get(id).sms });
      return m;
    });
  };

  const toggleEmailAll = () => {
    const val = !emailAll;
    setEmailAll(val);
    setSelected(prev => {
      const m = new Map(prev);
      m.forEach((v, k) => m.set(k, { ...v, email: val }));
      return m;
    });
  };

  const activeCount = [...selected.values()].filter(v => v.email || v.sms).length;

  const handleSend = async () => {
    const recipients = [];
    selected.forEach((v, id) => {
      if (v.email || v.sms) recipients.push({ id, kanaly: [v.email && 'email', v.sms && 'sms'].filter(Boolean) });
    });
    if (!recipients.length) return;

    // Ostrzeżenie o wymuszonej wysyłce SMS
    const wymuszone = lista.filter(u => {
      const s = selected.get(u.id);
      return s?.sms && u.telefon && !u.sms_powiadomienia;
    });

    const kanalTxt = [...new Set(recipients.flatMap(r => r.kanaly))].map(k => k === 'email' ? 'mail' : 'SMS').join(' i ');
    let pytanie = `Wysłać przypomnienie (${kanalTxt}) do ${recipients.length} użytkowników?`;
    if (wymuszone.length) pytanie += `\n\n⚠ ${wymuszone.map(u => `${u.uczen_nazwisko} ${u.uczen_imie}`).join(', ')} ${wymuszone.length === 1 ? 'wyłączył/a' : 'wyłączyli'} SMS — zostanie wysłany mimo to.`;

    if (!await confirm(pytanie)) return;

    setSending(true); setMsg('');
    try {
      // Grupuj po kanałach — wyślij osobno email i sms
      const emailIds = recipients.filter(r => r.kanaly.includes('email')).map(r => r.id);
      const smsIds = recipients.filter(r => r.kanaly.includes('sms')).map(r => r.id);

      let wyslano = 0, wyslano_sms = 0, bledy = [];

      if (emailIds.length || smsIds.length) {
        // Zbierz wszystkie unikalne id
        const allIds = [...new Set([...emailIds, ...smsIds])];
        const kanaly = [];
        if (emailIds.length) kanaly.push('email');
        if (smsIds.length) kanaly.push('sms');
        const r = await sendMailingZaleglosci(allIds, kanaly, emailIds, smsIds);
        wyslano = r.wyslano || 0;
        wyslano_sms = r.wyslano_sms || 0;
        bledy = r.bledy || [];
      }

      const parts = [wyslano && `${wyslano} maili`, wyslano_sms && `${wyslano_sms} SMS`].filter(Boolean);
      setMsg(`✓ Wysłano: ${parts.join(', ') || '0'}${bledy.length ? `. Błędy: ${bledy.join(', ')}` : ''}`);
    } catch (e) {
      setMsg('Błąd: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-700 text-ink dark:text-gray-100">Mailing — zaległości</h1>
        <p className="font-body text-sage-600 dark:text-sage-400 mt-1">
          Wyślij przypomnienie o zaległościach. Zaznacz kanały per użytkownik.
        </p>
      </div>

      {loading ? (
        <div className="font-body text-sage-600 py-12 text-center">Ładowanie...</div>
      ) : lista.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <div className="font-body text-sage-600 dark:text-sage-400">Brak zaległości — wszyscy zapłacili!</div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-sage-100 dark:border-gray-700 overflow-hidden mb-4">
            {/* Nagłówek */}
            <div className="flex items-center px-4 py-3 border-b border-sage-50 dark:border-gray-700 bg-sage-50 dark:bg-gray-700/50 gap-4">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={emailAll} onChange={toggleEmailAll} className="rounded border-sage-300" />
                <span className="font-body text-sm font-500 text-ink dark:text-gray-100">✉ Email (wszyscy)</span>
              </label>
              {smsEnabled && (
                <span className="font-body text-xs text-sage-400">📱 SMS — per użytkownik</span>
              )}
              <span className="font-body text-xs text-sage-400 ml-auto">{activeCount} aktywnych</span>
            </div>

            {/* Lista */}
            <div className="divide-y divide-sage-50 dark:divide-gray-700">
              {lista.map(u => {
                const sel = selected.get(u.id) || { email: false, sms: false };
                const maaTel = !!u.telefon;
                const smsWylaczone = maaTel && !u.sms_powiadomienia;
                return (
                  <div key={u.id} className="flex items-center px-4 py-3 gap-3 hover:bg-sage-50/50 dark:hover:bg-gray-700/30">
                    {/* Email checkbox */}
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={sel.email} onChange={() => toggleEmail(u.id)} className="rounded border-sage-300" />
                      <span className="font-body text-xs text-sage-500">✉</span>
                    </label>
                    {/* SMS checkbox */}
                    {smsEnabled && (
                      <label className="flex items-center gap-1 cursor-pointer" title={!maaTel ? 'Brak telefonu' : smsWylaczone ? 'SMS wyłączone przez użytkownika — możesz wymusić' : 'SMS'}>
                        <input type="checkbox" checked={sel.sms} onChange={e => toggleSms(u.id, e)}
                          disabled={!maaTel}
                          className={`rounded border-sage-300 ${!maaTel ? 'opacity-30' : ''}`} />
                        <span className={`font-body text-xs ${!maaTel ? 'text-sage-300' : smsWylaczone && sel.sms ? 'text-amber-500' : 'text-sage-500'}`}>
                          📱{smsWylaczone && sel.sms ? '⚠' : ''}
                        </span>
                      </label>
                    )}
                    {/* Dane */}
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-sm text-ink dark:text-gray-100">
                        {u.uczen_nazwisko} {u.uczen_imie}
                        <span className="text-sage-400 ml-2 text-xs">({u.login})</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 flex-wrap">
                        {u.email && <span className="font-body text-xs text-sage-400">{u.email}</span>}
                        {maaTel && <span className={`font-body text-xs ${smsWylaczone ? 'text-sage-300' : 'text-sage-400'}`}>+48 {u.telefon}{smsWylaczone ? ' (wyłączone)' : ''}</span>}
                      </div>
                    </div>
                    {/* Kwota */}
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-sm font-600 text-amber-600">{parseFloat(u.suma_zaleglosci).toFixed(2)} zł</div>
                      <div className="font-body text-xs text-sage-400">{u.liczba_zaleglosci} skład{u.liczba_zaleglosci == 1 ? 'ka' : 'ki'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {msg && (
            <div className={`font-body text-sm px-4 py-3 rounded-xl mb-4 ${msg.startsWith('✓') ? 'bg-sage-50 text-sage-700 border border-sage-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
              {msg}
            </div>
          )}

          <button onClick={handleSend} disabled={sending || activeCount === 0}
            className="w-full bg-ink dark:bg-sage-700 text-white font-display font-600 px-5 py-3 rounded-xl hover:bg-sage-700 disabled:opacity-50 transition-colors">
            {sending ? '⏳ Wysyłanie...' : `Wyślij do ${activeCount} użytkowników`}
          </button>
        </>
      )}
    </div>
  );
}

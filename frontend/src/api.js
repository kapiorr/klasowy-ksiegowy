const BASE = '';

function handleUnauthorized() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export async function request(path, options = {}) {
  const token = localStorage.getItem('token');

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        handleUnauthorized();
        return;
      }
    } catch {}
  }

  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) { handleUnauthorized(); return; }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.blocked) {
      window.location.href = '/zablokowany';
      return;
    }
    if (body.awaiting_reset) {
      return body; // przekaż do wywołującego
    }
    throw new Error(body.error || 'Brak uprawnień');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Błąd serwera' }));
    throw new Error(err.error || 'Błąd serwera');
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  rejestracja: (data) => request('/auth/rejestracja', { method: 'POST', body: JSON.stringify(data) }),
  zmienHaslo: (data) => request('/auth/zmien-haslo', { method: 'POST', body: JSON.stringify(data) }),
  resetHaslaWyslij: (email) => request('/auth/reset-hasla/wyslij', { method: 'POST', body: JSON.stringify({ email }) }),
  resetHaslaUstaw: (data) => request('/auth/reset-hasla/ustaw', { method: 'POST', body: JSON.stringify(data) }),

  // MFA
  mfaSetup: () => request('/auth/mfa/setup', { method: 'POST' }),
  mfaAktywuj: (kod) => request('/auth/mfa/aktywuj', { method: 'POST', body: JSON.stringify({ kod }) }),
  mfaWylacz: (haslo) => request('/auth/mfa/wylacz', { method: 'POST', body: JSON.stringify({ haslo }) }),
  mfaStatus: () => request('/auth/mfa/status'),

  // Użytkownicy
  getUzytkownicy: () => request('/uzytkownicy'),
  addUzytkownik: (data) => request('/uzytkownicy', { method: 'POST', body: JSON.stringify(data) }),
  updateUzytkownik: (id, data) => request(`/uzytkownicy/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setMfaWymuszone: (id, wymuszone) => request(`/uzytkownicy/${id}/mfa-wymuszone`, { method: 'PATCH', body: JSON.stringify({ wymuszone }) }),
  resetMfa: (id) => request(`/uzytkownicy/${id}/reset-mfa`, { method: 'PATCH' }),
  wyslijZaproszenie: (id, minuty = 15) => request(`/uzytkownicy/${id}/wyslij-zaproszenie`, { method: 'POST', body: JSON.stringify({ link_expiry_minutes: minuty }) }),
  wymusPrzycZmianyHasla: (id) => request(`/uzytkownicy/${id}/wymus-zmiane-hasla`, { method: 'PATCH' }),
  cofnijWymuszenieHasla: (id) => request(`/uzytkownicy/${id}/cofnij-wymuszenie-hasla`, { method: 'PATCH' }),
  importUzytkownicyCsv: (csv) => request('/uzytkownicy/import-csv', { method: 'POST', body: JSON.stringify({ csv }) }),
  deleteUzytkownik: (id) => request(`/uzytkownicy/${id}`, { method: 'DELETE' }),
  wymuszonaZmianaHasla: (nowe_haslo) => request('/auth/wymuszona-zmiana-hasla', { method: 'POST', body: JSON.stringify({ nowe_haslo }) }),

  // Uczniowie
  getUcznowie: (wszyscy = false) => request(`/ucznowie${wszyscy ? '?wszyscy=1' : ''}`),
  toggleAktywnyUczen: (id, aktywny) => request(`/ucznowie/${id}/aktywny`, { method: 'PATCH', body: JSON.stringify({ aktywny }) }),
  addUczen: (data) => request('/ucznowie', { method: 'POST', body: JSON.stringify(data) }),
  importUczniowieCsv: (csv) => request('/ucznowie/import-csv', { method: 'POST', body: JSON.stringify({ csv }) }),
  updateUczen: (id, data) => request(`/ucznowie/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUczen: (id) => request(`/ucznowie/${id}`, { method: 'DELETE' }),

  // Składki
  getSkladki: () => request('/skladki'),
  getSkladka: (id) => request(`/skladki/${id}`),
  addSkladka: (data) => request('/skladki', { method: 'POST', body: JSON.stringify(data) }),
  updateSkladka: (id, data) => request(`/skladki/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSkladka: (id) => request(`/skladki/${id}`, { method: 'DELETE' }),

  setSkladkaStatus: (id, status) => request(`/skladki/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setSkladkiKolejnosc: (kolejnosc) => request('/skladki/kolejnosc', { method: 'PATCH', body: JSON.stringify({ kolejnosc }) }),
  removeUczenFromSkladka: (skladkaId, uczenId) => request(`/skladki/${skladkaId}/uczniowie/${uczenId}`, { method: 'DELETE' }),
  addUczenToSkladka: (skladkaId, uczenId) => request(`/skladki/${skladkaId}/uczniowie/${uczenId}`, { method: 'POST' }),

  // Wpłaty
  getWplaty: (skladka_id) => request(`/wplaty?skladka_id=${skladka_id}`),
  addWplata: (data) => request('/wplaty', { method: 'POST', body: JSON.stringify(data) }),
  updateWplata: (id, data) => request(`/wplaty/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWplata: (id) => request(`/wplaty/${id}`, { method: 'DELETE' }),
  getWplatyHistoria: (skladka_id, uczen_id) => request(`/wplaty/historia?skladka_id=${skladka_id}&uczen_id=${uczen_id}`),
  getWplatyUczen: (uczen_id) => request(`/wplaty/uczen/${uczen_id}`),
  getMojeWplaty: () => request('/wplaty/moje'),

  // Wypłaty
  getWyplaty: (skladka_id) => request(`/wyplaty?skladka_id=${skladka_id}`),
  addWyplata: (data) => request('/wyplaty', { method: 'POST', body: JSON.stringify(data) }),
  updateWyplata: (id, data) => request(`/wyplaty/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWyplata: (id) => request(`/wyplaty/${id}`, { method: 'DELETE' }),
  deleteWyplataZalacznik: (wyplataId, zalacznikId) => request(`/wyplaty/${wyplataId}/zalacznik/${zalacznikId}`, { method: 'DELETE' }),
  getLogi: (params) => request(`/logi?${params}`),
  getBlokady: () => request('/logi/blokady'),
  deleteBlokada: (id) => request(`/logi/blokady/${id}`, { method: 'DELETE' }),


};

export const mailingSkladka = (id, kanaly, email_ids, sms_ids) => request(`/mailing/skladka/${id}`, { method: 'POST', body: JSON.stringify({ kanaly, email_ids, sms_ids }) });
export const mailingPodglad = (id) => request(`/mailing/skladka/${id}/podglad`);
export const getMailingConfig = () => request('/mailing/config');
export const getMe = () => request('/uzytkownicy/me');
export const updateMeSms = (sms_powiadomienia) => request('/uzytkownicy/me/sms', { method: 'PATCH', body: JSON.stringify({ sms_powiadomienia }) });
export const getMailingZaleglosci = () => request('/mailing/zaleglosci/podglad');
export const sendMailingZaleglosci = (ids, kanaly, email_ids, sms_ids) => request('/mailing/zaleglosci', { method: 'POST', body: JSON.stringify({ uzytkownik_ids: ids, kanaly, email_ids, sms_ids }) });

export const downloadRaportSkladkiPdf = async (id, nazwa) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/raport/skladka/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error('Blad generowania raportu');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raport-${(nazwa || id).replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadRaportPdf = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/raport/pdf', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error('Błąd generowania raportu');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raport-${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadUczniowieCsv = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/ucznowie/export-csv', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error('Błąd eksportu');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `ucznowie-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
};

export const downloadUzytkownicyCsv = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/uzytkownicy/export-csv', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error('Błąd eksportu');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `uzytkownicy-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
};

export const downloadSkladkaBackup = async (id, nazwa) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/backup/skladka/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Błąd eksportu');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skladka-${nazwa.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const uploadSkladkaBackup = async (file) => {
  const token = localStorage.getItem('token');
  const text = await file.text();
  const res = await fetch('/api/backup/skladka/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: text,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Błąd importu' }));
    throw new Error(err.error);
  }
  return res.json();
};

export const getBackupConfig = () => request('/backup/config');
export const getAppConfig = () => request('/config');
export const getHibpStatus = () => request('/auth/hibp-status');
export const dismissHibp = () => request('/auth/hibp-dismiss', { method: 'POST' });
export const getPushVapidKey = () => request('/push/vapid-public-key');
export const getPushStatus = () => request('/push/status');
export const pushSubscribe = (subscription) => request('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
export const pushUnsubscribe = (endpoint) => request('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
export const pushTest = () => request('/push/test', { method: 'POST' });

export const getAutoBackups = () => {
  const token = localStorage.getItem('token');
  return fetch('/api/backup/auto', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
};

export const downloadAutoBackup = async (nazwa) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/backup/auto/${nazwa}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Błąd pobierania');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nazwa; a.click();
  URL.revokeObjectURL(url);
};

export const runAutoBackup = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/backup/auto/run', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Błąd backupu');
  return res.json();
};

export const downloadBackup = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/backup', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error('Błąd eksportu');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const uploadBackup = async (file) => {
  const token = localStorage.getItem('token');
  const text = await file.text();
  const res = await fetch('/api/backup/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: text,
  });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Błąd importu' }));
    throw new Error(err.error);
  }
  return res.json();
};

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
  wyslijZaproszenie: (id) => request(`/uzytkownicy/${id}/wyslij-zaproszenie`, { method: 'POST' }),
  wymusPrzycZmianyHasla: (id) => request(`/uzytkownicy/${id}/wymus-zmiane-hasla`, { method: 'PATCH' }),
  cofnijWymuszenieHasla: (id) => request(`/uzytkownicy/${id}/cofnij-wymuszenie-hasla`, { method: 'PATCH' }),
  importUzytkownicyCsv: (csv) => request('/uzytkownicy/import-csv', { method: 'POST', body: JSON.stringify({ csv }) }),
  deleteUzytkownik: (id) => request(`/uzytkownicy/${id}`, { method: 'DELETE' }),
  wymuszonaZmianaHasla: (user_id, nowe_haslo) => request('/auth/wymuszona-zmiana-hasla', { method: 'POST', body: JSON.stringify({ user_id, nowe_haslo }) }),

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
  removeUczenFromSkladka: (skladkaId, uczenId) => request(`/skladki/${skladkaId}/uczniowie/${uczenId}`, { method: 'DELETE' }),
  addUczenToSkladka: (skladkaId, uczenId) => request(`/skladki/${skladkaId}/uczniowie/${uczenId}`, { method: 'POST' }),

  // Wpłaty
  getWplaty: (skladka_id) => request(`/wplaty?skladka_id=${skladka_id}`),
  addWplata: (data) => request('/wplaty', { method: 'POST', body: JSON.stringify(data) }),
  updateWplata: (id, data) => request(`/wplaty/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWplata: (id) => request(`/wplaty/${id}`, { method: 'DELETE' }),
  getWplatyHistoria: (skladka_id, uczen_id) => request(`/wplaty/historia?skladka_id=${skladka_id}&uczen_id=${uczen_id}`),

  // Wypłaty
  getWyplaty: (skladka_id) => request(`/wyplaty?skladka_id=${skladka_id}`),
  addWyplata: (data) => request('/wyplaty', { method: 'POST', body: JSON.stringify(data) }),
  updateWyplata: (id, data) => request(`/wyplaty/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWyplata: (id) => request(`/wyplaty/${id}`, { method: 'DELETE' }),
  getLogi: (params) => request(`/logi?${params}`),
  getBlokady: () => request('/logi/blokady'),
  deleteBlokada: (id) => request(`/logi/blokady/${id}`, { method: 'DELETE' }),

  openZalacznik: async (id) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/wyplaty/${id}/zalacznik`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { handleUnauthorized(); return; }
    if (!res.ok) throw new Error('Błąd pobierania załącznika');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};

export const downloadUczniowieCsv = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/ucznowie/export-csv', { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `ucznowie-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
};

export const downloadUzytkownicyCsv = async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/uzytkownicy/export-csv', { headers: { Authorization: `Bearer ${token}` } });
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

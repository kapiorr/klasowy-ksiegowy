-- Schemat bazy danych: Klasowy Księgowy

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Uczniowie
CREATE TABLE ucznowie (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imie VARCHAR(100) NOT NULL,
  nazwisko VARCHAR(100) NOT NULL,
  aktywny BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Użytkownicy
CREATE TABLE uzytkownicy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  login VARCHAR(100) UNIQUE NOT NULL,
  imie VARCHAR(100),
  nazwisko VARCHAR(100),
  haslo_hash TEXT NOT NULL,
  rola VARCHAR(20) NOT NULL CHECK (rola IN ('admin', 'ksiegowy', 'podglad', 'podglad_pelny')),
  uczen_id UUID REFERENCES ucznowie(id) ON DELETE SET NULL,
  email VARCHAR(200) UNIQUE,
  telefon VARCHAR(30),
  -- MFA
  mfa_secret TEXT,               -- zaszyfrowany AES-256-GCM
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_backup_codes TEXT[],       -- tablica zahashowanych Argon2 kodów zapasowych
  mfa_wymuszone BOOLEAN NOT NULL DEFAULT FALSE,
  force_password_change BOOLEAN NOT NULL DEFAULT FALSE,  -- ustawiane przez księgowego
  sessions_invalidated_at TIMESTAMPTZ,                    -- tokeny JWT wystawione przed tą datą są nieważne
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tokeny resetu hasła
CREATE TABLE tokeny_reset (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uzytkownik_id UUID NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  wygasa_o TIMESTAMPTZ NOT NULL,
  wykorzystany BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Składki
CREATE TABLE skladki (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nazwa VARCHAR(200) NOT NULL,
  kwota_na_osobe NUMERIC(10,2) NOT NULL,
  termin DATE,
  opis TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'aktywna' CHECK (status IN ('aktywna', 'zakonczona', 'wstrzymana')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Przypisanie uczniów do składki
CREATE TABLE skladka_ucznowie (
  skladka_id UUID NOT NULL REFERENCES skladki(id) ON DELETE CASCADE,
  uczen_id   UUID NOT NULL REFERENCES ucznowie(id) ON DELETE CASCADE,
  PRIMARY KEY (skladka_id, uczen_id)
);

-- Wpłaty (uczen_id nullable = wpłata ogólna)
CREATE TABLE wplaty (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skladka_id UUID NOT NULL REFERENCES skladki(id) ON DELETE CASCADE,
  uczen_id UUID REFERENCES ucznowie(id) ON DELETE CASCADE,
  kwota NUMERIC(10,2) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  notatka TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wypłaty ze składki
CREATE TABLE wyplaty (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skladka_id UUID NOT NULL REFERENCES skladki(id) ON DELETE CASCADE,
  kwota NUMERIC(10,2) NOT NULL,
  opis TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Widok: suma wpłat per uczeń per składka
CREATE VIEW wplaty_summary AS
SELECT
  su.skladka_id,
  u.id AS uczen_id,
  u.imie,
  u.nazwisko,
  u.aktywny,
  s.kwota_na_osobe,
  COALESCE(SUM(w.kwota), 0) AS wplacono,
  s.kwota_na_osobe - COALESCE(SUM(w.kwota), 0) AS pozostalo
FROM skladka_ucznowie su
JOIN ucznowie u ON u.id = su.uczen_id
JOIN skladki s ON s.id = su.skladka_id
LEFT JOIN wplaty w ON w.skladka_id = su.skladka_id AND w.uczen_id = u.id
GROUP BY su.skladka_id, u.id, u.imie, u.nazwisko, u.aktywny, s.kwota_na_osobe;

-- Logi aktywności
CREATE TABLE logi (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  uzytkownik_id UUID REFERENCES uzytkownicy(id) ON DELETE SET NULL,
  login_proba VARCHAR(100),        -- login użyty przy próbie (również przy nieudanych)
  ip VARCHAR(64),
  akcja VARCHAR(100) NOT NULL,     -- np. login_ok, login_fail, logout, view_skladki, edit_wplata
  zasob VARCHAR(200),              -- np. /skladki/uuid
  szczegoly TEXT,
  sukces BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX logi_created_at_idx ON logi (created_at DESC);
CREATE INDEX logi_uzytkownik_idx ON logi (uzytkownik_id);
CREATE INDEX logi_ip_idx ON logi (ip);

-- Blokady (login lub IP)
CREATE TABLE blokady (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  typ VARCHAR(20) NOT NULL CHECK (typ IN ('login', 'ip')),
  wartosc VARCHAR(200) NOT NULL,   -- login lub adres IP
  powod TEXT,
  zablokowany_do TIMESTAMPTZ,      -- NULL = na stałe
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (typ, wartosc)
);

-- Załączniki do wypłat (wiele plików per wypłata)
CREATE TABLE IF NOT EXISTS wyplaty_zalaczniki (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wyplata_id UUID NOT NULL REFERENCES wyplaty(id) ON DELETE CASCADE,
  nazwa VARCHAR(500) NOT NULL,
  typ VARCHAR(100) NOT NULL,
  dane BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wyplaty_zalaczniki_wyplata_idx ON wyplaty_zalaczniki (wyplata_id);

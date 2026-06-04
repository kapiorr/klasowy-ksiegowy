# 📒 Klasowy Księgowy

Aplikacja webowa do zarządzania kasą klasową — wpłatami, wypłatami i składkami uczniów. Zaprojektowana z myślą o prostocie obsługi i bezpieczeństwie, dostępna również jako PWA na urządzeniach mobilnych.

---

## 📸 Funkcjonalności

### Składki
- Tworzenie i zarządzanie składkami (wycieczki, ubezpieczenia, imprezy klasowe itp.)
- Śledzenie wpłat per uczeń z historią zmian
- Wypłaty z możliwością dodania załącznika (faktura, rachunek)
- Pasek postępu i saldo (zebrano − wypłaty)
- Archiwizacja składek — zarchiwizowana składka jest tylko do odczytu
- Eksport wpłat do CSV
- Backup i restore pojedynczej składki (JSON)

### Uczniowie
- Lista uczniów klasy z możliwością dezaktywacji
- Nieaktywny uczeń nie jest dodawany do nowych składek, ale jego historia pozostaje
- Import uczniów z pliku CSV (`imie;nazwisko`)

### Użytkownicy i role

| Rola | Uprawnienia |
|---|---|
| **Admin** | Pełny dostęp — składki, wpłaty, uczniowie, użytkownicy (CRUD), backup, logi, statystyki |
| **Księgowy** | Składki/wpłaty/wypłaty (pełny), uczniowie (pełny), użytkownicy (tylko odczyt) |
| **Podgląd pełny** | Odczyt wszystkiego, brak edycji |
| **Podgląd** | Tylko własne wpłaty (wymaga powiązania z uczniem) |

- Import użytkowników z CSV (`login;haslo;rola;email;imie;nazwisko`)
- Wysyłka maila powitalnego z linkiem do ustawienia hasła (ważny 15 min) — przy zakładaniu konta lub z poziomu edycji
- Wymuszanie MFA per użytkownik
- Wymuszanie zmiany hasła przy następnym logowaniu
- Reset MFA przez admina

### Bezpieczeństwo
- Hasła hashowane **Argon2id** z pieprzem (PEPPER)
- Tokeny **JWT** — 1h na desktopie, 30 dni na urządzeniach mobilnych (dla admin/księgowy)
- **MFA TOTP** (Google Authenticator, Authy itp.) z kodami zapasowymi
- Blokada konta i IP po 5 nieudanych próbach logowania (1h), mail do admina
- Weryfikacja plików po **magic bytes** (JPEG, PNG, GIF, WebP, PDF)
- Reset hasła przez email (link ważny 1h) — po zmianie hasła aktywne sesje są unieważniane
- Mail powitalny z linkiem do ustawienia hasła (ważny 15 min) — przy wysyłce aktywne sesje użytkownika są natychmiast unieważniane
- Reset hasła przez email unieważnia wszystkie aktywne sesje JWT
- Parametryzowane zapytania SQL — ochrona przed SQL injection
- Porty bazy danych i backendu niewystawione na zewnątrz

### Logi aktywności
- Szczegółowe logi wszystkich akcji (kto, co, kiedy, z jakiego IP)
- Logowanie zmian wartości (np. `kwota: 50.00 → 75.00 zł`)
- Blokady z możliwością odblokowania przez admina
- Eksport logów do CSV
- Automatyczne czyszczenie logów starszych niż 30 dni

### Statystyki bazy danych (admin)
- Rozmiar bazy i indeksów
- Cache hit ratio
- Połączenia (active/idle)
- Rozmiar tabel z liczbą wierszy
- Top 20 zapytań SQL wg wywołań (pg_stat_statements)
- Reset statystyk zapytań

### Inne
- **Tryb ciemny** — wykrywa preferencje systemu, zapamiętuje wybór
- **PWA** — można zainstalować jako aplikację na telefonie
- **Responsive** — w pełni obsługiwany na urządzeniach mobilnych
- Backup całej bazy i restore (JSON z załącznikami base64)
- **Automatyczny backup** codziennie o 5:00 — przechowywane 7 ostatnich kopii, każdą można pobrać lub przywrócić jednym kliknięciem z poziomu aplikacji
- Ręczne uruchomienie backupu w dowolnym momencie z panelu Backup

---

## 🛠 Stack technologiczny

| Warstwa | Technologia |
|---|---|
| Frontend | React 18, Tailwind CSS, Vite |
| Backend | Node.js 22, Express |
| Baza danych | PostgreSQL 16 |
| Konteneryzacja | Docker, Docker Compose |
| Dostęp zewnętrzny | Cloudflare Tunnel |
| Czcionki | Syne, DM Sans, DM Mono |

---

## 🚀 Instalacja

### Wymagania
- Docker i Docker Compose
- Cloudflare Tunnel (opcjonalnie, do dostępu z zewnątrz)
- Konto Mailgun (opcjonalnie, do resetowania hasła)

### 1. Sklonuj repozytorium

```bash
git clone https://github.com/twoj-login/klasowy-ksiegowy.git
cd klasowy-ksiegowy
```

### 2. Skonfiguruj zmienne środowiskowe

```bash
cp .env.example .env
```

Edytuj `.env`:

```env
# Konto administratora (tworzone automatycznie przy pierwszym uruchomieniu)
ADMIN_LOGIN=admin
ADMIN_HASLO=bezpieczne_haslo

# JWT — wygeneruj losowy string, np: openssl rand -hex 32
JWT_SECRET=

# Bezpieczeństwo haseł — wygeneruj losowy string
PEPPER=

# Szyfrowanie MFA — wygeneruj: openssl rand -hex 32
MFA_ENCRYPTION_KEY=

# PostgreSQL
POSTGRES_USER=ksiegowy
POSTGRES_PASSWORD=haslo_do_bazy
POSTGRES_DB=klasowy_ksiegowy
DATABASE_URL=postgres://ksiegowy:haslo_do_bazy@db:5432/klasowy_ksiegowy

# Email (Mailgun SMTP) — opcjonalne
EMAIL_SERVER=smtp.mailgun.org
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=postmaster@twojadomena.pl
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=noreply@twojadomena.pl
ADMIN_EMAIL=admin@twojadomena.pl

# URL aplikacji
APP_URL=https://twojadomena.pl
```

Ustaw odpowiednie uprawnienia:

```bash
chmod 600 .env
```

### 3. Uruchom

```bash
docker-compose up -d
```

Aplikacja dostępna na `http://localhost:5173`.

### 4. Pierwsze logowanie

Zaloguj się danymi z `.env` (`ADMIN_LOGIN` / `ADMIN_HASLO`). Konto automatycznie otrzymuje rolę **admin**.

---

## 🔄 Aktualizacja

```bash
git pull
docker-compose up -d --build
```

Migracje bazy uruchamiają się automatycznie przy starcie backendu — **wolumen z danymi nie jest usuwany**.

Jeśli pojawiły się zmiany schematu wymagające pełnego resetu (rzadkie):

```bash
docker-compose down -v
docker-compose up -d --build
```

---

## 📁 Struktura projektu

```
klasowy-ksiegowy/
├── backup_data/
├── backend/
│   ├── src/
│   │   ├── routes/         # Endpointy API
│   │   ├── middleware/     # Autoryzacja JWT
│   │   ├── crypto.js       # Argon2, AES-256-GCM
│   │   ├── logger.js       # Logi aktywności
│   │   ├── mailer.js       # Email (Mailgun)
│   │   └── filecheck.js    # Weryfikacja magic bytes
│   ├── init.sql            # Schemat bazy danych
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/          # Strony React
│   │   ├── components/     # Layout, komponenty
│   │   ├── context/        # Auth, Theme
│   │   └── api.js          # Klient API
│   ├── public/             # PWA manifest, ikony, service worker
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🔐 Bezpieczeństwo — uwagi

- Nigdy nie zmieniaj `PEPPER` ani `MFA_ENCRYPTION_KEY` po pierwszym uruchomieniu — unieważni wszystkie hasła/MFA
- `JWT_SECRET` można zmienić — spowoduje wylogowanie wszystkich użytkowników
- Zalecane wdrożenie za **Cloudflare Tunnel** — nie wymaga otwierania portów na routerze
- Wszystkie połączenia wewnętrzne (backend↔baza) odbywają się wewnątrz sieci Docker

---

## 📱 PWA — instalacja na telefonie

**Android (Chrome):**
Menu (⋮) → *Dodaj do ekranu głównego*

**iOS (Safari):**
Przycisk Udostępnij → *Dodaj do ekranu głównego*

---

## 📄 Licencja

MIT

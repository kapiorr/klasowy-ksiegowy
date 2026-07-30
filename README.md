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
- Lista uczniów klasy posortowana alfabetycznie
- Możliwość dezaktywacji — nieaktywny uczeń nie jest dodawany do nowych składek, ale jego historia pozostaje
- Import uczniów z pliku CSV (`imie;nazwisko`)
- Admin i Podgląd pełny mogą przeglądać historię wszystkich wpłat ucznia (kliknięcie "Wpłaty" przy uczniu)

### Użytkownicy i role

| Rola | Uprawnienia |
|---|---|
| **Admin** | Pełny dostęp — składki, wpłaty, uczniowie, użytkownicy (CRUD), backup, logi, statystyki, mailing |
| **Księgowy** | Składki/wpłaty/wypłaty (pełny), uczniowie (pełny), użytkownicy (tylko odczyt), mailing; opcjonalnie przypisany uczeń (wtedy widzi własne zaległości i wpłaty na dashboardzie) |
| **Podgląd pełny** | Odczyt wszystkiego, lista uczniów z historią wpłat; opcjonalnie przypisany uczeń (własne zaległości i wpłaty na dashboardzie) |
| **Podgląd** | Własne zaległości na dashboardzie, lista aktywnych uczniów, historia własnych wpłat — **wymaga** przypisania ucznia |

- Logowanie możliwe zarówno loginem jak i adresem email
- Login i email muszą być unikalne — walidacja przy tworzeniu i edycji użytkownika
- Pola użytkownika: login, hasło, rola, imię, nazwisko, email (opcjonalny, walidowany), telefon (opcjonalny, walidowany), powiązany uczeń
- Przypisanie ucznia możliwe dla dowolnej roli; wymagane tylko dla roli `podglad`
- Import użytkowników z CSV (`login;haslo;rola;email;imie;nazwisko`)
- Wysyłka maila powitalnego z linkiem do ustawienia hasła — przy zakładaniu konta lub z poziomu edycji
  - Czas ważności linku do wyboru: 15 min / 1h / 2h / 6h / 1 dzień / 2 dni / 5 dni / 7 dni
- Rola `podglad` wymaga obowiązkowo przypisania ucznia
- Rola `podglad_pelny` może opcjonalnie mieć przypisanego ucznia (wtedy widzi kafelek z zaległościami i historię własnych wpłat na dashboardzie)
- Wymuszanie MFA per użytkownik
- Wymuszanie zmiany hasła przy następnym logowaniu
- Reset MFA przez admina

### Dashboard
- Kafelek "Masz jeszcze do zapłacenia" / "Nie masz żadnych składek do opłacenia" dla ról `podglad`, `podglad_pelny` i `ksiegowy` z przypisanym uczniem
  - Suma zaległości ze wszystkich aktywnych składek
  - Szczegółowa lista składek z kwotami
  - Dane do wpłat (nr konta, BLIK) z `.env`
- Sekcja "Twoje wpłaty" (rozwijalna) — pełna historia wpłat ze wszystkich składek z sumą; widoczna dla `podglad`, `podglad_pelny` i `ksiegowy` z przypisanym uczniem
- Rola `podglad` nie widzi ogólnego salda klasy

### Mailing
- Powiadomienie o nowej składce — wysyłka do użytkowników przypisanych do składki z kwotą do zapłacenia i opisem składki (jeśli istnieje)
- Przypomnienie o zaległościach — na żądanie admina/księgowego, do wszystkich lub wybranych użytkowników z zaległościami (role: podglad, podglad_pelny, ksiegowy)
- Podgląd listy odbiorców przed wysyłką
- Maile zawierają nazwę klasy i szkoły z `.env`

### Bezpieczeństwo
- Hasła hashowane **Argon2id** z pieprzem (PEPPER)
- Tokeny **JWT** — 1h na desktopie, 30 dni na urządzeniach mobilnych (dla admin/księgowy)
- **MFA TOTP** (Google Authenticator, Authy itp.) z kodami zapasowymi
- Blokada konta i IP po 5 nieudanych próbach logowania (1h), mail do admina
- Weryfikacja plików po **magic bytes** (JPEG, PNG, GIF, WebP, PDF)
- Reset hasła przez email (link ważny 1h) — po zmianie hasła aktywne sesje są unieważniane
- Parametryzowane zapytania SQL — ochrona przed SQL injection
- Porty bazy danych i backendu niewystawione na zewnątrz
- Unikalność loginu i emaila na poziomie bazy i aplikacji

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
- **Push notifications** — powiadomienia push o nowych składkach i zaległościach; użytkownik włącza je w Ustawieniach; wymagają konfiguracji VAPID w `.env`
- **Responsive** — w pełni obsługiwany na urządzeniach mobilnych
- Backup całej bazy i restore (JSON z załącznikami base64)
- **Automatyczny backup** codziennie o godzinie ustawionej w `.env` z czterema poziomami retencji:
  - Dzienny — przechowywany 7 dni
  - Tygodniowy (poniedziałek) — przechowywany 6 miesięcy
  - Miesięczny (1. dzień miesiąca) — przechowywany 12 miesięcy
  - Roczny (1 stycznia) — przechowywany 8 lat
- Ręczne uruchomienie backupu w dowolnym momencie z panelu Backup

---

## 🛠 Stack technologiczny

| Warstwa | Technologia |
|---|---|
| Frontend | React 19, Tailwind CSS 4, Vite 8 |
| Backend | Node.js 22, Express 5 |
| Baza danych | PostgreSQL 18 |
| Konteneryzacja | Docker, Docker Compose |
| Dostęp zewnętrzny | Cloudflare Tunnel |
| Czcionki | Syne, DM Sans, DM Mono |

---

## 🚀 Instalacja

### Wymagania
- Docker i Docker Compose
- Cloudflare Tunnel (opcjonalnie, do dostępu z zewnątrz)
- Konto pocztowe SMTP (opcjonalnie, do resetowania hasła i mailingu)

### 1. Sklonuj repozytorium

```bash
git clone https://github.com/kapiorr/klasowy-ksiegowy.git
cd klasowy-ksiegowy
```

### 2. Skonfiguruj zmienne środowiskowe

```bash
cp .env.example .env
```

Edytuj `.env`:

```env
# ─────────────────────────────────────────────────────────
# Generowanie losowych stringów:
#   openssl rand -hex 32     → 64-znakowy string hex
#   openssl rand -base64 32  → ~44-znakowy string base64
# Każda zmienna powinna mieć INNY, unikalny string!
# ─────────────────────────────────────────────────────────

# Konto administratora (tworzone automatycznie przy pierwszym uruchomieniu)
ADMIN_LOGIN=admin
ADMIN_HASLO=bezpieczne_haslo

# JWT — wygeneruj: openssl rand -hex 32
JWT_SECRET=

# Bezpieczeństwo haseł (pieprz) — wygeneruj: openssl rand -hex 32
# UWAGA: NIE ZMIENIAJ po pierwszym uruchomieniu — unieważni wszystkie hasła!
PEPPER=

# Szyfrowanie sekretów MFA — wygeneruj: openssl rand -hex 32
# UWAGA: NIE ZMIENIAJ po pierwszym uruchomieniu — unieważni wszystkie kody MFA!
MFA_ENCRYPTION_KEY=

# PostgreSQL
POSTGRES_USER=ksiegowy
POSTGRES_PASSWORD=haslo_do_bazy
POSTGRES_DB=klasowy_ksiegowy
DATABASE_URL=postgres://ksiegowy:haslo_do_bazy@db:5432/klasowy_ksiegowy

# Email (SMTP) — opcjonalne, wymagane do resetowania hasła, zaproszeń i mailingu
EMAIL_SERVER=smtp.mailgun.org
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=postmaster@twojadomena.pl
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=noreply@twojadomena.pl
ADMIN_EMAIL=admin@twojadomena.pl

# URL aplikacji (używany w linkach w mailach)
APP_URL=https://twojadomena.pl

# Godzina automatycznego backupu (0-23, czas lokalny kontenera)
BACKUP_HOUR=5

# Web Push (PWA powiadomienia push) — wygeneruj: node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
# Pozostaw puste aby wyłączyć push notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@twojadomena.pl

# Szyfrowanie backupów AES-256-GCM — wygeneruj: openssl rand -hex 32
# Pozostaw puste aby backupy były niezaszyfrowane (plaintext JSON)
# UWAGA: bez tego klucza nie odszyfrsujesz zaszyfrowanych backupów!
BACKUP_ENCRYPTION_KEY=

# Dane do wpłat — wyświetlane użytkownikowi z rolą Podgląd na dashboardzie
# Pozostaw puste jeśli nie chcesz wyświetlać
PAYMENT_ACCOUNT=12 3456 7890 1234 5678 9012 3456
PAYMENT_PHONE=600 123 456

# Informacje o klasie wyświetlane na stronie logowania i w mailach (opcjonalne)
CLASS_NAME=VI
SCHOOL_NAME=SP nr 1
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
├── backend/
│   ├── src/
│   │   ├── routes/         # Endpointy API
│   │   ├── middleware/     # Autoryzacja JWT
│   │   ├── fonts/          # Fonty DejaVu (PDF)
│   │   ├── crypto.js       # Argon2, AES-256-GCM
│   │   ├── logger.js       # Logi aktywności
│   │   ├── mailer.js       # Email (SMTP)
│   │   ├── scheduler.js    # Automatyczny backup
│   │   └── filecheck.js    # Weryfikacja magic bytes
│   ├── init.sql            # Schemat bazy danych
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/          # Strony React
│   │   ├── components/     # Layout, Dialog, komponenty
│   │   ├── context/        # Auth, Theme
│   │   └── api.js          # Klient API
│   ├── public/             # PWA manifest, ikony, service worker
│   └── Dockerfile
├── backup_data/            # Automatyczne backupy (ignorowane przez git)
│   └── .gitignore
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🔐 Bezpieczeństwo — uwagi

- Nigdy nie zmieniaj `PEPPER` ani `MFA_ENCRYPTION_KEY` po pierwszym uruchomieniu — unieważni wszystkie hasła/MFA
- `BACKUP_ENCRYPTION_KEY` — jeśli ustawiony, wszystkie backupy są szyfrowane AES-256-GCM; bez tego klucza zaszyfrowane backupy są nie do odczytania; przechowuj klucz osobno od backupów
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

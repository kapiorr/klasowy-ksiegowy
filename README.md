# 📒 Klasowy Księgowy

Aplikacja webowa do zarządzania kasą klasową — wpłatami, wypłatami i składkami uczniów. Zaprojektowana z myślą o prostocie obsługi i bezpieczeństwie, dostępna również jako PWA na urządzeniach mobilnych.

---

## 📸 Funkcjonalności

### Składki
- Tworzenie i zarządzanie składkami (wycieczki, ubezpieczenia, imprezy klasowe itp.)
- Śledzenie wpłat per uczeń z historią zmian
- Wypłaty z możliwością dodania wielu załączników (faktury, rachunki — obrazki kompresowane do WebP 1024px)
- Pasek postępu i saldo (zebrano − wypłaty)
- Archiwizacja składek — zarchiwizowana składka jest tylko do odczytu
- Eksport wpłat do CSV
- Backup i restore pojedynczej składki (JSON z załącznikami base64)

### Uczniowie
- Lista uczniów klasy posortowana alfabetycznie
- Możliwość dezaktywacji — nieaktywny uczeń nie jest dodawany do nowych składek, ale jego historia pozostaje
- Import uczniów z pliku CSV (`imie;nazwisko`)
- Admin, Księgowy i Podgląd pełny mogą przeglądać historię wszystkich wpłat ucznia (kliknięcie "Wpłaty" przy uczniu)

### Użytkownicy i role

| Rola | Uprawnienia |
|---|---|
| **Admin** | Pełny dostęp — składki, wpłaty, uczniowie, użytkownicy (CRUD), backup, logi, statystyki, mailing |
| **Księgowy** | Składki/wpłaty/wypłaty (pełny), uczniowie (pełny), użytkownicy (tylko odczyt), mailing; opcjonalnie przypisany uczeń (wtedy widzi własne zaległości i wpłaty na dashboardzie) |
| **Podgląd pełny** | Odczyt wszystkiego, lista uczniów z historią wpłat; opcjonalnie przypisany uczeń (własne zaległości i wpłaty na dashboardzie) |
| **Podgląd** | Własne zaległości na dashboardzie, lista aktywnych uczniów, historia własnych wpłat — **wymaga** przypisania ucznia |

- Logowanie możliwe zarówno loginem jak i adresem email
- Login i email muszą być unikalne — walidacja przy tworzeniu i edycji użytkownika
- Pola użytkownika: login, hasło, rola, imię, nazwisko, email (opcjonalny, walidowany), telefon (opcjonalny, walidowany), powiązany uczeń, sms_powiadomienia, pomijaj_hibp (wyłącza HIBP), hibp_wycieklo (wynik ostatniego sprawdzenia), hibp_dismissed_at (kiedy zamknięto kafelek)
- Przypisanie ucznia możliwe dla dowolnej roli; wymagane tylko dla roli `podglad`
- Import użytkowników z CSV (`login;haslo;rola;email;imie;nazwisko;telefon;sms_powiadomienia`) — nagłówek opcjonalny, rola: admin/ksiegowy/podglad_pelny/podglad
- Eksport użytkowników do CSV z pełnymi danymi (telefon, SMS, powiązany uczeń)
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
- Wybór kanału wysyłki: email, SMS lub oba jednocześnie
- Wymuszenie SMS ignoruje preferencje użytkownika (z ostrzeżeniem)
- SMS widoczny tylko gdy skonfigurowany `SMSAPI_TOKEN`
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
- **SMS** — opcjonalne powiadomienia SMS przez SMSAPI.pl; użytkownik może włączyć/wyłączyć w Ustawieniach; admin może wymusić wysyłkę mimo wyłączenia
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
# ─────────────────────────────────────────────────────────────────────────────
# Generowanie losowych stringów (wykonaj w terminalu):
#
#   openssl rand -hex 32     → 64-znakowy string hex (dla JWT_SECRET, PEPPER, MFA_ENCRYPTION_KEY)
#   openssl rand -base64 32  → ~44-znakowy string base64 (alternatywa)
#
# Każda zmienna powinna mieć INNY, unikalny string!
# ─────────────────────────────────────────────────────────────────────────────

# Konto administratora (tworzone automatycznie przy pierwszym uruchomieniu)
ADMIN_LOGIN=ksiegowy
ADMIN_HASLO=zmien_na_silne_haslo

# JWT — podpisywanie tokenów sesji — wygeneruj: openssl rand -hex 32
JWT_SECRET=

# Bezpieczeństwo haseł (pieprz) — wygeneruj: openssl rand -hex 32
# UWAGA: NIE ZMIENIAJ po pierwszym uruchomieniu — unieważni wszystkie hasła!
PEPPER=

# Szyfrowanie sekretów MFA — wygeneruj: openssl rand -hex 32
# UWAGA: NIE ZMIENIAJ po pierwszym uruchomieniu — unieważni wszystkie kody MFA!
MFA_ENCRYPTION_KEY=

# PostgreSQL
POSTGRES_USER=ksiegowy
POSTGRES_PASSWORD=zmien_na_silne_haslo_bazy
POSTGRES_DB=klasowy_ksiegowy
# DATABASE_URL jest składane automatycznie przez docker-compose — nie podawaj go tutaj
# SSL dla bazy danych (ustaw na true tylko przy zewnętrznej bazie np. AWS RDS)
DB_SSL=false
# DB_SSL_REJECT_UNAUTHORIZED=true

# Email (Mailgun SMTP) — opcjonalne, wymagane do resetowania hasła i zaproszeń
EMAIL_SERVER=smtp.mailgun.org
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=postmaster@twojadomena.pl
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=noreply@twojadomena.pl

# URL aplikacji (używany w linkach w mailach i jako dozwolone źródło CORS)
APP_URL=https://twojadomena.pl

# Email admina — alerty bezpieczeństwa (blokady, nieudane logowania)
ADMIN_EMAIL=admin@twojadomena.pl

# Godzina automatycznego backupu (0-23, czas lokalny kontenera)
BACKUP_HOUR=5

# Katalog backupów (domyślnie /app/backups — zamontowany jako volumen w docker-compose)
# BACKUP_DIR=/app/backups

# Szyfrowanie backupów AES-256-GCM — wygeneruj: openssl rand -hex 32
# Pozostaw puste aby backupy były niezaszyfrowane (plaintext JSON)
# UWAGA: bez tego klucza nie odszyfrsujesz zaszyfrowanych backupów!
BACKUP_ENCRYPTION_KEY=

# SMSAPI — wysyłka SMS (opcjonalne)
# Token OAuth z panelu: https://ssl.smsapi.pl/react/oauth/manage
# Pozostaw puste aby wyłączyć SMS
SMSAPI_TOKEN=
# Pole nadawcy (maks. 11 znaków, musi być zarejestrowane w panelu SMSAPI)
SMSAPI_FROM=Ksiegowy

# Web Push (PWA powiadomienia push)
# Wygeneruj: docker exec ksiegowy_backend node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@twojadomena.pl

# Dane do wpłat (wyświetlane użytkownikowi z rolą Podgląd na dashboardzie)
PAYMENT_ACCOUNT=
PAYMENT_PHONE=

# Informacje o klasie wyświetlane na stronie logowania
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
- `JWT_SECRET` można zmienić — spowoduje wylogowanie wszystkich użytkowników
- Sprawdzanie HIBP działa bez dodatkowej konfiguracji — wymaga połączenia z internetem przy zmianie hasła; przy niedostępności API hasło jest akceptowane (fail-open); wynik jest zapisywany w bazie i nie powoduje ponownych zapytań do HIBP
- `APP_URL` musi być ustawiony — używany jako dozwolone źródło CORS oraz w linkach w mailach
- `DB_SSL=true` — włącz tylko przy zewnętrznej bazie danych (np. AWS RDS); lokalny Docker nie wymaga
- `BACKUP_ENCRYPTION_KEY` — jeśli ustawiony, wszystkie backupy są szyfrowane AES-256-GCM; bez tego klucza zaszyfrowane backupy są nie do odczytania; przechowuj klucz osobno od backupów
- `SMSAPI_TOKEN` — jeśli ustawiony, SMS jest dostępny w mailingach; użytkownik może sam wyłączyć w Ustawieniach; admin może wymusić wysyłkę
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

import crypto from 'crypto';

// Sprawdza czy hasło jest na liście wyciekłych przez API HIBP k-anonymity
// Zwraca { wyciekło: bool, liczba: int } lub null przy błędzie API
export async function sprawdzHIBP(haslo) {
  try {
    const sha1 = crypto.createHash('sha1').update(haslo).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000), // 3 sekundy timeout
    });

    if (!res.ok) return null; // błąd API — nie blokujemy

    const text = await res.text();
    for (const line of text.split('\n')) {
      const [hash, count] = line.trim().split(':');
      if (hash === suffix) {
        return { wyciekło: true, liczba: parseInt(count) };
      }
    }
    return { wyciekło: false, liczba: 0 };
  } catch {
    return null; // błąd sieci/timeout — nie blokujemy
  }
}

// Pomocnicza — używana w endpointach
// pomijaj: true gdy admin świadomie pomija sprawdzenie
export async function walidujHasloHIBP(haslo, pomijaj = false) {
  if (pomijaj) return null; // pominięte — OK
  const wynik = await sprawdzHIBP(haslo);
  if (!wynik) return null; // błąd API — nie blokujemy
  if (wynik.wyciekło) {
    return `To hasło figuruje ${wynik.liczba.toLocaleString('pl-PL')} razy w bazach wyciekłych haseł — wybierz inne`;
  }
  return null; // OK
}

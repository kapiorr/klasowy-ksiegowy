// Weryfikacja pliku po magic bytes (nie po rozszerzeniu ani MIME z klienta)

const ALLOWED_SIGNATURES = [
  // JPEG
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  // PNG
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  // GIF
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP (RIFF....WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  // PDF
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateFile(base64data, declaredMime, fileName) {
  if (!base64data) return { ok: true };

  // Rozmiar
  const bytes = Buffer.from(base64data, 'base64');
  if (bytes.length > MAX_SIZE) {
    return { ok: false, error: `Plik za duży (max ${MAX_SIZE / 1024 / 1024} MB)` };
  }

  // Sprawdź magic bytes
  const matched = ALLOWED_SIGNATURES.find(sig =>
    sig.bytes.every((b, i) => bytes[i] === b)
  );

  if (!matched) {
    return { ok: false, error: 'Niedozwolony typ pliku. Akceptowane: JPEG, PNG, GIF, WebP, PDF' };
  }

  // Sprawdź czy WebP nie jest przypadkiem jakimś innym RIFF
  if (matched.mime === 'image/webp') {
    const webpMark = bytes.slice(8, 12).toString('ascii');
    if (webpMark !== 'WEBP') {
      return { ok: false, error: 'Niedozwolony typ pliku' };
    }
  }

  // Sprawdź rozszerzenie pliku
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
  if (!allowedExts.includes(ext)) {
    return { ok: false, error: `Niedozwolone rozszerzenie .${ext}` };
  }

  return { ok: true, detectedMime: matched.mime };
}

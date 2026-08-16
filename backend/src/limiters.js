import rateLimit from 'express-rate-limit';

export const mailingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 wysyłek / 15 min — klasa max ~35 uczniów
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST', // licz tylko POSTy
  message: { error: 'Za dużo wysyłek — spróbuj ponownie za chwilę' },
});

export const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Za dużo prób resetu hasła — spróbuj ponownie za 15 minut' },
});

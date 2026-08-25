// Polityka haseł — używana w backendzie i eksportowana do frontendu przez /api/config

export const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
};

export const SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

export function walidujSilnoscHasla(haslo) {
  const errors = [];
  if (!haslo || haslo.length < PASSWORD_POLICY.minLength)
    errors.push(`min. ${PASSWORD_POLICY.minLength} znaków`);
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(haslo))
    errors.push('wielka litera');
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(haslo))
    errors.push('mała litera');
  if (PASSWORD_POLICY.requireDigit && !/[0-9]/.test(haslo))
    errors.push('cyfra');
  if (PASSWORD_POLICY.requireSpecial && !/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(haslo))
    errors.push('znak specjalny (!@#$%...)');
  return errors; // pusta tablica = hasło OK
}

export function hasloSpelniaWymagania(haslo) {
  return walidujSilnoscHasla(haslo).length === 0;
}

export const PASSWORD_REQUIREMENTS_TEXT =
  `min. ${PASSWORD_POLICY.minLength} znaków, wielka i mała litera, cyfra, znak specjalny (!@#$%...)`;

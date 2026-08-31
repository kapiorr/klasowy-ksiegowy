import jwt from 'jsonwebtoken';
import db from '../db.js';

export function requireAuth(req, res, next) {
  // Token z httpOnly cookie (preferowany) lub nagłówka Authorization (fallback)
  const cookieToken = req.cookies?.token;
  const header = req.headers.authorization;
  const token = cookieToken || (header?.startsWith('Bearer ') ? header.slice(7) : null);

  if (!token) {
    return res.status(401).json({ error: 'Brak tokenu' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Sprawdź czy sesja nie została unieważniona (np. po wysłaniu linku reset)
    db.query(
      'SELECT sessions_invalidated_at FROM uzytkownicy WHERE id=$1',
      [decoded.id]
    ).then(result => {
      // Brak wiersza = konto usunięte = 401
      if (!result.rows[0]) {
        return res.status(401).json({ error: 'Konto nie istnieje — zaloguj się ponownie' });
      }
      const invalidatedAt = result.rows[0].sessions_invalidated_at;
      if (invalidatedAt) {
        const tokenIat = decoded.iat * 1000;
        if (new Date(invalidatedAt).getTime() > tokenIat) {
          return res.status(401).json({ error: 'Sesja wygasła — zaloguj się ponownie' });
        }
      }
      req.user = decoded;
      next();
    }).catch(() => {
      return res.status(503).json({ error: 'Błąd serwera — spróbuj ponownie' });
    });
  } catch {
    res.status(401).json({ error: 'Nieprawidłowy token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.rola !== 'admin') {
      return res.status(403).json({ error: 'Brak uprawnień — wymagana rola admin' });
    }
    next();
  });
}

export function requireKsiegowy(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'ksiegowy'].includes(req.user.rola)) {
      return res.status(403).json({ error: 'Brak uprawnień' });
    }
    next();
  });
}

export function requireKsiegowyOrPelny(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'ksiegowy', 'podglad_pelny'].includes(req.user.rola)) {
      return res.status(403).json({ error: 'Brak uprawnień' });
    }
    next();
  });
}

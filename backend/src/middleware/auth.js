import jwt from 'jsonwebtoken';
import db from '../db.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Brak tokenu' });
  }
  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Sprawdź czy sesja nie została unieważniona (np. po wysłaniu linku reset)
    db.query(
      'SELECT sessions_invalidated_at FROM uzytkownicy WHERE id=$1',
      [decoded.id]
    ).then(result => {
      const invalidatedAt = result.rows[0]?.sessions_invalidated_at;
      if (invalidatedAt) {
        const tokenIat = decoded.iat * 1000; // iat w sekundach → ms
        if (new Date(invalidatedAt).getTime() > tokenIat) {
          return res.status(401).json({ error: 'Sesja wygasła — zaloguj się ponownie' });
        }
      }
      req.user = decoded;
      next();
    }).catch(() => {
      // Błąd DB — przepuść żeby nie blokować
      req.user = decoded;
      next();
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

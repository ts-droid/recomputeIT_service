import crypto from 'node:crypto';
import { query } from '../db.js';
import { API_KEY, canAccess } from '../lib/constants.js';

const timingSafeEqual = (a, b) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export { timingSafeEqual };

export const requireAuth = async (req, res, next) => {
  const headerKey = req.headers['x-api-key'];
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const providedKey = headerKey || bearer || '';

  if (API_KEY && providedKey && timingSafeEqual(providedKey, API_KEY)) {
    req.user = { id: 'master-key', role: 'admin', email: 'master@local' };
    return next();
  }

  if (!providedKey) {
    return res.status(401).json({ error: 'Obehörig.' });
  }

  try {
    const { rows } = await query(
      'SELECT u.id, u.email, u.role, u.name, u.tenant_id FROM users u WHERE u.api_token = $1',
      [providedKey]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'Obehörig.' });
    }

    req.user = rows[0];
    return next();
  } catch (error) {
    console.error('Auth lookup error:', error);
    return res.status(500).json({ error: 'Auth error.' });
  }
};

export const requireRole = (role) => (req, res, next) => {
  if (!req.user || !canAccess(req.user.role, role)) {
    return res.status(403).json({ error: 'Otillräcklig behörighet.' });
  }
  return next();
};

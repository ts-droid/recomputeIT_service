import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, getTenantBrand } from '../middleware/tenant.js';
import { checkLoginRateLimit } from '../middleware/security.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!checkLoginRateLimit(clientIp)) {
      return res.status(429).json({ error: 'För många inloggningsförsök. Försök igen om 15 minuter.' });
    }

    const { email, password, tenant_slug } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-post och lösenord krävs.' });
    }

    let userQuery;
    let userParams;
    if (tenant_slug) {
      userQuery = `
        SELECT u.id, u.email, u.password_hash, u.role, u.name, u.tenant_id
        FROM users u JOIN tenants t ON t.id = u.tenant_id
        WHERE u.email = $1 AND t.slug = $2 AND t.is_active = true
      `;
      userParams = [email.toLowerCase(), tenant_slug];
    } else {
      userQuery = `
        SELECT u.id, u.email, u.password_hash, u.role, u.name, u.tenant_id
        FROM users u JOIN tenants t ON t.id = u.tenant_id
        WHERE u.email = $1 AND t.is_active = true
        ORDER BY u.last_login_at DESC NULLS LAST LIMIT 1
      `;
      userParams = [email.toLowerCase()];
    }

    const { rows } = await query(userQuery, userParams);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Felaktiga uppgifter.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Felaktiga uppgifter.' });

    const token = crypto.randomBytes(32).toString('hex');
    await query('UPDATE users SET api_token = $1, last_login_at = NOW() WHERE id = $2', [token, user.id]);

    const { rows: tenantRows } = await query('SELECT * FROM tenants WHERE id = $1', [user.tenant_id]);
    const tenant = tenantRows[0] || null;
    const brand = getTenantBrand(tenant);

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name, tenant_id: user.tenant_id },
      tenant: { id: tenant?.id, slug: tenant?.slug, name: tenant?.name },
      brand,
    });
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    res.status(500).json({ error: 'Kunde inte logga in.' });
  }
});

router.get('/me', requireAuth, requireTenant, (req, res) => {
  const brand = getTenantBrand(req.tenant);
  res.json({
    user: req.user,
    tenant: { id: req.tenant?.id, slug: req.tenant?.slug, name: req.tenant?.name },
    brand,
  });
});

export default router;

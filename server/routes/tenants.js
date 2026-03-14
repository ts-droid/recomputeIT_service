import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireTenant, getTenantBrand, clearTenantCache } from '../middleware/tenant.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /brand  — public brand info for the current tenant (after auth)
// ---------------------------------------------------------------------------
router.get('/brand', requireAuth, requireTenant, (req, res) => {
  const brand = getTenantBrand(req.tenant);
  res.json(brand);
});

// ---------------------------------------------------------------------------
// GET /  — list all tenants (super-admin only)
// ---------------------------------------------------------------------------
router.get('/', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, slug, name, support_email, support_phone, is_active, created_at FROM tenants ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/tenants error:', error);
    res.status(500).json({ error: 'Kunde inte hämta tenants.' });
  }
});

// ---------------------------------------------------------------------------
// POST /  — create a new tenant (super-admin)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { slug, name, support_email, support_phone, brand_config } = req.body || {};
    if (!slug || !name) {
      return res.status(400).json({ error: 'slug och name krävs.' });
    }

    const { rows } = await query(
      `INSERT INTO tenants (slug, name, support_email, support_phone, brand_config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [slug, name, support_email || null, support_phone || null, JSON.stringify(brand_config || {})]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    if (error?.constraint === 'tenants_slug_key') {
      return res.status(409).json({ error: 'En tenant med detta slug finns redan.' });
    }
    console.error('POST /api/tenants error:', error);
    res.status(500).json({ error: 'Kunde inte skapa tenant.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id  — update tenant
// ---------------------------------------------------------------------------
router.patch('/:id', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, support_email, support_phone, brand_config, smtp_config, sms_config, is_active } = req.body || {};

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (support_email !== undefined) { updates.push(`support_email = $${idx++}`); values.push(support_email); }
    if (support_phone !== undefined) { updates.push(`support_phone = $${idx++}`); values.push(support_phone); }
    if (brand_config !== undefined) { updates.push(`brand_config = $${idx++}::jsonb`); values.push(JSON.stringify(brand_config)); }
    if (smtp_config !== undefined) { updates.push(`smtp_config = $${idx++}::jsonb`); values.push(JSON.stringify(smtp_config)); }
    if (sms_config !== undefined) { updates.push(`sms_config = $${idx++}::jsonb`); values.push(JSON.stringify(sms_config)); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Inga fält att uppdatera.' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Tenant hittades inte.' });
    }

    clearTenantCache(id);
    res.json(rows[0]);
  } catch (error) {
    console.error('PATCH /api/tenants/:id error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera tenant.' });
  }
});

export default router;

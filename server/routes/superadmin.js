import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { clearTenantCache } from '../middleware/tenant.js';
import bcrypt from 'bcryptjs';

const router = Router();

// All superadmin routes require superadmin role — NO requireTenant (cross-tenant)
const sa = [requireAuth, requireRole('superadmin')];

// ---------------------------------------------------------------------------
// GET /usage — message usage stats per tenant (SMS + email counts)
// ---------------------------------------------------------------------------
router.get('/usage', ...sa, async (req, res) => {
  try {
    const { from, to } = req.query;

    let dateFilter = '';
    const params = [];
    let idx = 1;

    if (from) {
      dateFilter += ` AND ml.created_at >= $${idx++}::timestamptz`;
      params.push(from);
    }
    if (to) {
      dateFilter += ` AND ml.created_at <= $${idx++}::timestamptz`;
      params.push(to);
    }

    // Per-tenant breakdown of SMS / email, inbound / outbound
    const { rows } = await query(
      `SELECT
         t.id AS tenant_id,
         t.slug,
         t.name AS tenant_name,
         COALESCE(SUM(CASE WHEN ml.channel = 'sms'   AND ml.direction = 'outbound' THEN 1 ELSE 0 END), 0)::int AS sms_outbound,
         COALESCE(SUM(CASE WHEN ml.channel = 'sms'   AND ml.direction = 'inbound'  THEN 1 ELSE 0 END), 0)::int AS sms_inbound,
         COALESCE(SUM(CASE WHEN ml.channel = 'email'  AND ml.direction = 'outbound' THEN 1 ELSE 0 END), 0)::int AS email_outbound,
         COALESCE(SUM(CASE WHEN ml.channel = 'email'  AND ml.direction = 'inbound'  THEN 1 ELSE 0 END), 0)::int AS email_inbound,
         COUNT(ml.id)::int AS total_messages
       FROM tenants t
       LEFT JOIN message_logs ml ON ml.tenant_id = t.id ${dateFilter}
       WHERE t.is_active = TRUE
       GROUP BY t.id, t.slug, t.name
       ORDER BY t.name ASC`,
      params
    );

    // Summary totals
    const summary = rows.reduce(
      (acc, r) => {
        acc.sms_outbound += r.sms_outbound;
        acc.sms_inbound += r.sms_inbound;
        acc.email_outbound += r.email_outbound;
        acc.email_inbound += r.email_inbound;
        acc.total_messages += r.total_messages;
        return acc;
      },
      { sms_outbound: 0, sms_inbound: 0, email_outbound: 0, email_inbound: 0, total_messages: 0 }
    );

    res.json({ tenants: rows, summary });
  } catch (error) {
    console.error('GET /api/superadmin/usage error:', error);
    res.status(500).json({ error: 'Kunde inte hämta användningsstatistik.' });
  }
});

// ---------------------------------------------------------------------------
// GET /tenants — list all tenants (full detail for CRUD)
// ---------------------------------------------------------------------------
router.get('/tenants', ...sa, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, slug, name, support_email, support_phone, brand_config,
              smtp_config, sms_config, is_active, created_at, updated_at
       FROM tenants
       ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/superadmin/tenants error:', error);
    res.status(500).json({ error: 'Kunde inte hämta tenants.' });
  }
});

// ---------------------------------------------------------------------------
// POST /tenants — create a new tenant
// ---------------------------------------------------------------------------
router.post('/tenants', ...sa, async (req, res) => {
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
    console.error('POST /api/superadmin/tenants error:', error);
    res.status(500).json({ error: 'Kunde inte skapa tenant.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /tenants/:id — update tenant (including brand_config, activate/deactivate)
// ---------------------------------------------------------------------------
router.patch('/tenants/:id', ...sa, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, support_email, support_phone, brand_config, smtp_config, sms_config, is_active } = req.body || {};

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (slug !== undefined) { updates.push(`slug = $${idx++}`); values.push(slug); }
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
    if (error?.constraint === 'tenants_slug_key') {
      return res.status(409).json({ error: 'En tenant med detta slug finns redan.' });
    }
    console.error('PATCH /api/superadmin/tenants/:id error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera tenant.' });
  }
});

// ---------------------------------------------------------------------------
// GET /tenants/:id/users — list users for a specific tenant
// ---------------------------------------------------------------------------
router.get('/tenants/:id/users', ...sa, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, name, role, created_at
       FROM users
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/superadmin/tenants/:id/users error:', error);
    res.status(500).json({ error: 'Kunde inte hämta användare.' });
  }
});

// ---------------------------------------------------------------------------
// POST /tenants/:id/users — create a user under a specific tenant
// ---------------------------------------------------------------------------
router.post('/tenants/:id/users', ...sa, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { email, password, name, role } = req.body || {};

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'email, password och role krävs.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, created_at`,
      [tenantId, email, hash, name || null, role]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    if (error?.constraint === 'users_tenant_email_unique') {
      return res.status(409).json({ error: 'En användare med denna e-post finns redan för denna tenant.' });
    }
    console.error('POST /api/superadmin/tenants/:id/users error:', error);
    res.status(500).json({ error: 'Kunde inte skapa användare.' });
  }
});

export default router;

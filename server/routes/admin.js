import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { ROLE_RANK } from '../lib/constants.js';
import { sendEmail } from '../services/email.js';
import { buildEmailHtml } from '../services/email-parsing.js';

const generatePassword = () => crypto.randomBytes(6).toString('base64url');
import {
  mergeMessageSettings,
  getAdminMessageSettings,
  autoTranslateMessageSettings,
} from '../services/message-settings.js';

const router = Router();

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------
router.post('/users', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { email, role, name } = req.body || {};
    if (!email || !role) {
      return res.status(400).json({ error: 'Email och roll krävs.' });
    }

    if (!ROLE_RANK[role]) {
      return res.status(400).json({ error: 'Ogiltig roll.' });
    }

    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO users (tenant_id, email, password_hash, role, name) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, role, name',
      [req.tenantId, email.toLowerCase(), hash, role, name || null]
    );

    // Send credentials to the new user
    try {
      const body = `Hej${name ? ` ${name}` : ''}!\n\nDitt konto har skapats.\n\nE-post: ${email}\nTillfälligt lösenord: ${password}\n\nLogga in och byt lösenord så snart som möjligt.`;
      await sendEmail({ to: email, subject: 'Ditt konto har skapats', body, html: buildEmailHtml(body) });
    } catch (emailErr) {
      console.error('Failed to send welcome email:', emailErr);
    }

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('POST /api/admin/users error:', error);
    res.status(500).json({ error: 'Kunde inte skapa användare.' });
  }
});

router.get('/users', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, role, name, created_at, last_login_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    res.status(500).json({ error: 'Kunde inte hämta användare.' });
  }
});

router.patch('/users/:id', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, name } = req.body || {};

    if (role && !ROLE_RANK[role]) {
      return res.status(400).json({ error: 'Ogiltig roll.' });
    }

    const { rows } = await query(
      'UPDATE users SET role = COALESCE($1, role), name = COALESCE($2, name) WHERE id = $3 AND tenant_id = $4 RETURNING id, email, role, name',
      [role || null, name || null, id, req.tenantId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Användare hittades inte.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/users error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera användare.' });
  }
});

router.post('/users/:id/reset-password', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: userRows } = await query(
      'SELECT id, email, name FROM users WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    if (!userRows[0]) {
      return res.status(404).json({ error: 'Användare hittades inte.' });
    }

    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = $1, api_token = NULL WHERE id = $2', [hash, id]);

    const user = userRows[0];
    try {
      const body = `Hej${user.name ? ` ${user.name}` : ''}!\n\nDitt lösenord har nollställts.\n\nNytt tillfälligt lösenord: ${password}\n\nLogga in och byt lösenord så snart som möjligt.`;
      await sendEmail({ to: user.email, subject: 'Ditt lösenord har nollställts', body, html: buildEmailHtml(body) });
    } catch (emailErr) {
      console.error('Failed to send reset email:', emailErr);
      return res.status(200).json({ ok: true, emailSent: false, message: 'Lösenord nollställt men e-post kunde inte skickas.' });
    }

    res.json({ ok: true, emailSent: true });
  } catch (error) {
    console.error('POST /api/admin/users/:id/reset-password error:', error);
    res.status(500).json({ error: 'Kunde inte nollställa lösenord.' });
  }
});

// ---------------------------------------------------------------------------
// Self-service password change (any authenticated user)
// ---------------------------------------------------------------------------
router.post('/change-password', requireAuth, requireTenant, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Nuvarande och nytt lösenord krävs.' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Nytt lösenord måste vara minst 8 tecken.' });
    }

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Användare hittades inte.' });

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(403).json({ error: 'Felaktigt nuvarande lösenord.' });

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/admin/change-password error:', error);
    res.status(500).json({ error: 'Kunde inte byta lösenord.' });
  }
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
router.get('/stats', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = ['tenant_id = $1'];
    const values = [req.tenantId];

    if (from) {
      values.push(from);
      where.push(`created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      where.push(`created_at <= $${values.length}`);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const { rows } = await query(
      `
      SELECT
        COUNT(*)::int AS total_tickets,
        COUNT(*) FILTER (WHERE status = 'Avslutad')::int AS closed_tickets,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_repair_seconds,
        AVG(EXTRACT(EPOCH FROM (customer_notified_at - completed_at))) AS avg_notify_seconds,
        AVG(EXTRACT(EPOCH FROM (picked_up_at - customer_notified_at))) AS avg_pickup_seconds
      FROM service_tickets
      ${whereClause}
    `,
      values
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('GET /api/admin/stats error:', error);
    res.status(500).json({ error: 'Kunde inte hämta statistik.' });
  }
});

// ---------------------------------------------------------------------------
// Test email
// ---------------------------------------------------------------------------
router.post('/test-email', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const { to } = req.body || {};
    if (!to) {
      return res.status(400).json({ error: 'Mottagare saknas.' });
    }

    const subject = 'Testmail från re:Compute-IT';
    const body = 'Detta är ett testmail från systemet. Om du ser detta fungerar SMTP.';

    await sendEmail({ to, subject, body, html: buildEmailHtml(body) });
    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/admin/test-email error:', {
      message: error?.message,
      code: error?.code,
      command: error?.command,
      response: error?.response,
    });
    res.status(500).json({
      error: 'Kunde inte skicka testmail.',
      details: error?.message || 'Okänt fel',
    });
  }
});

// ---------------------------------------------------------------------------
// Message settings
// ---------------------------------------------------------------------------
router.get('/message-settings', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const settings = await getAdminMessageSettings(req.tenantId);
    res.json(settings);
  } catch (error) {
    console.error('GET /api/admin/message-settings error:', error);
    res.status(500).json({ error: 'Kunde inte hämta meddelandeinställningar.' });
  }
});

router.put('/message-settings', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const settings = mergeMessageSettings(req.body || {});
    const { rows } = await query(
      `INSERT INTO app_settings (tenant_id, key, value_json, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (tenant_id, key)
       DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
       RETURNING value_json`,
      [req.tenantId, 'message_templates', JSON.stringify(settings)]
    );
    void autoTranslateMessageSettings(settings)
      .then(async (translatedSettings) => {
        await query(
          `INSERT INTO app_settings (tenant_id, key, value_json, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (tenant_id, key)
           DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
          [req.tenantId, 'message_templates', JSON.stringify(translatedSettings)]
        );
      })
      .catch((error) => {
        console.error('Background auto-translation failed:', error);
      });
    res.json(rows[0]?.value_json || settings);
  } catch (error) {
    console.error('PUT /api/admin/message-settings error:', error);
    res.status(500).json({ error: 'Kunde inte spara meddelandeinställningar.' });
  }
});

router.post('/message-settings/auto-translate', requireAuth, requireRole('admin'), requireTenant, async (req, res) => {
  try {
    const current = await getAdminMessageSettings(req.tenantId);
    const translated = await autoTranslateMessageSettings(current);
    const { rows } = await query(
      `INSERT INTO app_settings (tenant_id, key, value_json, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (tenant_id, key)
       DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
       RETURNING value_json`,
      [req.tenantId, 'message_templates', JSON.stringify(translated)]
    );
    res.json(rows[0]?.value_json || translated);
  } catch (error) {
    console.error('POST /api/admin/message-settings/auto-translate error:', error);
    res.status(500).json({ error: 'Kunde inte auto-översätta meddelandeinställningar.' });
  }
});

export default router;

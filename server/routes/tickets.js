import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { DEEPSEEK_API_KEY, DEEPSEEK_MODEL } from '../lib/constants.js';
import { normalizePhone, normalizePreferredChannel, getLanguage } from '../services/phone.js';
import { translateText, translateIfNeeded, normalizeComparableText } from '../services/translation.js';
import { buildEmailHtml, generateReplyToken, appendReplyGuidance } from '../services/email-parsing.js';
import { sendEmail } from '../services/email.js';
import { sendSms } from '../services/sms.js';
import { resolvePreferredContactChannel } from '../services/phone.js';
import { getAdminMessageSettings, DEFAULT_MESSAGE_SETTINGS, mergeMessageSettings } from '../services/message-settings.js';
import { standardizeActionsText } from '../services/notifications.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /users  (list tenant users for technician dropdown)
// ---------------------------------------------------------------------------
router.get('/users', requireAuth, requireTenant, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email FROM users WHERE tenant_id = $1 ORDER BY name ASC NULLS LAST, email ASC',
      [req.tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/tickets/users error:', error);
    res.status(500).json({ error: 'Kunde inte hämta användare.' });
  }
});

// ---------------------------------------------------------------------------
// GET /  (list tickets)
// ---------------------------------------------------------------------------
router.get('/', requireAuth, requireTenant, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { rows } = await query(
      `
        SELECT
          t.*,
          inbound.last_inbound_message_at,
          (
            inbound.last_inbound_message_at IS NOT NULL
            AND inbound.last_inbound_message_at > COALESCE(t.last_staff_contact_at, 'epoch'::timestamptz)
          ) AS has_new_customer_message
        FROM service_tickets t
        LEFT JOIN LATERAL (
          SELECT MAX(created_at) AS last_inbound_message_at
          FROM message_logs
          WHERE ticket_id = t.id
            AND direction = 'inbound'
        ) inbound ON TRUE
        WHERE t.tenant_id = $3
        ORDER BY t.created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset, req.tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/tickets error:', error);
    res.status(500).json({ error: 'Kunde inte hämta ärenden.' });
  }
});

// ---------------------------------------------------------------------------
// POST /  (create ticket)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, requireTenant, async (req, res) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      preferred_contact_channel,
      device_type,
      device_model,
      issue_description,
      additional_notes,
      disclaimer_language,
      status,
      user_id,
    } = req.body || {};

    const missingFields = [];
    const cleanedEmail = customer_email?.toString().trim() || '';
    const cleanedPhone = customer_phone?.toString().trim() || '';
    if (!customer_name?.toString().trim()) missingFields.push('customer_name');
    if (!cleanedPhone && !cleanedEmail) missingFields.push('customer_phone_or_email');
    if (!device_type?.toString().trim()) missingFields.push('device_type');
    if (!issue_description?.toString().trim()) missingFields.push('issue_description');

    const resolvedPreferredChannel = (() => {
      const hasPhone = Boolean(cleanedPhone);
      const hasEmail = Boolean(cleanedEmail);
      const normalizedPreferred = normalizePreferredChannel(preferred_contact_channel);
      if (hasPhone && hasEmail) return normalizedPreferred;
      if (hasPhone) return 'sms';
      if (hasEmail) return 'email';
      return '';
    })();

    if (cleanedPhone && cleanedEmail && !resolvedPreferredChannel) {
      missingFields.push('preferred_contact_channel');
    }

    if (missingFields.length > 0) {
      console.warn('POST /api/tickets validation failed:', {
        contentType: req.headers['content-type'],
        bodyKeys: Object.keys(req.body || {}),
        body: req.body,
        missingFields,
      });
      return res.status(400).json({
        error: 'Saknar obligatoriska fält.',
        details: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const normalizedPhoneValue = normalizePhone(cleanedPhone);
    const { rows } = await query(
      `
        INSERT INTO service_tickets (
          tenant_id,
          customer_name,
          customer_email,
          customer_phone,
          customer_phone_normalized,
          preferred_contact_channel,
          device_type,
          device_model,
          issue_description,
          additional_notes,
          disclaimer_language,
          status,
          user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `,
      [
        req.tenantId,
        customer_name,
        cleanedEmail || null,
        cleanedPhone || null,
        normalizedPhoneValue || null,
        resolvedPreferredChannel || null,
        device_type,
        device_model || null,
        issue_description,
        additional_notes || null,
        disclaimer_language || 'sv',
        status || 'Nytt',
        user_id || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('POST /api/tickets error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
    });
    res.status(500).json({
      error: 'Kunde inte skapa ärende.',
      details: error?.message || 'Okänt fel',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id  (delete ticket)
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete related message_logs first (FK constraint)
    await query('DELETE FROM message_logs WHERE ticket_id = $1 AND tenant_id = $2', [id, req.tenantId]);

    const { rows } = await query(
      'DELETE FROM service_tickets WHERE id = $1 AND tenant_id = $2 RETURNING id, ticket_number',
      [id, req.tenantId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    res.json({ ok: true, deleted: rows[0] });
  } catch (error) {
    console.error('DELETE /api/tickets/:id error:', error);
    res.status(500).json({ error: 'Kunde inte ta bort ärende.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id  (update ticket)
// ---------------------------------------------------------------------------
router.patch('/:id', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const allowedFields = new Set([
      'customer_name',
      'status',
      'cost_proposal',
      'not_repairable',
      'cost_proposal_approved',
      'planned_actions',
      'internal_notes',
      'work_done_summary',
      'final_cost',
      'diagnosis',
      'is_hidden',
      'disclaimer_language',
      'preferred_contact_channel',
      'customer_email',
      'customer_phone',
      'additional_notes',
      'device_model',
      'completed_at',
      'customer_notified_at',
      'picked_up_at',
      'closed_at',
      'assigned_to',
      'assigned_to_name',
    ]);

    if (updates.status) {
      if (updates.status === 'Färdig') {
        if (!updates.completed_at) {
          updates.completed_at = new Date().toISOString();
        }
        if (!updates.customer_notified_at) {
          updates.customer_notified_at = new Date().toISOString();
        }
      }

      if (updates.status === 'Avslutad') {
        if (!updates.picked_up_at) {
          updates.picked_up_at = new Date().toISOString();
        }
        if (!updates.closed_at) {
          updates.closed_at = new Date().toISOString();
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'customer_phone')) {
      updates.customer_phone = updates.customer_phone?.toString().trim() || null;
      updates.customer_phone_normalized = normalizePhone(updates.customer_phone || '');
      if (!allowedFields.has('customer_phone_normalized')) {
        allowedFields.add('customer_phone_normalized');
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'customer_email')) {
      updates.customer_email = updates.customer_email?.toString().trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'preferred_contact_channel')) {
      updates.preferred_contact_channel = normalizePreferredChannel(updates.preferred_contact_channel) || null;
    }

    const fields = Object.keys(updates).filter((key) => allowedFields.has(key));
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Inga giltiga fält att uppdatera.' });
    }

    const setFragments = fields.map((field, idx) => `${field} = $${idx + 1}`);
    const values = fields.map((field) => updates[field]);
    values.push(id);
    values.push(req.tenantId);

    const { rows } = await query(
      `
        UPDATE service_tickets
        SET ${setFragments.join(', ')}
        WHERE id = $${fields.length + 1} AND tenant_id = $${fields.length + 2}
        RETURNING *
      `,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('PATCH /api/tickets/:id error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera ärende.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/messages
// ---------------------------------------------------------------------------
router.get('/:id/messages', requireAuth, requireTenant, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ticket belongs to tenant
    const ticketCheck = await query(
      'SELECT id FROM service_tickets WHERE id = $1 AND tenant_id = $2',
      [id, req.tenantId]
    );
    if (!ticketCheck.rows[0]) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    const { rows } = await query(
      `SELECT m.id, m.ticket_id, m.channel, m.direction, m.sender_user, m.to_number, m.from_number, m.subject, m.body, m.raw_body, m.parse_method, m.parse_confidence, m.message_id, m.in_reply_to, m.references_header, m.reply_token, m.provider, m.provider_id, m.created_at,
              u.name AS sender_display_name
       FROM message_logs m
       LEFT JOIN users u ON u.email = m.sender_user AND u.tenant_id = m.tenant_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [id]
    );
    const settings = await getAdminMessageSettings(req.tenantId);
    const defaultChatLanguage = settings?.chat_default_language || 'sv';
    const enrichedRows = await Promise.all(
      rows.map(async (row) => {
        if (!row?.body || !defaultChatLanguage) return row;
        try {
          const translated = await translateText(row.body, defaultChatLanguage);
          if (
            translated &&
            normalizeComparableText(translated) !== normalizeComparableText(row.body)
          ) {
            return { ...row, chat_internal_translation: translated, chat_translation_language: defaultChatLanguage };
          }
        } catch (error) {
          console.warn('Chat internal translation failed:', error?.message || error);
        }
        return row;
      })
    );
    res.json(enrichedRows);
  } catch (error) {
    console.error('GET /api/tickets/:id/messages error:', error);
    res.status(500).json({ error: 'Kunde inte hämta kommunikationslogg.' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/messages  (send message to customer)
// ---------------------------------------------------------------------------
router.post('/:id/messages', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, body, message, text, channel: requestedChannel = 'auto' } = req.body || {};
    const sender = req.user?.email || 'okänd';

    const rawBodyInput = [body, message, text].find(
      (value) => value !== undefined && value !== null && value.toString().trim()
    );
    if (!rawBodyInput?.toString().trim()) {
      return res.status(400).json({ error: 'Meddelandetext saknas.' });
    }

    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }
    if (!ticket.customer_email && !ticket.customer_phone) {
      return res.status(400).json({ error: 'Kunden saknar kontaktuppgifter.' });
    }

    const baseSubject = subject?.toString().trim() || `Re: Ärende #${ticket.ticket_number}`;
    const baseBody = rawBodyInput.toString().trim();
    const language = getLanguage(ticket);

    const [translatedSubject, translatedBody] = await Promise.all([
      translateIfNeeded(baseSubject, language, { allowEnglish: true }),
      translateIfNeeded(baseBody, language, { allowEnglish: true }),
    ]);
    const resolvedSubject = translatedSubject?.toString().trim() || baseSubject;
    const resolvedBodyText = translatedBody?.toString().trim() || baseBody;
    if (!resolvedBodyText) {
      return res.status(400).json({ error: 'Meddelandetext saknas efter översättning.' });
    }

    // Resolve which channel(s) to use
    const preferred = resolvePreferredContactChannel(ticket);
    const effectiveChannel = requestedChannel === 'auto' ? preferred : requestedChannel;

    const delivery = { sms_sent: false, email_sent: false, warnings: [] };
    let insertedRow = null;

    // SMS send
    const shouldSms = effectiveChannel === 'sms' || (requestedChannel === 'auto' && preferred === 'sms');
    if (shouldSms && ticket.customer_phone) {
      try {
        const smsResponse = await sendSms({ to: ticket.customer_phone, message: resolvedBodyText });
        const smsInserted = await query(
          `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, ticket_id, channel, direction, sender_user, to_number, from_number, subject, body, provider, provider_id, created_at`,
          [req.tenantId, ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, resolvedBodyText, '46elks', smsResponse?.id || null]
        );
        delivery.sms_sent = true;
        insertedRow = smsInserted.rows[0];
      } catch (smsErr) {
        console.error('Manual SMS send failed:', smsErr);
        delivery.warnings.push('SMS kunde inte skickas.');
      }
    }

    // Email send (as primary or fallback)
    const shouldEmail = effectiveChannel === 'email' || (!delivery.sms_sent && ticket.customer_email);
    if (shouldEmail && ticket.customer_email) {
      try {
        const replyToken = generateReplyToken();
        const resolvedBody = appendReplyGuidance(resolvedBodyText, language, replyToken);
        const resolvedHtml = buildEmailHtml(resolvedBody);

        await sendEmail({
          to: ticket.customer_email,
          subject: resolvedSubject,
          body: resolvedBody,
          html: resolvedHtml,
        });

        const emailInserted = await query(
          `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, ticket_id, channel, direction, sender_user, to_number, from_number, subject, body, provider, provider_id, created_at`,
          [req.tenantId, ticket.id, 'email', 'outbound', sender, ticket.customer_email, resolvedSubject, resolvedBody, replyToken, 'smtp']
        );
        delivery.email_sent = true;
        if (!insertedRow) insertedRow = emailInserted.rows[0];
      } catch (emailErr) {
        console.error('Manual email send failed:', emailErr);
        delivery.warnings.push('E-post kunde inte skickas.');
      }
    }

    if (!delivery.sms_sent && !delivery.email_sent) {
      return res.status(500).json({ error: 'Kunde inte skicka meddelandet.', details: delivery.warnings.join(' ') });
    }

    const sentChannel = delivery.sms_sent && delivery.email_sent ? 'sms+email' : delivery.sms_sent ? 'sms' : 'email';
    await query(
      `UPDATE service_tickets
       SET last_staff_contact_at = NOW(),
           last_staff_contact_by = $2,
           last_staff_contact_channel = $3
       WHERE id = $1`,
      [ticket.id, sender, sentChannel]
    );

    res.status(201).json({ ...insertedRow, sms_sent: delivery.sms_sent, email_sent: delivery.email_sent, warnings: delivery.warnings });
  } catch (error) {
    console.error('POST /api/tickets/:id/messages error:', error);
    res.status(500).json({ error: 'Kunde inte skicka meddelandet.' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/messages/ai-suggest
// ---------------------------------------------------------------------------
router.post('/:id/messages/ai-suggest', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    if (!DEEPSEEK_API_KEY) {
      return res.status(400).json({ error: 'DEEPSEEK_API_KEY saknas.' });
    }

    const { id } = req.params;
    const { draft = '' } = req.body || {};
    const sender = req.user?.email || 'okänd';
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = getLanguage(ticket);
    const settings = await getAdminMessageSettings(req.tenantId);
    const aiSystemPrompt =
      settings.ai_reply_assistant_prompt || DEFAULT_MESSAGE_SETTINGS.ai_reply_assistant_prompt;
    const aiMessagePrompt =
      settings.ai_message_suggestion_prompt || DEFAULT_MESSAGE_SETTINGS.ai_message_suggestion_prompt;
    const { rows: recentRows } = await query(
      `SELECT direction, channel, sender_user, subject, body, created_at
       FROM message_logs
       WHERE ticket_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [id]
    );
    const recent = recentRows
      .reverse()
      .map((msg) => {
        const side = msg.direction === 'outbound' ? 'staff' : 'customer';
        return `${side} (${msg.channel}) ${msg.created_at}: ${msg.body || msg.subject || ''}`;
      })
      .join('\n');

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'system',
            content: `${aiSystemPrompt}\n\nRules:\n- Keep tone professional and concise.\n- Return ONLY the message body.\n- Write the final answer in language code: ${language}.`,
          },
          {
            role: 'user',
            content:
              `${aiMessagePrompt}\n\n` +
              `ticket_number: ${ticket.ticket_number}\n` +
              `customer_name: ${ticket.customer_name}\n` +
              `device_type: ${ticket.device_type}\n` +
              `device_model: ${ticket.device_model || ''}\n` +
              `status: ${ticket.status || ''}\n` +
              `diagnosis: ${ticket.diagnosis || ''}\n` +
              `work_done_summary: ${ticket.work_done_summary || ''}\n` +
              `final_cost: ${ticket.final_cost || ''}\n` +
              `last_staff_sender: ${sender}\n` +
              `staff_draft: ${draft || ''}\n` +
              `recent_messages:\n${recent || '(none)'}`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(500).json({ error: `AI-förslag misslyckades (${response.status})`, details });
    }
    const data = await response.json();
    const suggestionRaw = data?.choices?.[0]?.message?.content?.trim() || '';
    const suggestion = await translateIfNeeded(suggestionRaw, language, { allowEnglish: true });

    res.json({ ok: true, suggestion: suggestion || suggestionRaw, language });
  } catch (error) {
    console.error('POST /api/tickets/:id/messages/ai-suggest error:', error);
    res.status(500).json({ error: 'Kunde inte skapa AI-förslag.' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/actions/standardize
// ---------------------------------------------------------------------------
router.post('/:id/actions/standardize', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { planned_actions: plannedActions = '' } = req.body || {};
    const sourceText = String(plannedActions || '').trim();
    if (!sourceText) {
      return res.status(400).json({ error: 'planned_actions krävs.' });
    }

    const { rows } = await query('SELECT id FROM service_tickets WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    const { standardized, via } = await standardizeActionsText(sourceText);
    return res.json({ ok: true, standardized_actions: standardized, via });
  } catch (error) {
    console.error('POST /api/tickets/:id/actions/standardize error:', error);
    return res.status(500).json({ error: 'Kunde inte standardisera åtgärder.' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/actions/translate
// ---------------------------------------------------------------------------
router.post('/:id/actions/translate', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const { text = '', language = 'sv' } = req.body || {};
    const sourceText = String(text || '').trim();
    if (!sourceText) return res.status(400).json({ error: 'text krävs.' });

    const { rows } = await query('SELECT id FROM service_tickets WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!rows[0]) return res.status(404).json({ error: 'Ärende hittades inte.' });

    if (language === 'sv') {
      return res.json({ ok: true, translated_text: sourceText, language });
    }

    const translated = await translateIfNeeded(sourceText, language, { allowEnglish: true, strict: true });
    return res.json({ ok: true, translated_text: translated || sourceText, language });
  } catch (error) {
    console.error('POST /api/tickets/:id/actions/translate error:', error);
    return res.status(500).json({ error: 'Kunde inte oversatta texten.' });
  }
});

export default router;

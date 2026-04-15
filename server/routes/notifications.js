import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { getLanguage, resolvePreferredContactChannel } from '../services/phone.js';
import { translateIfNeeded } from '../services/translation.js';
import { generateReplyToken, stripReplySystemLines, buildEmailHtml, appendReplyGuidance } from '../services/email-parsing.js';
import { sendEmail } from '../services/email.js';
import { sendSms } from '../services/sms.js';
import { getAdminMessageSettings } from '../services/message-settings.js';
import {
  buildNotificationPreview,
  localizeTicketFreeText,
} from '../services/notifications.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /preview-notification
// ---------------------------------------------------------------------------
router.post('/preview-notification', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const {
      ticketId,
      templateType,
      language: requestedLanguage,
      diagnosis,
      work_done_summary,
      final_cost,
    } = req.body || {};

    if (!ticketId || !templateType) {
      return res.status(400).json({ error: 'ticketId och templateType krävs.' });
    }

    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [ticketId, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    const language = requestedLanguage || getLanguage(ticket);
    const messageSettings = await getAdminMessageSettings(req.tenantId);
    const previewTicket = {
      ...ticket,
      diagnosis: diagnosis ?? ticket.diagnosis,
      work_done_summary: work_done_summary ?? ticket.work_done_summary,
      final_cost: final_cost ?? ticket.final_cost,
    };

    const strictPreviewTranslation = language !== 'sv';
    const localizedPreviewTicket = await localizeTicketFreeText(previewTicket, language, {
      strict: strictPreviewTranslation,
    });

    const preview = await buildNotificationPreview({
      templateType,
      ticket: localizedPreviewTicket,
      language,
      settings: messageSettings,
    });

    return res.json({ ok: true, language, ...preview, body: preview.display_body || preview.body });
  } catch (error) {
    console.error('POST /api/preview-notification error:', error);
    return res.status(500).json({
      error: 'Kunde inte generera förhandsvisning.',
      details: error?.message || 'Okänt fel',
    });
  }
});

// ---------------------------------------------------------------------------
// Helper: send notification via preferred channel(s)
// ---------------------------------------------------------------------------
const sendNotification = async ({ ticket, channel, message, translatedSubject, translatedBody, html, replyToken, sender, tenantId }) => {
  const delivery = { sms_sent: false, email_sent: false, warnings: [] };

  const trySms = async () => {
    if (!ticket.customer_phone) return;
    try {
      const smsResponse = await sendSms({ to: ticket.customer_phone, message });
      await query(
        `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
      );
      delivery.sms_sent = true;
    } catch (error) {
      console.error('SMS send failed:', error);
      delivery.warnings.push('SMS kunde inte skickas.');
    }
  };

  const tryEmail = async () => {
    if (!ticket.customer_email) return;
    try {
      await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody, html });
      await query(
        `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId, ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
      );
      delivery.email_sent = true;
    } catch (error) {
      console.error('Email send failed:', error);
      delivery.warnings.push(delivery.sms_sent ? 'SMS skickades, men e-post kunde inte skickas.' : 'E-post kunde inte skickas.');
    }
  };

  if (channel === 'sms') {
    if (!ticket.customer_phone) return { error: 'Telefonnummer saknas.', status: 400 };
    await trySms();
    if (ticket.customer_email) await tryEmail();
    if (!delivery.sms_sent && !delivery.email_sent) {
      return { error: 'Kunde inte skicka.', details: delivery.warnings.join(' ') || 'Både SMS och e-post misslyckades.', status: 500 };
    }
  } else if (channel === 'auto') {
    if (!ticket.customer_phone && !ticket.customer_email) {
      return { error: 'Varken telefonnummer eller e-post finns registrerat.', status: 400 };
    }
    const preferred = resolvePreferredContactChannel(ticket);
    const trySmsFirst = preferred === 'sms' || (preferred !== 'email' && ticket.customer_phone && !ticket.customer_email);

    if (trySmsFirst && ticket.customer_phone) await trySms();
    if (!delivery.sms_sent && ticket.customer_email) await tryEmail();
    if (!trySmsFirst && !delivery.email_sent && ticket.customer_phone) await trySms();

    if (!delivery.sms_sent && !delivery.email_sent) {
      return { error: 'Kunde inte skicka.', details: delivery.warnings.join(' ') || 'Både SMS och e-post misslyckades.', status: 500 };
    }
  } else {
    // email channel
    if (!ticket.customer_email) return { error: 'E-post saknas.', status: 400 };
    await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody, html });
    await query(
      `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tenantId, ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
    );
    delivery.email_sent = true;
  }

  return delivery;
};

// ---------------------------------------------------------------------------
// POST /notify/cost-proposal
// ---------------------------------------------------------------------------
router.post('/notify/cost-proposal', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage, templateType: clientTemplateType, customSubject, customBody } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [ticketId, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    const replyToken = generateReplyToken();
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language, { strict: language !== 'sv' });
    const messageSettings = await getAdminMessageSettings(req.tenantId);
    const effectiveTemplateType = clientTemplateType === 'kostnadsforslag_uppdatering' ? 'kostnadsforslag_uppdatering' : 'kostnadsforslag';
    const preview = await buildNotificationPreview({
      templateType: effectiveTemplateType,
      ticket: localizedTicket,
      language,
      settings: messageSettings,
      replyToken,
    });
    const customBodyTrimmed = customBody?.trim();
    const finalSubject = customSubject?.trim() || preview.subject;
    const finalBody = customBodyTrimmed
      ? appendReplyGuidance(customBodyTrimmed, language, replyToken)
      : preview.body;
    const finalHtml = customBodyTrimmed ? buildEmailHtml(finalBody) : preview.html;
    const finalSms = customBodyTrimmed || preview.sms;
    const sender = req.user?.email || 'okänd';

    const result = await sendNotification({
      ticket,
      channel,
      message: finalSms,
      translatedSubject: finalSubject,
      translatedBody: finalBody,
      html: finalHtml,
      replyToken,
      sender,
      tenantId: req.tenantId,
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, details: result.details });
    }

    const sentChannels =
      result.sms_sent && result.email_sent ? 'sms+email' : result.sms_sent ? 'sms' : 'email';

    await query(
      `UPDATE service_tickets
       SET status = $1,
           customer_notified_at = NOW(),
           last_staff_contact_at = NOW(),
           last_staff_contact_by = $3,
           last_staff_contact_channel = $4
       WHERE id = $2`,
      ['Väntar på kund', ticket.id, sender, sentChannels]
    );

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('POST /api/notify/cost-proposal error:', error);
    res.status(500).json({ error: 'Kunde inte skicka.' });
  }
});

// ---------------------------------------------------------------------------
// POST /notify/repair-ready
// ---------------------------------------------------------------------------
router.post('/notify/repair-ready', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage, customSubject, customBody } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [ticketId, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    const replyToken = generateReplyToken();
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language, { strict: language !== 'sv' });
    const messageSettings = await getAdminMessageSettings(req.tenantId);
    const preview = await buildNotificationPreview({
      templateType: 'reparationFardig',
      ticket: localizedTicket,
      language,
      settings: messageSettings,
      replyToken,
    });
    const customBodyTrimmed = customBody?.trim();
    const finalSubject = customSubject?.trim() || preview.subject;
    const finalBody = customBodyTrimmed
      ? appendReplyGuidance(customBodyTrimmed, language, replyToken)
      : preview.body;
    const finalHtml = customBodyTrimmed ? buildEmailHtml(finalBody) : preview.html;
    const finalSms = customBodyTrimmed || preview.sms;
    const sender = req.user?.email || 'okänd';

    const result = await sendNotification({
      ticket,
      channel,
      message: finalSms,
      translatedSubject: finalSubject,
      translatedBody: finalBody,
      html: finalHtml,
      replyToken,
      sender,
      tenantId: req.tenantId,
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, details: result.details });
    }

    const sentChannels =
      result.sms_sent && result.email_sent ? 'sms+email' : result.sms_sent ? 'sms' : 'email';

    await query(
      `UPDATE service_tickets
       SET status = $1,
           completed_at = COALESCE(completed_at, NOW()),
           customer_notified_at = NOW(),
           last_staff_contact_at = NOW(),
           last_staff_contact_by = $3,
           last_staff_contact_channel = $4
       WHERE id = $2`,
      ['Färdig', ticket.id, sender, sentChannels]
    );

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('POST /api/notify/repair-ready error:', error);
    res.status(500).json({ error: 'Kunde inte skicka.' });
  }
});

// ---------------------------------------------------------------------------
// POST /notify/not-repairable
// ---------------------------------------------------------------------------
router.post('/notify/not-repairable', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage, customSubject, customBody } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [ticketId, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    const replyToken = generateReplyToken();
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language, { strict: language !== 'sv' });
    const messageSettings = await getAdminMessageSettings(req.tenantId);
    const preview = await buildNotificationPreview({
      templateType: 'ejReparerbar',
      ticket: localizedTicket,
      language,
      settings: messageSettings,
      replyToken,
    });
    const customBodyTrimmed = customBody?.trim();
    const finalSubject = customSubject?.trim() || preview.subject;
    const finalBody = customBodyTrimmed
      ? appendReplyGuidance(customBodyTrimmed, language, replyToken)
      : preview.body;
    const finalHtml = customBodyTrimmed ? buildEmailHtml(finalBody) : preview.html;
    const finalSms = customBodyTrimmed || preview.sms;
    const sender = req.user?.email || 'okänd';

    const result = await sendNotification({
      ticket,
      channel,
      message: finalSms,
      translatedSubject: finalSubject,
      translatedBody: finalBody,
      html: finalHtml,
      replyToken,
      sender,
      tenantId: req.tenantId,
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, details: result.details });
    }

    const sentChannels =
      result.sms_sent && result.email_sent ? 'sms+email' : result.sms_sent ? 'sms' : 'email';

    await query(
      `UPDATE service_tickets
       SET status = $1,
           not_repairable = TRUE,
           completed_at = COALESCE(completed_at, NOW()),
           customer_notified_at = NOW(),
           closed_at = NULL,
           last_staff_contact_at = NOW(),
           last_staff_contact_by = $3,
           last_staff_contact_channel = $4
       WHERE id = $2`,
      ['Färdig', ticket.id, sender, sentChannels]
    );

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('POST /api/notify/not-repairable error:', error);
    res.status(500).json({ error: 'Kunde inte skicka.' });
  }
});

// ---------------------------------------------------------------------------
// POST /notify/pickup-reminder
// Send a pickup reminder to the customer without changing ticket status.
// ---------------------------------------------------------------------------
router.post('/notify/pickup-reminder', requireAuth, requireRole('base'), requireTenant, async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage, customSubject, customBody } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1 AND tenant_id = $2', [ticketId, req.tenantId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    const replyToken = generateReplyToken();
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language, { strict: language !== 'sv' });
    const messageSettings = await getAdminMessageSettings(req.tenantId);
    const preview = await buildNotificationPreview({
      templateType: 'pickupReminder',
      ticket: localizedTicket,
      language,
      settings: messageSettings,
      replyToken,
    });
    const customBodyTrimmed = customBody?.trim();
    const finalSubject = customSubject?.trim() || preview.subject;
    const finalBody = customBodyTrimmed
      ? appendReplyGuidance(customBodyTrimmed, language, replyToken)
      : preview.body;
    const finalHtml = customBodyTrimmed ? buildEmailHtml(finalBody) : preview.html;
    const finalSms = customBodyTrimmed || preview.sms;
    const sender = req.user?.email || 'okänd';

    const result = await sendNotification({
      ticket,
      channel,
      message: finalSms,
      translatedSubject: finalSubject,
      translatedBody: finalBody,
      html: finalHtml,
      replyToken,
      sender,
      tenantId: req.tenantId,
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error, details: result.details });
    }

    const sentChannels =
      result.sms_sent && result.email_sent ? 'sms+email' : result.sms_sent ? 'sms' : 'email';

    // Do NOT change status - ticket remains "Färdig"
    await query(
      `UPDATE service_tickets
       SET last_staff_contact_at = NOW(),
           last_staff_contact_by = $2,
           last_staff_contact_channel = $3
       WHERE id = $1`,
      [ticket.id, sender, sentChannels]
    );

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('POST /api/notify/pickup-reminder error:', error);
    res.status(500).json({ error: 'Kunde inte skicka påminnelse.' });
  }
});

export default router;

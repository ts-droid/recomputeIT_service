import { Router } from 'express';
import { Webhook as SvixWebhook } from 'svix';
import { query, getClient } from '../db.js';
import { timingSafeEqual } from '../middleware/auth.js';
import { getDefaultTenant } from '../middleware/tenant.js';
import {
  RESEND_WEBHOOK_SECRET,
  ELKS_WEBHOOK_SECRET,
  EMAIL_WEBHOOK_SECRET,
  RESEND_API_KEY,
} from '../lib/constants.js';
import { normalizePhone, getLanguage } from '../services/phone.js';
import {
  parseInboundEmailPayload,
  extractTopReply,
  cleanVisibleReplyText,
  extractTopReplyText,
  parseApprovalDecision,
  extractReplySnippetFromRawWebhook,
  extractTicketNumber,
  extractInboundText,
  loadResendReceivedEmail,
  getInboundSmsProviderId,
  isDuplicateInboundSms,
} from '../services/email-parsing.js';
import { maybeAppendSwedishTranslation } from '../services/translation.js';
import {
  standardizeActionsText,
  sendDecisionAcknowledgement,
  sendDecisionClarification,
} from '../services/notifications.js';

const resendWebhookVerifier = RESEND_WEBHOOK_SECRET ? new SvixWebhook(RESEND_WEBHOOK_SECRET) : null;

const router = Router();

// ---------------------------------------------------------------------------
// Auto-decision gating
// ---------------------------------------------------------------------------
// We only run YES/NO approval parsing — and the resulting auto-replies
// ("Tack för ditt godkännande" / "Bekräfta svar för ärende") — when the
// ticket is actively waiting for a cost-proposal decision. Otherwise an
// unrelated reply (e.g. customer saying "ja, jag hämtar imorgon" after we've
// said the device can't be repaired) gets misclassified and triggers a
// nonsensical auto-reply chain.
const isAwaitingCostDecision = (ticket) => {
  if (!ticket) return false;
  if (ticket.not_repairable) return false;
  if (ticket.status === 'Avslutad' || ticket.status === 'Färdig') return false;
  if (ticket.status === 'Kostnadsförslag godkänt' || ticket.status === 'Kostnadsförslag nekat') return false;
  return ticket.status === 'Väntar på kund';
};

// ---------------------------------------------------------------------------
// POST /email-inbound
// ---------------------------------------------------------------------------
router.post('/email-inbound', async (req, res) => {
  try {
    let parsedPayload = req.body || {};
    const hasSvixHeaders =
      Boolean(req.headers['svix-id']) &&
      Boolean(req.headers['svix-timestamp']) &&
      Boolean(req.headers['svix-signature']);

    if (hasSvixHeaders && RESEND_WEBHOOK_SECRET) {
      if (!resendWebhookVerifier) {
        return res.status(500).json({ error: 'Resend webhook verifier not initialized' });
      }
      try {
        parsedPayload = resendWebhookVerifier.verify(
          req.rawBody || JSON.stringify(req.body || {}),
          {
            'svix-id': req.headers['svix-id'],
            'svix-timestamp': req.headers['svix-timestamp'],
            'svix-signature': req.headers['svix-signature'],
          }
        );
      } catch (error) {
        console.error('Invalid Resend webhook signature:', error);
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
      if (parsedPayload?.type !== 'email.received') {
        return res.json({ ok: true, ignored: true });
      }
    } else if (EMAIL_WEBHOOK_SECRET) {
      const providedSecret =
        req.headers['x-webhook-secret'] ||
        req.headers['x-inbound-secret'] ||
        req.query.secret ||
        '';
      if (!providedSecret || !timingSafeEqual(providedSecret, EMAIL_WEBHOOK_SECRET)) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const inbound = parseInboundEmailPayload(parsedPayload);
    if (inbound.provider === 'resend' && !inbound.text && inbound.emailId) {
      for (let attempt = 1; attempt <= 3 && !inbound.text; attempt += 1) {
        try {
          const received = await loadResendReceivedEmail(inbound.emailId);
          inbound.text = extractInboundText(received) || inbound.text;
          if (!inbound.text && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          }
        } catch (error) {
          if (attempt === 3) {
            console.error('Resend receiving fetch failed:', error);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          }
        }
      }
      if (!inbound.text) {
        console.warn('Inbound email has empty extracted body after fetch attempts', {
          emailId: inbound.emailId,
          subject: inbound.subject || null,
          from: inbound.from || null,
        });
      }
    }

    if (!inbound.from || (!inbound.subject && !inbound.text)) {
      return res.status(400).json({ error: 'Invalid inbound email payload' });
    }

    // Dedup check
    if (inbound.messageId) {
      const existing = await query(
        `SELECT id FROM message_logs WHERE channel = 'email' AND direction = 'inbound' AND message_id = $1 LIMIT 1`,
        [inbound.messageId]
      );
      if (existing.rowCount > 0) {
        return res.json({ ok: true, duplicate: true });
      }
    }

    const ticketNumber = extractTicketNumber(inbound.subject, inbound.text);
    let ticket = null;

    if (ticketNumber) {
      const byTicket = await query(
        `SELECT * FROM service_tickets WHERE ticket_number = $1 ORDER BY created_at DESC LIMIT 1`,
        [ticketNumber]
      );
      ticket = byTicket.rows[0] || null;
    }

    if (!ticket) {
      const byEmail = await query(
        `SELECT * FROM service_tickets
         WHERE LOWER(customer_email) = LOWER($1)
         ORDER BY created_at DESC
         LIMIT 1`,
        [inbound.from]
      );
      ticket = byEmail.rows[0] || null;
    }

    // Resolve tenant_id from ticket or fall back to default
    let tenantId = ticket?.tenant_id || null;
    if (!tenantId) {
      const defaultTenant = await getDefaultTenant();
      tenantId = defaultTenant?.id || null;
    }

    const rawInboundText = inbound.text && typeof inbound.text === 'string' ? inbound.text : '';
    const extractedReply = extractTopReply(rawInboundText || inbound.subject || '');
    const cleanedReplyText = cleanVisibleReplyText(extractedReply.text || '');
    const inboundReplyText = cleanedReplyText || extractedReply.text || (inbound.subject || '');

    if (!ticket) {
      await query(
        `INSERT INTO message_logs (tenant_id, channel, direction, from_number, to_number, subject, body, raw_body, parse_method, parse_confidence, message_id, in_reply_to, references_header, reply_token, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          tenantId, 'email', 'inbound', inbound.from, inbound.to || null, inbound.subject || null,
          inboundReplyText || null, rawInboundText || null, extractedReply.method,
          extractedReply.confidence, inbound.messageId || null, inbound.inReplyTo || null,
          inbound.referencesHeader || null, extractedReply.replyToken || null, inbound.provider,
        ]
      );
      return res.json({ ok: true, matched: false });
    }

    await query(
      `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, from_number, to_number, subject, body, raw_body, parse_method, parse_confidence, message_id, in_reply_to, references_header, reply_token, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        tenantId, ticket.id, 'email', 'inbound', inbound.from, inbound.to || null,
        inbound.subject || null, inboundReplyText || null, rawInboundText || null,
        extractedReply.method, extractedReply.confidence, inbound.messageId || null,
        inbound.inReplyTo || null, inbound.referencesHeader || null,
        extractedReply.replyToken || null, inbound.provider,
      ]
    );

    // Skip approval parsing entirely when the ticket isn't waiting for a
    // cost-proposal decision. Just record that the customer wrote something
    // so staff can see it, and return without sending any auto-reply.
    if (!isAwaitingCostDecision(ticket)) {
      await query(
        `UPDATE service_tickets
         SET has_new_customer_message = TRUE,
             last_customer_response_text = $2,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, inboundReplyText]
      );
      return res.json({ ok: true, matched: true, ticket_number: ticket.ticket_number, decision: null, skipped: 'not_awaiting_decision' });
    }

    let decision = await parseApprovalDecision(inboundReplyText);
    if (!decision && !inbound.text && req.rawBody) {
      const fallbackSnippet = extractReplySnippetFromRawWebhook(req.rawBody);
      if (fallbackSnippet) {
        decision = await parseApprovalDecision(extractTopReplyText(fallbackSnippet));
      }
    }

    if (decision === 'yes') {
      const autoWorkDone = ticket.work_done_summary?.trim()
        ? ticket.work_done_summary.trim()
        : (await standardizeActionsText(ticket.planned_actions || ticket.diagnosis || '')).standardized;
      await query(
        `UPDATE service_tickets
         SET cost_proposal_approved = true,
             status = $1,
             work_done_summary = CASE WHEN COALESCE(NULLIF(work_done_summary, ''), '') <> '' THEN work_done_summary ELSE $4 END,
             final_cost = CASE WHEN COALESCE(NULLIF(final_cost, ''), '') <> '' THEN final_cost ELSE diagnosis_fee END,
             last_customer_decision = 'approved',
             last_customer_response_text = $3,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag godkänt', ticket.id, inboundReplyText, autoWorkDone]
      );
      try {
        await sendDecisionAcknowledgement({ ticket, decision: 'yes', channel: 'email', emailTo: inbound.from });
      } catch (error) {
        console.error('Email acknowledgement send failed (yes):', error);
      }
    } else if (decision === 'no') {
      await query(
        `UPDATE service_tickets
         SET cost_proposal_approved = false,
             status = $1,
             last_customer_decision = 'declined',
             last_customer_response_text = $3,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag nekat', ticket.id, inboundReplyText]
      );
      try {
        await sendDecisionAcknowledgement({ ticket, decision: 'no', channel: 'email', emailTo: inbound.from });
      } catch (error) {
        console.error('Email acknowledgement send failed (no):', error);
      }
    } else {
      await query(
        `UPDATE service_tickets
         SET last_customer_decision = 'pending',
             last_customer_response_text = $2,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, inboundReplyText]
      );
      try {
        await sendDecisionClarification({ ticket, channel: 'email', emailTo: inbound.from });
      } catch (error) {
        console.error('Email clarification send failed (unknown):', error);
      }
    }

    return res.json({ ok: true, matched: true, ticket_number: ticket.ticket_number, decision });
  } catch (error) {
    console.error('Email inbound webhook error:', error);
    return res.status(500).json({ error: 'Webhook error' });
  }
});

// ---------------------------------------------------------------------------
// POST /46elks
// ---------------------------------------------------------------------------
router.post('/46elks', async (req, res) => {
  let client;
  try {
    const elksSecret = req.headers['x-webhook-secret'] || req.query.secret || '';
    if (ELKS_WEBHOOK_SECRET && (!elksSecret || !timingSafeEqual(elksSecret, ELKS_WEBHOOK_SECRET))) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const from = req.body.from || req.body.sender;
    const message = (req.body.message || req.body.text || '').trim();
    const providerId = getInboundSmsProviderId(req.body || {});

    if (!from || !message) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    client = await getClient();
    await client.query('BEGIN');

    const normalized = normalizePhone(from);
    const { rows } = await client.query(
      `SELECT * FROM service_tickets WHERE customer_phone_normalized = $1 ORDER BY created_at DESC LIMIT 1`,
      [normalized]
    );

    const ticket = rows[0];

    // Resolve tenant_id from ticket or fall back to default
    let tenantId = ticket?.tenant_id || null;
    if (!tenantId) {
      const defaultTenant = await getDefaultTenant();
      tenantId = defaultTenant?.id || null;
    }

    const messageWithSwedish = await maybeAppendSwedishTranslation(ticket, message);
    const dedupeKey = providerId || `${ticket?.id || 'unknown'}:${normalized}:${message}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [dedupeKey]);

    const duplicateInbound = await isDuplicateInboundSms(
      { ticketId: ticket?.id || null, from, body: message, providerId },
      client.query.bind(client)
    );

    if (duplicateInbound) {
      await client.query('COMMIT');
      return res.json({ ok: true, duplicate: true });
    }

    if (!ticket) {
      await client.query(
        `INSERT INTO message_logs (tenant_id, channel, direction, from_number, body, provider, provider_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, 'sms', 'inbound', from, messageWithSwedish, '46elks', providerId]
      );
      await client.query('COMMIT');
      return res.json({ ok: true });
    }

    await client.query(
      `INSERT INTO message_logs (tenant_id, ticket_id, channel, direction, from_number, body, provider, provider_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, ticket.id, 'sms', 'inbound', from, messageWithSwedish, '46elks', providerId]
    );

    // Skip approval parsing when ticket isn't actively waiting for a
    // cost-proposal decision. Record the message and return without
    // triggering "Tack för ditt godkännande" or clarification auto-replies.
    if (!isAwaitingCostDecision(ticket)) {
      await client.query(
        `UPDATE service_tickets
         SET has_new_customer_message = TRUE,
             last_customer_response_text = $2,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, message]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, decision: null, skipped: 'not_awaiting_decision' });
    }

    const decision = await parseApprovalDecision(message);
    console.log('46elks inbound decision parsed', { ticketId: ticket.id, rawMessage: message, decision, providerId });

    if (decision === 'yes') {
      const autoWorkDone = ticket.work_done_summary?.trim()
        ? ticket.work_done_summary.trim()
        : (await standardizeActionsText(ticket.planned_actions || ticket.diagnosis || '')).standardized;
      await client.query(
        `UPDATE service_tickets
         SET cost_proposal_approved = true,
             status = $1,
             has_new_customer_message = TRUE,
             work_done_summary = CASE WHEN COALESCE(NULLIF(work_done_summary, ''), '') <> '' THEN work_done_summary ELSE $4 END,
             final_cost = CASE WHEN COALESCE(NULLIF(final_cost, ''), '') <> '' THEN final_cost ELSE diagnosis_fee END,
             last_customer_decision = 'approved',
             last_customer_response_text = $3,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag godkänt', ticket.id, message, autoWorkDone]
      );
    } else if (decision === 'no') {
      await client.query(
        `UPDATE service_tickets
         SET cost_proposal_approved = false,
             status = $1,
             has_new_customer_message = TRUE,
             last_customer_decision = 'declined',
             last_customer_response_text = $3,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag nekat', ticket.id, message]
      );
    } else {
      await client.query(
        `UPDATE service_tickets
         SET has_new_customer_message = TRUE,
             last_customer_decision = 'pending',
             last_customer_response_text = $2,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, message]
      );
    }

    await client.query('COMMIT');

    if (decision === 'yes') {
      try {
        await sendDecisionAcknowledgement({ ticket, decision: 'yes', channel: 'sms', smsTo: from });
      } catch (error) {
        console.error('SMS acknowledgement send failed (yes):', error);
      }
    } else if (decision === 'no') {
      try {
        await sendDecisionAcknowledgement({ ticket, decision: 'no', channel: 'sms', smsTo: from });
      } catch (error) {
        console.error('SMS acknowledgement send failed (no):', error);
      }
    } else {
      try {
        await sendDecisionClarification({ ticket, channel: 'sms', smsTo: from });
      } catch (error) {
        console.error('SMS clarification send failed (unknown):', error);
      }
    }

    return res.json({ ok: true, decision });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('46elks rollback failed:', rollbackError);
      }
    }
    console.error('46elks webhook error:', error);
    return res.status(500).json({ error: 'Webhook error' });
  } finally {
    client?.release();
  }
});

export default router;

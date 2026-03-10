import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './init.js';
import { query } from './db.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { Webhook as SvixWebhook } from 'svix';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
app.use((req, _res, next) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // Keep original body and let route-level validation handle it.
    }
  }
  if (!req.rawBody && typeof req.body === 'string') {
    req.rawBody = req.body;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const API_KEY = process.env.API_KEY || '';
const ELKS_API_USERNAME = process.env.ELKS_API_USERNAME || '';
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD || '';
const ELKS_SMS_FROM = process.env.ELKS_SMS_FROM || '';
const ELKS_WEBHOOK_SECRET = process.env.ELKS_WEBHOOK_SECRET || '';
const SMS_DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || '+46';
const EMAIL_WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || '';
const EMAIL_INBOUND_PROVIDER = (process.env.EMAIL_INBOUND_PROVIDER || 'auto').toLowerCase();
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || '';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || '';
const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const resendWebhookVerifier = RESEND_WEBHOOK_SECRET ? new SvixWebhook(RESEND_WEBHOOK_SECRET) : null;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const ROLE_RANK = {
  base: 1,
  service: 2,
  admin: 3,
};

const canAccess = (role, minimumRole) =>
  ROLE_RANK[role] >= ROLE_RANK[minimumRole];

const timingSafeEqual = (a, b) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const requireAuth = async (req, res, next) => {
  if (!API_KEY) {
    // If API_KEY not set, fall back to user tokens only.
  }

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
      'SELECT id, email, role, name FROM users WHERE api_token = $1',
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

const requireRole = (role) => (req, res, next) => {
  if (!req.user || !canAccess(req.user.role, role)) {
    return res.status(403).json({ error: 'Otillräcklig behörighet.' });
  }
  return next();
};

const normalizePhone = (phone) => {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.replace(/[^\d]/g, '')}`;
  }
  return trimmed.replace(/[^\d]/g, '');
};

const toSmsNumber = (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  if (normalized.startsWith('+')) return normalized;
  if (normalized.startsWith('00')) return `+${normalized.slice(2)}`;
  if (normalized.startsWith('0')) return `${SMS_DEFAULT_COUNTRY_CODE}${normalized.slice(1)}`;
  if (/^\d+$/.test(normalized)) return `+${normalized}`;
  return normalized;
};

const getLanguage = (ticket) => ticket?.disclaimer_language || 'sv';

const parseApprovalDecision = (rawMessage = '') => {
  const normalized = rawMessage
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  const yesPatterns = [
    /\bja\b/,
    /\byes\b/,
    /\byep\b/,
    /\bok\b/,
    /\bokej\b/,
    /\bgodkann\w*\b/,
    /\bapprove\w*\b/,
    /\baccept\w*\b/,
    /\bgo ahead\b/,
    /\bkor\b/,
  ];
  const noPatterns = [
    /\bnej\b/,
    /\bno\b/,
    /\bnope\b/,
    /\bavboj\w*\b/,
    /\bdeclin\w*\b/,
    /\breject\w*\b/,
    /\bcancel\w*\b/,
    /\bstop\b/,
  ];

  const findFirstIndex = (patterns) => {
    let earliest = -1;
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match || match.index === undefined) continue;
      if (earliest === -1 || match.index < earliest) earliest = match.index;
    }
    return earliest;
  };

  const yesIndex = findFirstIndex(yesPatterns);
  const noIndex = findFirstIndex(noPatterns);

  if (yesIndex !== -1 && (noIndex === -1 || yesIndex < noIndex)) return 'yes';
  if (noIndex !== -1 && (yesIndex === -1 || noIndex < yesIndex)) return 'no';
  return null;
};

const readPath = (obj, path) =>
  path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const firstString = (obj, paths) => {
  for (const path of paths) {
    const value = readPath(obj, path);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const extractEmailAddress = (raw = '') => {
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const candidate = match ? match[1] : raw;
  return candidate.trim().toLowerCase();
};

const inferInboundProvider = (body) => {
  if (EMAIL_INBOUND_PROVIDER !== 'auto') return EMAIL_INBOUND_PROVIDER;
  if (body?.type?.toString().toLowerCase().includes('email') || body?.data?.from) return 'resend';
  if (body?.message?.payload || body?.gmail || body?.historyId) return 'gmail';
  return 'unknown';
};

const parseInboundEmailPayload = (body) => {
  const provider = inferInboundProvider(body);
  const fromRaw = firstString(body, [
    'data.from',
    'from',
    'sender',
    'message.from',
    'gmail.from',
  ]);
  const subject = firstString(body, [
    'data.subject',
    'subject',
    'message.subject',
    'gmail.subject',
  ]);
  const text = firstString(body, [
    'data.text',
    'text',
    'body',
    'message.text',
    'gmail.text',
    'plain',
  ]);
  const to = firstString(body, [
    'data.to',
    'to',
    'message.to',
    'gmail.to',
  ]);

  return {
    provider,
    from: extractEmailAddress(fromRaw),
    to,
    subject,
    text,
    emailId: firstString(body, ['data.email_id', 'email_id']),
  };
};

const extractTicketNumber = (subject = '', text = '') => {
  const content = `${subject}\n${text}`;
  const patterns = [
    /(?:ärende|arende|case)\s*#?\s*(\d{4,})/i,
    /#\s*(\d{4,})/,
    /\b(\d{4,})\b/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
};

const sendDecisionAcknowledgement = async ({ ticket, decision, channel, smsTo, emailTo }) => {
  const lang = getLanguage(ticket);
  const langKey = decisionAckTemplates[decision]?.sms?.[lang] ? lang : 'sv';

  if (channel === 'sms' && smsTo) {
    const smsBody = decisionAckTemplates[decision]?.sms?.[langKey];
    if (smsBody) {
      await sendSms({ to: smsTo, message: smsBody });
      await query(
        `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ticket.id, 'sms', 'outbound', smsTo, smsBody, '46elks']
      );
    }
    return;
  }

  if (channel === 'email' && emailTo) {
    const emailTemplate = decisionAckTemplates[decision]?.email?.[langKey];
    if (emailTemplate) {
      await sendEmail({
        to: emailTo,
        subject: emailTemplate.subject,
        body: emailTemplate.body,
      });
      await query(
        `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ticket.id, 'email', 'outbound', emailTo, emailTemplate.subject, emailTemplate.body, 'smtp']
      );
    }
  }
};

const loadResendReceivedEmail = async (emailId) => {
  if (!resendClient || !emailId) return null;
  if (resendClient?.emails?.receiving?.get) {
    const receivingResult = await resendClient.emails.receiving.get(emailId);
    if (receivingResult?.error) {
      throw new Error(`Resend receiving get failed: ${receivingResult.error.message || 'unknown error'}`);
    }
    return receivingResult?.data || null;
  }

  if (resendClient?.emails?.get) {
    const getResult = await resendClient.emails.get(emailId);
    if (getResult?.error) {
      throw new Error(`Resend emails.get failed: ${getResult.error.message || 'unknown error'}`);
    }
    return getResult?.data || null;
  }

  throw new Error('No supported Resend email retrieval method found in current SDK version');
};

const textTemplates = {
  costProposal: {
    sv: (ticket, amount) =>
      `Hej ${ticket.customer_name}!\nÄrende #${ticket.ticket_number} (${ticket.device_type}${ticket.device_model ? ` ${ticket.device_model}` : ''}).\nDiagnos: ${ticket.diagnosis || 'Se bifogad information från butik.'}\nKostnadsförslag: ${amount} kr.\nSvara JA för godkännande eller NEJ för att avböja.`,
    en: (ticket, amount) =>
      `Hi ${ticket.customer_name}!\nCase #${ticket.ticket_number} (${ticket.device_type}${ticket.device_model ? ` ${ticket.device_model}` : ''}).\nDiagnosis: ${ticket.diagnosis || 'See detailed info from the service desk.'}\nCost proposal: ${amount} SEK.\nReply YES to approve or NO to decline.`,
  },
  repairReady: {
    sv: (ticket) =>
      `Hej ${ticket.customer_name}!\nDin enhet för ärende #${ticket.ticket_number} är klar för upphämtning.\n${ticket.final_cost ? `Slutlig kostnad: ${ticket.final_cost} kr.\n` : ''}${ticket.work_done_summary ? `Utförda åtgärder: ${ticket.work_done_summary}\n` : ''}Välkommen in!`,
    en: (ticket) =>
      `Hi ${ticket.customer_name}!\nYour device for case #${ticket.ticket_number} is ready for pickup.\n${ticket.final_cost ? `Final cost: ${ticket.final_cost} SEK.\n` : ''}${ticket.work_done_summary ? `Work done: ${ticket.work_done_summary}\n` : ''}Welcome in!`,
  },
};

const emailTemplates = {
  costProposal: {
    sv: (ticket, amount) => ({
      subject: `Kostnadsförslag för ärende #${ticket.ticket_number}`,
      body: `Hej ${ticket.customer_name},\n\nVi har tagit fram ett kostnadsförslag för ditt ärende (#${ticket.ticket_number}).\nKostnad: ${amount} kr.\n\nSvara gärna på detta mail eller via SMS med JA för godkännande, eller NEJ om du vill avböja.\n\nVänliga hälsningar\nre:Compute-IT`,
    }),
    en: (ticket, amount) => ({
      subject: `Cost proposal for case #${ticket.ticket_number}`,
      body: `Hi ${ticket.customer_name},\n\nWe have prepared a cost proposal for your case (#${ticket.ticket_number}).\nCost: ${amount} SEK.\n\nPlease reply with YES to approve, or NO to decline.\n\nBest regards\nre:Compute-IT`,
    }),
  },
  repairReady: {
    sv: (ticket) => ({
      subject: `Din enhet är klar (#${ticket.ticket_number})`,
      body: `Hej ${ticket.customer_name},\n\nDin enhet är klar för upphämtning. Välkommen in!\n\nVänliga hälsningar\nre:Compute-IT`,
    }),
    en: (ticket) => ({
      subject: `Your device is ready (#${ticket.ticket_number})`,
      body: `Hi ${ticket.customer_name},\n\nYour device is ready for pickup. Welcome in!\n\nBest regards\nre:Compute-IT`,
    }),
  },
};

const decisionAckTemplates = {
  yes: {
    sms: {
      sv: 'Tack för förtroendet. Vi återkommer så snart reparationen är klar.',
      en: 'Thanks for your approval. We will contact you as soon as the repair is complete.',
    },
    email: {
      sv: {
        subject: 'Tack för ditt godkännande',
        body: 'Tack för förtroendet. Vi återkommer så snart reparationen är klar.',
      },
      en: {
        subject: 'Thank you for your approval',
        body: 'Thanks for your approval. We will contact you as soon as the repair is complete.',
      },
    },
  },
  no: {
    sms: {
      sv: 'Tråkigt att höra. Har du frågor, kontakta oss på kontakt@recompute.it eller 016-5416700. Vi förbehåller oss rätten att kassera din inlämnade produkt om den inte upphämtas inom 7 dagar från nekat kostnadsförslag.',
      en: 'Sorry to hear that. Questions? Contact us at kontakt@recompute.it or 016-5416700. We reserve the right to discard uncollected products 7 days after a declined quote.',
    },
    email: {
      sv: {
        subject: 'Information om nekat kostnadsförslag',
        body: 'Tråkigt att höra.\n\nHar du frågor kan du kontakta oss på kontakt@recompute.it eller 016-5416700.\n\nVi förbehåller oss rätten att kassera din inlämnade produkt om den inte upphämtas inom 7 dagar från nekat kostnadsförslag.',
      },
      en: {
        subject: 'Information about declined quote',
        body: 'Sorry to hear that.\n\nIf you have questions, contact us at kontakt@recompute.it or 016-5416700.\n\nWe reserve the right to discard uncollected products 7 days after a declined quote.',
      },
    },
  },
};

const translateIfNeeded = async (text, language, options = {}) => {
  const { allowEnglish = false } = options;
  if (!DEEPSEEK_API_KEY) return text;
  if (!language || language === 'sv') return text;
  if (language === 'en' && !allowEnglish) return text;

  try {
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
            content:
              'Translate the text into the requested language. Keep numbers, names, and case numbers unchanged. Return only the translated text.',
          },
          {
            role: 'user',
            content: `Language: ${language}\nText: ${text}`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek error: ${response.status}`);
    }

    const data = await response.json();
    const translated = data?.choices?.[0]?.message?.content?.trim();
    if (!translated) return text;

    // Guard against model wrappers like "Language: sv Text: ..."
    const cleaned = translated.replace(/^Language:\s*[a-z-]+\s*Text:\s*/i, '').trim();
    return cleaned || text;
  } catch (error) {
    console.error('DeepSeek translation failed:', error);
    return text;
  }
};

const localizeTicketFreeText = async (ticket, language) => {
  if (!ticket || !language || language === 'sv') return ticket;

  const [diagnosisLocalized, workDoneLocalized] = await Promise.all([
    translateIfNeeded(ticket.diagnosis || '', language, { allowEnglish: true }),
    translateIfNeeded(ticket.work_done_summary || '', language, { allowEnglish: true }),
  ]);

  return {
    ...ticket,
    diagnosis: diagnosisLocalized || ticket.diagnosis,
    work_done_summary: workDoneLocalized || ticket.work_done_summary,
  };
};

const buildNotificationPreview = async ({ templateType, ticket, language }) => {
  const localizedTicket = await localizeTicketFreeText(ticket, language);

  if (templateType === 'kostnadsforslag') {
    const amount = ticket.final_cost || '—';
    const messageBase =
      textTemplates.costProposal[language]?.(localizedTicket, amount) ||
      textTemplates.costProposal.sv(localizedTicket, amount);
    const sms = await translateIfNeeded(messageBase, language);
    const template =
      emailTemplates.costProposal[language]?.(localizedTicket, amount) ||
      emailTemplates.costProposal.sv(localizedTicket, amount);
    const subject = await translateIfNeeded(template.subject, language);
    const body = await translateIfNeeded(template.body, language);
    return { subject, body, sms };
  }

  const messageBase =
    textTemplates.repairReady[language]?.(localizedTicket) ||
    textTemplates.repairReady.sv(localizedTicket);
  const sms = await translateIfNeeded(messageBase, language);
  const template =
    emailTemplates.repairReady[language]?.(localizedTicket) ||
    emailTemplates.repairReady.sv(localizedTicket);
  const subject = await translateIfNeeded(template.subject, language);
  const body = await translateIfNeeded(template.body, language);
  return { subject, body, sms };
};

const sendSms = async ({ to, message }) => {
  if (!ELKS_API_USERNAME || !ELKS_API_PASSWORD) {
    throw new Error('SMS credentials missing');
  }

  const smsTo = toSmsNumber(to);
  if (!/^\+\d{6,15}$/.test(smsTo)) {
    throw new Error(`Invalid phone number format for SMS: ${to}`);
  }

  const params = new URLSearchParams({
    from: ELKS_SMS_FROM,
    to: smsTo,
    message,
  });

  const response = await fetch('https://api.46elks.com/a1/SMS', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${ELKS_API_USERNAME}:${ELKS_API_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SMS send error: ${errorText}`);
  }

  return response.json();
};

const mailer = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    })
  : null;

const sendEmail = async ({ to, subject, body }) => {
  let smtpError = null;

  if (mailer) {
    try {
      const result = await mailer.sendMail({
        from: SMTP_FROM || SMTP_USER,
        replyTo: EMAIL_REPLY_TO || undefined,
        to,
        subject,
        text: body,
      });

      return result;
    } catch (error) {
      const smtpTarget = `${SMTP_HOST}:${SMTP_PORT}`;
      const reason = error?.message || 'Unknown SMTP error';
      const code = error?.code ? ` (${error.code})` : '';
      smtpError = `SMTP ${smtpTarget} failed${code}: ${reason}`;
    }
  }

  if (RESEND_API_KEY && RESEND_FROM) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        from: RESEND_FROM,
        reply_to: EMAIL_REPLY_TO || undefined,
        to: Array.isArray(to) ? to : [to],
        subject,
        text: body,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend HTTP ${response.status}: ${errorText}`);
      }

      return;
    } catch (error) {
      const reason = error?.message || 'Unknown Resend error';
      if (smtpError) {
        throw new Error(`${smtpError} | Resend API failed: ${reason}`);
      }
      throw new Error(`Resend API failed: ${reason}`);
    }
  }

  if (smtpError) {
    throw new Error(smtpError);
  }

  throw new Error('Email is not configured');
};

app.get('/api/tickets', requireAuth, async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM service_tickets ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/tickets error:', error);
    res.status(500).json({ error: 'Kunde inte hämta ärenden.' });
  }
});

app.post('/api/tickets', requireAuth, async (req, res) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      device_type,
      device_model,
      issue_description,
      additional_notes,
      disclaimer_language,
      status,
      user_id,
    } = req.body || {};

    const missingFields = [];
    if (!customer_name?.toString().trim()) missingFields.push('customer_name');
    if (!customer_phone?.toString().trim()) missingFields.push('customer_phone');
    if (!device_type?.toString().trim()) missingFields.push('device_type');
    if (!issue_description?.toString().trim()) missingFields.push('issue_description');

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

    const normalizedPhone = normalizePhone(customer_phone);
    const { rows } = await query(
      `
        INSERT INTO service_tickets (
          customer_name,
          customer_email,
          customer_phone,
          customer_phone_normalized,
          device_type,
          device_model,
          issue_description,
          additional_notes,
          disclaimer_language,
          status,
          user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `,
      [
        customer_name,
        customer_email || null,
        customer_phone,
        normalizedPhone || null,
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

app.patch('/api/tickets/:id', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const allowedFields = new Set([
      'status',
      'cost_proposal_approved',
      'internal_notes',
      'work_done_summary',
      'final_cost',
      'diagnosis',
      'is_hidden',
      'disclaimer_language',
      'additional_notes',
      'device_model',
      'completed_at',
      'customer_notified_at',
      'picked_up_at',
      'closed_at',
    ]);

    const fields = Object.keys(updates).filter((key) => allowedFields.has(key));
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Inga giltiga fält att uppdatera.' });
    }

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

    const setFragments = fields.map((field, idx) => `${field} = $${idx + 1}`);
    const values = fields.map((field) => updates[field]);
    values.push(id);

    const { rows } = await query(
      `
        UPDATE service_tickets
        SET ${setFragments.join(', ')}
        WHERE id = $${fields.length + 1}
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-post och lösenord krävs.' });
    }

    const { rows } = await query(
      'SELECT id, email, password_hash, role, name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Felaktiga uppgifter.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Felaktiga uppgifter.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await query('UPDATE users SET api_token = $1, last_login_at = NOW() WHERE id = $2', [
      token,
      user.id,
    ]);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    res.status(500).json({ error: 'Kunde inte logga in.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { email, password, role, name } = req.body || {};
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, lösenord och roll krävs.' });
    }

    if (!ROLE_RANK[role]) {
      return res.status(400).json({ error: 'Ogiltig roll.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash, role, name) VALUES ($1,$2,$3,$4) RETURNING id, email, role, name',
      [email.toLowerCase(), hash, role, name || null]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('POST /api/admin/users error:', error);
    res.status(500).json({ error: 'Kunde inte skapa användare.' });
  }
});

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, role, name, created_at, last_login_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    res.status(500).json({ error: 'Kunde inte hämta användare.' });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, name } = req.body || {};

    if (role && !ROLE_RANK[role]) {
      return res.status(400).json({ error: 'Ogiltig roll.' });
    }

    const { rows } = await query(
      'UPDATE users SET role = COALESCE($1, role), name = COALESCE($2, name) WHERE id = $3 RETURNING id, email, role, name',
      [role || null, name || null, id]
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

app.get('/api/admin/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = [];
    const values = [];

    if (from) {
      values.push(from);
      where.push(`created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      where.push(`created_at <= $${values.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

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

app.post('/api/admin/test-email', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { to } = req.body || {};
    if (!to) {
      return res.status(400).json({ error: 'Mottagare saknas.' });
    }

    const subject = 'Testmail från re:Compute-IT';
    const body = 'Detta är ett testmail från systemet. Om du ser detta fungerar SMTP.';

    await sendEmail({ to, subject, body });
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

app.post('/api/preview-notification', requireAuth, requireRole('service'), async (req, res) => {
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

    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1', [ticketId]);
    const ticket = rows[0];
    if (!ticket) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    const language = requestedLanguage || getLanguage(ticket);
    const previewTicket = {
      ...ticket,
      diagnosis: diagnosis ?? ticket.diagnosis,
      work_done_summary: work_done_summary ?? ticket.work_done_summary,
      final_cost: final_cost ?? ticket.final_cost,
    };

    const preview = await buildNotificationPreview({
      templateType,
      ticket: previewTicket,
      language,
    });

    return res.json({ ok: true, language, ...preview });
  } catch (error) {
    console.error('POST /api/preview-notification error:', error);
    return res.status(500).json({ error: 'Kunde inte generera förhandsvisning.' });
  }
});

app.post('/api/notify/cost-proposal', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1', [ticketId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language);
    const amount = ticket.final_cost || '—';
    const messageBase =
      textTemplates.costProposal[language]?.(localizedTicket, amount) ||
      textTemplates.costProposal.sv(localizedTicket, amount);
    const message = await translateIfNeeded(messageBase, language);
    const template =
      emailTemplates.costProposal[language]?.(localizedTicket, amount) ||
      emailTemplates.costProposal.sv(localizedTicket, amount);
    const translatedBody = await translateIfNeeded(template.body, language);
    const translatedSubject = await translateIfNeeded(template.subject, language);
    const delivery = { sms_sent: false, email_sent: false, warnings: [] };
    const sender = req.user?.email || 'okänd';

    if (channel === 'sms') {
      if (!ticket.customer_phone) {
        return res.status(400).json({ error: 'Telefonnummer saknas.' });
      }
      try {
        const smsResponse = await sendSms({
          to: ticket.customer_phone,
          message,
        });
        await query(
          `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider, provider_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ticket.id, 'sms', 'outbound', ticket.customer_phone, message, '46elks', smsResponse?.id || null]
        );
        delivery.sms_sent = true;
      } catch (error) {
        console.error('SMS send failed (cost-proposal):', error);
        delivery.warnings.push('SMS kunde inte skickas.');
      }

      if (ticket.customer_email) {
        try {
          await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ticket.id, 'email', 'outbound', ticket.customer_email, translatedSubject, translatedBody, 'smtp']
          );
          delivery.email_sent = true;
        } catch (error) {
          console.error('Auto email after sms (cost-proposal) failed:', error);
          delivery.warnings.push(delivery.sms_sent ? 'SMS skickades, men e-post kunde inte skickas.' : 'E-post kunde inte skickas.');
        }
      }

      if (!delivery.sms_sent && !delivery.email_sent) {
        return res.status(500).json({
          error: 'Kunde inte skicka.',
          details: delivery.warnings.join(' ') || 'Både SMS och e-post misslyckades.',
        });
      }
    } else if (channel === 'auto') {
      if (!ticket.customer_phone && !ticket.customer_email) {
        return res.status(400).json({ error: 'Varken telefonnummer eller e-post finns registrerat.' });
      }

      if (ticket.customer_phone) {
        try {
          const smsResponse = await sendSms({
            to: ticket.customer_phone,
            message,
          });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider, provider_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ticket.id, 'sms', 'outbound', ticket.customer_phone, message, '46elks', smsResponse?.id || null]
          );
          delivery.sms_sent = true;
        } catch (error) {
          console.error('SMS send failed (cost-proposal/auto):', error);
          delivery.warnings.push('SMS kunde inte skickas.');
        }
      }

      if (ticket.customer_email) {
        try {
          await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ticket.id, 'email', 'outbound', ticket.customer_email, translatedSubject, translatedBody, 'smtp']
          );
          delivery.email_sent = true;
        } catch (error) {
          console.error('Email send failed (cost-proposal/auto):', error);
          delivery.warnings.push('E-post kunde inte skickas.');
        }
      }

      if (!delivery.sms_sent && !delivery.email_sent) {
        return res.status(500).json({
          error: 'Kunde inte skicka.',
          details: delivery.warnings.join(' ') || 'Både SMS och e-post misslyckades.',
        });
      }
    } else {
      if (!ticket.customer_email) {
        return res.status(400).json({ error: 'E-post saknas.' });
      }
      await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
      await query(
        `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ticket.id, 'email', 'outbound', ticket.customer_email, translatedSubject, translatedBody, 'smtp']
      );
      delivery.email_sent = true;
    }

    const sentChannels =
      delivery.sms_sent && delivery.email_sent
        ? 'sms+email'
        : delivery.sms_sent
          ? 'sms'
          : 'email';

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

    res.json({ ok: true, ...delivery });
  } catch (error) {
    console.error('POST /api/notify/cost-proposal error:', error);
    res.status(500).json({ error: 'Kunde inte skicka.' });
  }
});

app.post('/api/notify/repair-ready', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1', [ticketId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language);
    const messageBase =
      textTemplates.repairReady[language]?.(localizedTicket) || textTemplates.repairReady.sv(localizedTicket);
    const message = await translateIfNeeded(messageBase, language);
    const template =
      emailTemplates.repairReady[language]?.(localizedTicket) || emailTemplates.repairReady.sv(localizedTicket);
    const translatedBody = await translateIfNeeded(template.body, language);
    const translatedSubject = await translateIfNeeded(template.subject, language);
    const delivery = { sms_sent: false, email_sent: false, warnings: [] };
    const sender = req.user?.email || 'okänd';

    if (channel === 'sms') {
      if (!ticket.customer_phone) {
        return res.status(400).json({ error: 'Telefonnummer saknas.' });
      }
      try {
        const smsResponse = await sendSms({
          to: ticket.customer_phone,
          message,
        });
        await query(
          `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider, provider_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ticket.id, 'sms', 'outbound', ticket.customer_phone, message, '46elks', smsResponse?.id || null]
        );
        delivery.sms_sent = true;
      } catch (error) {
        console.error('SMS send failed (repair-ready):', error);
        delivery.warnings.push('SMS kunde inte skickas.');
      }

      if (ticket.customer_email) {
        try {
          await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ticket.id, 'email', 'outbound', ticket.customer_email, translatedSubject, translatedBody, 'smtp']
          );
          delivery.email_sent = true;
        } catch (error) {
          console.error('Auto email after sms (repair-ready) failed:', error);
          delivery.warnings.push(delivery.sms_sent ? 'SMS skickades, men e-post kunde inte skickas.' : 'E-post kunde inte skickas.');
        }
      }

      if (!delivery.sms_sent && !delivery.email_sent) {
        return res.status(500).json({
          error: 'Kunde inte skicka.',
          details: delivery.warnings.join(' ') || 'Både SMS och e-post misslyckades.',
        });
      }
    } else if (channel === 'auto') {
      if (!ticket.customer_phone && !ticket.customer_email) {
        return res.status(400).json({ error: 'Varken telefonnummer eller e-post finns registrerat.' });
      }

      if (ticket.customer_phone) {
        try {
          const smsResponse = await sendSms({
            to: ticket.customer_phone,
            message,
          });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider, provider_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ticket.id, 'sms', 'outbound', ticket.customer_phone, message, '46elks', smsResponse?.id || null]
          );
          delivery.sms_sent = true;
        } catch (error) {
          console.error('SMS send failed (repair-ready/auto):', error);
          delivery.warnings.push('SMS kunde inte skickas.');
        }
      }

      if (ticket.customer_email) {
        try {
          await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [ticket.id, 'email', 'outbound', ticket.customer_email, translatedSubject, translatedBody, 'smtp']
          );
          delivery.email_sent = true;
        } catch (error) {
          console.error('Email send failed (repair-ready/auto):', error);
          delivery.warnings.push('E-post kunde inte skickas.');
        }
      }

      if (!delivery.sms_sent && !delivery.email_sent) {
        return res.status(500).json({
          error: 'Kunde inte skicka.',
          details: delivery.warnings.join(' ') || 'Både SMS och e-post misslyckades.',
        });
      }
    } else {
      if (!ticket.customer_email) {
        return res.status(400).json({ error: 'E-post saknas.' });
      }
      await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
      await query(
        `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ticket.id, 'email', 'outbound', ticket.customer_email, translatedSubject, translatedBody, 'smtp']
      );
      delivery.email_sent = true;
    }

    const sentChannels =
      delivery.sms_sent && delivery.email_sent
        ? 'sms+email'
        : delivery.sms_sent
          ? 'sms'
          : 'email';

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

    res.json({ ok: true, ...delivery });
  } catch (error) {
    console.error('POST /api/notify/repair-ready error:', error);
    res.status(500).json({ error: 'Kunde inte skicka.' });
  }
});

app.post('/api/webhooks/email-inbound', async (req, res) => {
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
        req.query.secret ||
        req.headers['x-webhook-secret'] ||
        req.headers['x-inbound-secret'] ||
        '';
      if (providedSecret !== EMAIL_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const inbound = parseInboundEmailPayload(parsedPayload);
    if (inbound.provider === 'resend' && !inbound.text && inbound.emailId) {
      try {
        const received = await loadResendReceivedEmail(inbound.emailId);
        inbound.text =
          firstString(received, ['text', 'data.text', 'html', 'data.html']) || inbound.text;
      } catch (error) {
        console.error('Resend receiving fetch failed:', error);
      }
    }

    if (!inbound.from || (!inbound.subject && !inbound.text)) {
      return res.status(400).json({ error: 'Invalid inbound email payload' });
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

    if (!ticket) {
      await query(
        `INSERT INTO message_logs (channel, direction, from_number, to_number, subject, body, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        ['email', 'inbound', inbound.from, inbound.to || null, inbound.subject || null, inbound.text || null, inbound.provider]
      );
      return res.json({ ok: true, matched: false });
    }

    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, from_number, to_number, subject, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ticket.id, 'email', 'inbound', inbound.from, inbound.to || null, inbound.subject || null, inbound.text || null, inbound.provider]
    );

    const decision = parseApprovalDecision(`${inbound.subject}\n${inbound.text}`);
    if (decision === 'yes') {
      await query(
        `UPDATE service_tickets
         SET cost_proposal_approved = true,
             status = $1,
             last_customer_decision = 'approved',
             last_customer_response_text = $3,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag godkänt', ticket.id, inbound.text || inbound.subject || '']
      );
      try {
        await sendDecisionAcknowledgement({
          ticket,
          decision: 'yes',
          channel: 'email',
          emailTo: inbound.from,
        });
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
        ['Kostnadsförslag nekat', ticket.id, inbound.text || inbound.subject || '']
      );
      try {
        await sendDecisionAcknowledgement({
          ticket,
          decision: 'no',
          channel: 'email',
          emailTo: inbound.from,
        });
      } catch (error) {
        console.error('Email acknowledgement send failed (no):', error);
      }
    } else {
      await query(
        `UPDATE service_tickets
         SET last_customer_decision = 'unknown',
             last_customer_response_text = $2,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, inbound.text || inbound.subject || '']
      );
    }

    return res.json({ ok: true, matched: true, ticket_number: ticket.ticket_number, decision });
  } catch (error) {
    console.error('Email inbound webhook error:', error);
    return res.status(500).json({ error: 'Webhook error' });
  }
});

app.post('/api/webhooks/46elks', async (req, res) => {
  try {
    if (ELKS_WEBHOOK_SECRET && req.query.secret !== ELKS_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const from = req.body.from || req.body.sender;
    const message = (req.body.message || req.body.text || '').trim();

    if (!from || !message) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const normalized = normalizePhone(from);
    const { rows } = await query(
      `SELECT * FROM service_tickets WHERE customer_phone_normalized = $1 ORDER BY created_at DESC LIMIT 1`,
      [normalized]
    );

    const ticket = rows[0];
    if (!ticket) {
      await query(
        `INSERT INTO message_logs (channel, direction, from_number, body, provider)
         VALUES ($1,$2,$3,$4,$5)`,
        ['sms', 'inbound', from, message, '46elks']
      );
      return res.json({ ok: true });
    }

    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, from_number, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ticket.id, 'sms', 'inbound', from, message, '46elks']
    );

    const decision = parseApprovalDecision(message);
    if (decision === 'yes') {
      await query(
        `UPDATE service_tickets
         SET cost_proposal_approved = true,
             status = $1,
             last_customer_decision = 'approved',
             last_customer_response_text = $3,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag godkänt', ticket.id, message]
      );
      try {
        await sendDecisionAcknowledgement({
          ticket,
          decision: 'yes',
          channel: 'sms',
          smsTo: from,
        });
      } catch (error) {
        console.error('SMS acknowledgement send failed (yes):', error);
      }
    } else if (decision === 'no') {
      await query(
        `UPDATE service_tickets
         SET cost_proposal_approved = false,
             status = $1,
             last_customer_decision = 'declined',
             last_customer_response_text = $3,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $2`,
        ['Kostnadsförslag nekat', ticket.id, message]
      );
      try {
        await sendDecisionAcknowledgement({
          ticket,
          decision: 'no',
          channel: 'sms',
          smsTo: from,
        });
      } catch (error) {
        console.error('SMS acknowledgement send failed (no):', error);
      }
    } else {
      await query(
        `UPDATE service_tickets
         SET last_customer_decision = 'unknown',
             last_customer_response_text = $2,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, message]
      );
    }

    return res.json({ ok: true, decision });
  } catch (error) {
    console.error('46elks webhook error:', error);
    return res.status(500).json({ error: 'Webhook error' });
  }
});

app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

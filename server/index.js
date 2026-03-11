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
const SUPPORTED_LANGUAGES = ['sv', 'en', 'ar', 'es', 'fi', 'ku', 'tr', 'pl', 'uk'];

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
const normalizePreferredChannel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sms') return 'sms';
  if (normalized === 'email' || normalized === 'e-post') return 'email';
  return '';
};

const resolvePreferredContactChannel = (ticketOrPayload = {}) => {
  const hasPhone = Boolean(ticketOrPayload.customer_phone?.toString().trim());
  const hasEmail = Boolean(ticketOrPayload.customer_email?.toString().trim());
  const preferred = normalizePreferredChannel(ticketOrPayload.preferred_contact_channel);

  if (hasPhone && hasEmail) {
    return preferred || 'email';
  }
  if (hasPhone) return 'sms';
  if (hasEmail) return 'email';
  return '';
};

const REPLY_MARKER_BY_LANGUAGE = {
  sv: '----- Svara ovanför denna linje -----',
  en: '----- Reply above this line -----',
  ar: '----- الرد فوق هذا السطر -----',
  es: '----- Responda encima de esta línea -----',
  fi: '----- Vastaa tämän rivin yläpuolelle -----',
  ku: '----- Li ser vê rêzê bersiv bidin -----',
  tr: '----- Bu satırın üstüne yanıtlayın -----',
  pl: '----- Odpowiedz powyżej tej linii -----',
  uk: '----- Відповідайте вище цього рядка -----',
};

const REPLY_HINT_BY_LANGUAGE = {
  sv: 'Skriv ditt svar på raden ovan.',
  en: 'Write your response on the line above.',
  ar: 'اكتب ردك في السطر أعلاه.',
  es: 'Escriba su respuesta en la línea de arriba.',
  fi: 'Kirjoita vastauksesi yllä olevalle riville.',
  ku: 'Bersiva xwe li rêza jor binivîse.',
  tr: 'Yanıtınızı yukarıdaki satıra yazın.',
  pl: 'Wpisz odpowiedź w wierszu powyżej.',
  uk: 'Напишіть свою відповідь у рядку вище.',
};

const EMAIL_REPLY_MARKERS = Object.values(REPLY_MARKER_BY_LANGUAGE).map((line) => line.toLowerCase());
const REPLY_TOKEN_REGEX = /RECOMPUTE[_-]?REPLY[_-]?START[:\s_-]*([a-z0-9-]{6,64})/i;
const QUOTE_HEADER_REGEX = /(^|\n)\s*(on .+wrote:|den .+skrev:|från:|from:|skickat:|sent:|till:|to:|am .+schrieb|el .+escribi[oó]|le .+a écrit)/i;

const getReplyMarkerLine = (language = 'sv') => REPLY_MARKER_BY_LANGUAGE[language] || REPLY_MARKER_BY_LANGUAGE.sv;
const getReplyHintLine = (language = 'sv') => REPLY_HINT_BY_LANGUAGE[language] || REPLY_HINT_BY_LANGUAGE.sv;
const getReplyTokenLine = (replyToken = '') =>
  replyToken ? `--- RECOMPUTE_REPLY_START:${replyToken} ---` : '--- RECOMPUTE_REPLY_START ---';
const generateReplyToken = () => crypto.randomBytes(6).toString('hex');

const appendReplyGuidance = (body = '', language = 'sv', replyToken = '') => {
  const marker = getReplyMarkerLine(language);
  const hint = getReplyHintLine(language);
  const tokenLine = getReplyTokenLine(replyToken);
  const normalizedBody = String(body || '').trim();
  const bodyWithoutAnyMarker = normalizedBody
    .split('\n')
    .filter((line) => !EMAIL_REPLY_MARKERS.includes(line.trim().toLowerCase()))
    .join('\n')
    .trim();
  return `${bodyWithoutAnyMarker}\n\n${marker}\n${hint}\n${tokenLine}`.trim();
};

const extractTopReply = (rawMessage = '') => {
  const message = String(rawMessage || '').replace(/\r/g, '').trim();
  if (!message) return { text: '', method: 'empty', confidence: 'low', replyToken: null };

  const tokenMatch = message.match(REPLY_TOKEN_REGEX);
  if (tokenMatch?.index !== undefined) {
    const text = message.slice(0, tokenMatch.index).trim() || message;
    return { text, method: 'reply_token', confidence: 'high', replyToken: tokenMatch[1] || null };
  }

  const lower = message.toLowerCase();
  let cutoff = lower.length;

  for (const marker of EMAIL_REPLY_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && idx < cutoff) cutoff = idx;
  }
  if (cutoff < lower.length) {
    const text = message.slice(0, cutoff).trim() || message;
    return { text, method: 'marker_line', confidence: 'high', replyToken: null };
  }

  const quoteHeaderMatch = message.match(QUOTE_HEADER_REGEX);
  if (quoteHeaderMatch?.index !== undefined) {
    const text = message.slice(0, quoteHeaderMatch.index).trim() || message;
    return { text, method: 'quote_header', confidence: 'medium', replyToken: null };
  }

  const lines = message.split('\n');
  const cleanedLines = [];
  for (const line of lines) {
    if (line.trim().startsWith('>')) break;
    if (/^\s*sent from my/i.test(line)) break;
    cleanedLines.push(line);
  }
  const cleaned = cleanedLines.join('\n').trim();
  if (cleaned && cleaned !== message) {
    return { text: cleaned, method: 'quoted_lines', confidence: 'medium', replyToken: null };
  }

  return { text: message, method: 'fallback_full', confidence: 'low', replyToken: null };
};

const cleanVisibleReplyText = (raw = '') => {
  const input = String(raw || '').replace(/\r/g, '').trim();
  if (!input) return '';

  const lines = input.split('\n');
  const cleaned = [];

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (REPLY_TOKEN_REGEX.test(trimmed)) break;
    if (EMAIL_REPLY_MARKERS.includes(lower)) break;
    if (/^---\s*recompute[_-]?reply[_-]?start/i.test(trimmed)) break;
    if (/^[-_]{2,}\s*(svara ovanf[oö]r denna linje|reply above this line)\s*[-_]{2,}$/i.test(trimmed)) break;
    if (QUOTE_HEADER_REGEX.test(`\n${trimmed}`)) break;
    if (/^(från:|from:|skickat:|sent:|till:|to:|ämne:|subject:)/i.test(trimmed)) break;
    if (trimmed.startsWith('>')) break;
    if (/^[-_]{2,}\s*(original message|ursprungligt meddelande|forwarded message)/i.test(trimmed)) break;

    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
};

const extractTopReplyText = (rawMessage = '') => {
  const extracted = extractTopReply(rawMessage).text;
  const cleaned = cleanVisibleReplyText(extracted);
  return cleaned || extracted;
};

const parseApprovalDecision = (rawMessage = '') => {
  const message = cleanVisibleReplyText(extractTopReplyText(rawMessage));
  if (!message) return null;

  // Try to focus on customer's own reply, not quoted thread below.
  const cutMarkers = [
    '\n>',
    '\n--',
    '\nfrån:',
    '\nfrom:',
    '\non ',
    '\nden ',
    '\nle ',
    '\nam ',
    '\nel ',
    '\nكتب ',
    '\nwrote:',
    '\nskrev:',
  ];
  const lowerMessage = message.toLowerCase();
  let cutoff = lowerMessage.length;
  for (const marker of cutMarkers) {
    const idx = lowerMessage.indexOf(marker);
    if (idx !== -1 && idx < cutoff) cutoff = idx;
  }
  const primary = message.slice(0, cutoff);

  const normalized = primary
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
    /\byeah\b/,
    /\byup\b/,
    /\bok\b/,
    /\bokej\b/,
    /\bokay\b/,
    /\bgodkann\w*\b/,
    /\bapprove\w*\b/,
    /\baccept\w*\b/,
    /\bproceed\w*\b/,
    /\bcontinue\w*\b/,
    /\bgo on\b/,
    /\bgo ahead\b/,
    /\bdo it\b/,
    /\bkor\b/,
    /\bsi\b/,
    /\bsi claro\b/,
    /\bev(et)?\b/,
    /\btak\b/,
    /\bkylla\b/,
    /\bere\b/,
    /\bta(k)?\b/,
    /\bniam\b/,
    /\bnaam\b/,
    /(^|\s)نعم(\s|$)/u,
    /(^|\s)اي(\s|$)/u,
    /(^|\s)أيوه(\s|$)/u,
    /(^|\s)ايوه(\s|$)/u,
    /(^|\s)اوكي(\s|$)/u,
    /(^|\s)موافق(\s|$)/u,
    /(^|\s)موافقه(\s|$)/u,
    /(^|\s)تاک(\s|$)/u,
    /(^|\s)так(\s|$)/u,
    /(^|\s)да(\s|$)/u,
    /(^|\s)موافق\w*(\s|$)/u,
    /(^|\s)تمام(\s|$)/u,
  ];
  const noPatterns = [
    /\bnej\b/,
    /\bno\b/,
    /\bnope\b/,
    /\bnah\b/,
    /\bavboj\w*\b/,
    /\bdeclin\w*\b/,
    /\breject\w*\b/,
    /\bdon t approve\b/,
    /\bdo not approve\b/,
    /\bdon t proceed\b/,
    /\bdo not proceed\b/,
    /\bnot now\b/,
    /\bnot interested\b/,
    /\bcancel\w*\b/,
    /\bstop\b/,
    /\bnon\b/,
    /\bhayir\b/,
    /\bhayr\b/,
    /\bnie\b/,
    /\bei\b/,
    /\bna\b/,
    /\bne\b/,
    /(^|\s)لا(\s|$)/u,
    /(^|\s)كلا(\s|$)/u,
    /(^|\s)مو(\s|$)/u,
    /(^|\s)ليس(\s|$)/u,
    /(^|\s)غير موافق(\s|$)/u,
    /(^|\s)niet(\s|$)/u,
    /(^|\s)ні(\s|$)/u,
    /(^|\s)ніт(\s|$)/u,
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

const htmlToPlainText = (html = '') =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const collectTextCandidates = (value, keyPath = '', out = []) => {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string') {
    const key = keyPath.toLowerCase();
    if (
      key.includes('text') ||
      key.includes('plain') ||
      key.includes('body') ||
      key.includes('snippet') ||
      key.includes('content') ||
      key.includes('value')
    ) {
      const trimmed = value.trim();
      if (trimmed) out.push(trimmed);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectTextCandidates(item, `${keyPath}[${idx}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      collectTextCandidates(child, nextPath, out);
    });
  }
  return out;
};

const pickBestTextCandidate = (candidates = []) => {
  if (!candidates.length) return '';
  const cleaned = candidates
    .map((item) => item.replace(/\r/g, '').trim())
    .filter(Boolean)
    .filter((item) => item.length >= 2)
    .filter((item) => !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(item))
    .filter((item) => !/^re:\s*/i.test(item));
  if (!cleaned.length) return '';
  const sorted = [...new Set(cleaned)].sort((a, b) => b.length - a.length);
  const richest = sorted.find((item) => /\s/.test(item) || item.length > 8);
  return richest || sorted[0];
};

const extractInboundText = (payload) => {
  if (!payload) return '';
  const directText = firstString(payload, [
    'data.text',
    'data.text_body',
    'data.textBody',
    'data.plain',
    'text',
    'text_body',
    'textBody',
    'body',
    'message.text',
    'gmail.text',
    'plain',
    'content.text',
    'email.text',
    'email.text_body',
  ]);
  if (directText) return directText;

  const html = firstString(payload, [
    'data.html',
    'data.html_body',
    'data.htmlBody',
    'html',
    'html_body',
    'htmlBody',
    'content.html',
    'email.html',
    'email.html_body',
  ]);
  if (html) return htmlToPlainText(html);

  const candidate = pickBestTextCandidate(collectTextCandidates(payload));
  return candidate || '';
};

const extractReplySnippetFromRawWebhook = (raw = '') => {
  if (!raw || typeof raw !== 'string') return '';

  const keys = [
    'text',
    'text_body',
    'textBody',
    'stripped-text',
    'stripped_text',
    'body-plain',
    'body_plain',
    'plain',
  ];

  for (const key of keys) {
    const regex = new RegExp(`"${key}"\\s*:\\s*"([^"]{1,400})"`, 'i');
    const match = raw.match(regex);
    if (!match?.[1]) continue;
    const encoded = match[1];
    let decoded = encoded;
    try {
      decoded = JSON.parse(`"${encoded.replace(/"/g, '\\"')}"`);
    } catch {
      // fallback with raw value
    }
    const cleaned = decoded.trim();
    if (cleaned) return cleaned;
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
  const text = extractInboundText(body);
  const messageId = firstString(body, [
    'data.message_id',
    'message_id',
    'data.headers.message-id',
    'headers.message-id',
  ]);
  const inReplyTo = firstString(body, [
    'data.in_reply_to',
    'in_reply_to',
    'data.headers.in-reply-to',
    'headers.in-reply-to',
  ]);
  const referencesHeader = firstString(body, [
    'data.references',
    'references',
    'data.headers.references',
    'headers.references',
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
    messageId,
    inReplyTo,
    referencesHeader,
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

const buildClarificationTemplate = async (ticket) => {
  const lang = getLanguage(ticket);
  const subjectSv = `Bekräfta svar för ärende #${ticket.ticket_number}`;
  const bodySv =
    `Hej ${ticket.customer_name},\n\n` +
    `Vi kunde inte tolka ditt senaste svar för ärende #${ticket.ticket_number}.\n` +
    `Svara endast med JA för att godkänna kostnadsförslaget eller NEJ för att neka.\n\n` +
    `Tack!`;
  const smsSv =
    `Vi kunde inte tolka ditt svar för ärende #${ticket.ticket_number}. ` +
    `Svara endast JA för godkänna eller NEJ för neka.`;

  if (lang === 'sv') {
    return { subject: subjectSv, body: bodySv, sms: smsSv };
  }

  const subject = await translateIfNeeded(subjectSv, lang, { allowEnglish: true });
  const body = await translateIfNeeded(bodySv, lang, { allowEnglish: true });
  const sms = await translateIfNeeded(smsSv, lang, { allowEnglish: true });
  return { subject, body, sms };
};

const sendDecisionClarification = async ({ ticket, channel, smsTo, emailTo }) => {
  const template = await buildClarificationTemplate(ticket);

  if (channel === 'sms' && smsTo) {
    await sendSms({ to: smsTo, message: template.sms });
    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ticket.id, 'sms', 'outbound', smsTo, template.sms, '46elks']
    );
    return;
  }

  if (channel === 'email' && emailTo) {
    const language = getLanguage(ticket);
    const replyToken = generateReplyToken();
    const bodyWithMarker = appendReplyGuidance(template.body, language, replyToken);
    await sendEmail({
      to: emailTo,
      subject: template.subject,
      body: bodyWithMarker,
    });
    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, reply_token, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ticket.id, 'email', 'outbound', emailTo, template.subject, bodyWithMarker, replyToken, 'smtp']
    );
  }
};

const loadResendReceivedEmail = async (emailId) => {
  if (!RESEND_API_KEY || !emailId) return null;
  const errors = [];

  if (resendClient?.emails?.receiving?.get) {
    try {
      const receivingResult = await resendClient.emails.receiving.get(emailId);
      if (receivingResult?.data) return receivingResult.data;
      if (receivingResult?.error) {
        errors.push(`receiving.get: ${receivingResult.error.message || 'unknown error'}`);
      }
    } catch (error) {
      errors.push(`receiving.get: ${error?.message || 'unknown error'}`);
    }
  }

  if (resendClient?.emails?.get) {
    try {
      const getResult = await resendClient.emails.get(emailId);
      if (getResult?.data) return getResult.data;
      if (getResult?.error) {
        errors.push(`emails.get: ${getResult.error.message || 'unknown error'}`);
      }
    } catch (error) {
      errors.push(`emails.get: ${error?.message || 'unknown error'}`);
    }
  }

  const restPaths = [
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    `https://api.resend.com/emails/${encodeURIComponent(emailId)}`,
  ];

  for (const url of restPaths) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        errors.push(`rest ${url}: ${response.status} ${errorText}`);
        continue;
      }

      const payload = await response.json();
      const data = payload?.data || payload || null;
      if (data) return data;
    } catch (error) {
      errors.push(`rest ${url}: ${error?.message || 'unknown error'}`);
    }
  }

  throw new Error(`Resend inbound fetch failed (${emailId}): ${errors.join(' | ')}`);
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
      body: `Hej ${ticket.customer_name},\n\nVi har tagit fram ett kostnadsförslag för ditt ärende (#${ticket.ticket_number}).\nKostnad: ${amount} kr.`,
    }),
    en: (ticket, amount) => ({
      subject: `Cost proposal for case #${ticket.ticket_number}`,
      body: `Hi ${ticket.customer_name},\n\nWe have prepared a cost proposal for your case (#${ticket.ticket_number}).\nCost: ${amount} SEK.`,
    }),
  },
  repairReady: {
    sv: (ticket) => ({
      subject: `Din enhet är klar (#${ticket.ticket_number})`,
      body: `Hej ${ticket.customer_name},\n\nDin enhet är klar för upphämtning. Välkommen in!`,
    }),
    en: (ticket) => ({
      subject: `Your device is ready (#${ticket.ticket_number})`,
      body: `Hi ${ticket.customer_name},\n\nYour device is ready for pickup. Welcome in!`,
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

const DEFAULT_MESSAGE_SETTINGS = {
  email_footer_by_lang: {
    sv: 'Vänliga hälsningar\nre:Compute-IT',
    en: 'Best regards\nre:Compute-IT',
  },
  sms_footer_by_lang: {
    sv: 're:Compute-IT',
    en: 're:Compute-IT',
  },
  cost_prompt_by_lang: {
    sv: 'Svara gärna på detta mail eller via SMS med JA för godkännande, eller NEJ om du vill avböja.',
    en: 'Please reply with YES to approve, or NO to decline.',
  },
  ready_prompt_by_lang: {
    sv: 'Har du frågor, svara på detta mail eller SMS.',
    en: 'If you have questions, reply to this email or SMS.',
  },
  ai_reply_assistant_prompt:
    'Du hjälper servicepersonal att svara kunder kort, tydligt och professionellt. Föreslå ett konkret svar som kan skickas direkt.',
  ai_message_suggestion_prompt:
    'Skapa ett tydligt kundmeddelande för serviceärende baserat på diagnos, kostnad, status och senaste kunddialog.',
  chat_default_language: 'sv',
};

const mergeMessageSettings = (raw) => {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  const mergeByLang = (key) => ({
    ...DEFAULT_MESSAGE_SETTINGS[key],
    ...(parsed[key] && typeof parsed[key] === 'object' ? parsed[key] : {}),
  });
  return {
    email_footer_by_lang: mergeByLang('email_footer_by_lang'),
    sms_footer_by_lang: mergeByLang('sms_footer_by_lang'),
    cost_prompt_by_lang: mergeByLang('cost_prompt_by_lang'),
    ready_prompt_by_lang: mergeByLang('ready_prompt_by_lang'),
    ai_reply_assistant_prompt:
      parsed?.ai_reply_assistant_prompt || DEFAULT_MESSAGE_SETTINGS.ai_reply_assistant_prompt,
    ai_message_suggestion_prompt:
      parsed?.ai_message_suggestion_prompt || DEFAULT_MESSAGE_SETTINGS.ai_message_suggestion_prompt,
    chat_default_language:
      parsed?.chat_default_language || DEFAULT_MESSAGE_SETTINGS.chat_default_language,
  };
};

const getAdminMessageSettings = async () => {
  const { rows } = await query('SELECT value_json FROM app_settings WHERE key = $1', ['message_templates']);
  return mergeMessageSettings(rows[0]?.value_json || {});
};

const fillMissingTranslations = async (byLang = {}, options = {}) => {
  const { overwriteExisting = false } = options;
  const sourceSv = byLang?.sv?.toString().trim() || '';
  const sourceEn = byLang?.en?.toString().trim() || '';
  const sourceText = sourceSv || sourceEn || '';
  if (!sourceText) return byLang;

  const next = { ...byLang };
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === 'sv' || lang === 'en') continue;
    const existing = next?.[lang]?.toString().trim() || '';
    if (!overwriteExisting && existing) continue;
    next[lang] = await translateIfNeeded(sourceText, lang, { allowEnglish: true });
  }
  return next;
};

const autoTranslateMessageSettings = async (settings = {}) => {
  const normalized = mergeMessageSettings(settings);
  return {
    ...normalized,
    email_footer_by_lang: await fillMissingTranslations(normalized.email_footer_by_lang, {
      overwriteExisting: true,
    }),
    sms_footer_by_lang: await fillMissingTranslations(normalized.sms_footer_by_lang, {
      overwriteExisting: true,
    }),
    cost_prompt_by_lang: await fillMissingTranslations(normalized.cost_prompt_by_lang, {
      overwriteExisting: true,
    }),
    ready_prompt_by_lang: await fillMissingTranslations(normalized.ready_prompt_by_lang, {
      overwriteExisting: true,
    }),
  };
};

const getCachedTranslation = async (text, targetLanguage) => {
  const { rows } = await query(
    `SELECT translated_text
     FROM translation_cache
     WHERE source_text = $1 AND target_language = $2
     LIMIT 1`,
    [text, targetLanguage]
  );
  return rows[0]?.translated_text || '';
};

const setCachedTranslation = async (text, targetLanguage, translatedText) => {
  await query(
    `INSERT INTO translation_cache (source_text, target_language, translated_text, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (source_text, target_language)
     DO UPDATE SET translated_text = EXCLUDED.translated_text, updated_at = NOW()`,
    [text, targetLanguage, translatedText]
  );
};

const translateText = async (text, targetLanguage, options = {}) => {
  const { strict = false } = options;
  if (!text || !targetLanguage) return text;
  if (targetLanguage === 'sv' && isLikelySwedish(text)) return text;

  try {
    const cached = await getCachedTranslation(text, targetLanguage);
    if (cached) return cached;
  } catch (error) {
    console.warn('Translation cache read failed:', error?.message || error);
  }

  if (!DEEPSEEK_API_KEY) {
    if (strict) {
      throw new Error('Translation unavailable: DEEPSEEK_API_KEY is missing');
    }
    return text;
  }

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
              'Translate the text into the requested target language. Keep numbers, names, and case numbers unchanged. Return only the translated text.',
          },
          {
            role: 'user',
            content: `Target language: ${targetLanguage}\nText: ${text}`,
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
    const cleaned = translated
      .replace(/^Language:\s*[a-z-]+\s*Text:\s*/i, '')
      .replace(/^Target language:\s*[a-z-]+\s*Text:\s*/i, '')
      .trim();
    const finalText = cleaned || text;
    if (finalText && finalText !== text) {
      try {
        await setCachedTranslation(text, targetLanguage, finalText);
      } catch (error) {
        console.warn('Translation cache write failed:', error?.message || error);
      }
    }
    return finalText;
  } catch (error) {
    console.error('DeepSeek translation failed:', error);
    if (strict) {
      throw error;
    }
    return text;
  }
};

const translateIfNeeded = async (text, language, options = {}) => {
  const { allowEnglish = false, strict = false } = options;
  if (!language || language === 'sv') return text;
  if (language === 'en' && !allowEnglish) return text;
  return translateText(text, language, { strict });
};

const normalizeComparableText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelySwedish = (text = '') => {
  const sample = normalizeComparableText(text);
  if (!sample) return false;
  if (/[åäö]/i.test(text)) return true;

  const swedishWords = [
    'och',
    'att',
    'det',
    'är',
    'jag',
    'inte',
    'med',
    'för',
    'på',
    'du',
    'vi',
    'till',
    'en',
    'ett',
    'den',
    'som',
  ];

  let hits = 0;
  for (const word of swedishWords) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(sample)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
};

const maybeAppendSwedishTranslation = async (_ticket, text) => {
  if (!text) return text;
  if (isLikelySwedish(text)) return text;

  const translated = await translateText(text, 'sv');
  if (!translated) return text;
  if (normalizeComparableText(translated) === normalizeComparableText(text)) {
    return text;
  }
  return `${text}\n\n(Svenska: ${translated})`;
};

const getLocalizedSetting = async (settingsByLang = {}, language = 'sv') => {
  const direct = settingsByLang?.[language];
  if (direct) return direct;
  const baseSv = settingsByLang?.sv || '';
  if (!baseSv) return '';
  if (language === 'sv') return baseSv;
  return translateIfNeeded(baseSv, language, { allowEnglish: true });
};

const appendUniqueBlock = (text = '', block = '') => {
  const trimmedText = String(text || '').trim();
  const trimmedBlock = String(block || '').trim();
  if (!trimmedBlock) return trimmedText;
  if (trimmedText.toLowerCase().includes(trimmedBlock.toLowerCase())) return trimmedText;
  return `${trimmedText}\n\n${trimmedBlock}`.trim();
};

const renderMessageSettingTemplate = (template = '', variables = {}) => {
  const input = String(template || '');
  if (!input) return '';

  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = variables[key];
    if (value === null || value === undefined) return '';
    return String(value);
  });
};

const localizeTicketFreeText = async (ticket, language, options = {}) => {
  if (!ticket || !language || language === 'sv') return ticket;
  const { strict = false } = options;

  const [diagnosisLocalized, workDoneLocalized] = await Promise.all([
    translateIfNeeded(ticket.diagnosis || '', language, { allowEnglish: true, strict }),
    translateIfNeeded(ticket.work_done_summary || '', language, { allowEnglish: true, strict }),
  ]);

  return {
    ...ticket,
    diagnosis: diagnosisLocalized || ticket.diagnosis,
    work_done_summary: workDoneLocalized || ticket.work_done_summary,
  };
};

const buildNotificationPreview = async ({ templateType, ticket, language, settings, replyToken = '' }) => {
  const localizedTicket = ticket;
  const activeSettings = mergeMessageSettings(settings || {});
  const emailFooter = await getLocalizedSetting(activeSettings.email_footer_by_lang, language);
  const smsFooter = await getLocalizedSetting(activeSettings.sms_footer_by_lang, language);
  const commonVariables = {
    customer_name: localizedTicket.customer_name || '',
    ticket_number: localizedTicket.ticket_number || '',
    device_type: localizedTicket.device_type || '',
    device_model: localizedTicket.device_model || '',
    diagnosis: localizedTicket.diagnosis || '',
    work_done: localizedTicket.work_done_summary || '',
    amount: localizedTicket.final_cost || '',
    final_cost: localizedTicket.final_cost || '',
  };

  if (templateType === 'kostnadsforslag') {
    const amount = ticket.final_cost || '—';
    const messageBase =
      textTemplates.costProposal[language]?.(localizedTicket, amount) ||
      textTemplates.costProposal.sv(localizedTicket, amount);
    let sms = await translateIfNeeded(messageBase, language);
    const template =
      emailTemplates.costProposal[language]?.(localizedTicket, amount) ||
      emailTemplates.costProposal.sv(localizedTicket, amount);
    const subject = await translateIfNeeded(template.subject, language);
    let body = await translateIfNeeded(template.body, language);
    const localizedCostPrompt = await getLocalizedSetting(activeSettings.cost_prompt_by_lang, language);
    body = appendUniqueBlock(body, renderMessageSettingTemplate(localizedCostPrompt, commonVariables));
    body = appendUniqueBlock(body, emailFooter);
    body = appendReplyGuidance(body, language, replyToken);
    sms = appendUniqueBlock(sms, smsFooter);
    return { subject, body, sms };
  }

  const messageBase =
    textTemplates.repairReady[language]?.(localizedTicket) ||
    textTemplates.repairReady.sv(localizedTicket);
  let sms = await translateIfNeeded(messageBase, language);
  const template =
    emailTemplates.repairReady[language]?.(localizedTicket) ||
    emailTemplates.repairReady.sv(localizedTicket);
  const subject = await translateIfNeeded(template.subject, language);
  let body = await translateIfNeeded(template.body, language);
  const localizedReadyPrompt = await getLocalizedSetting(activeSettings.ready_prompt_by_lang, language);
  body = appendUniqueBlock(body, renderMessageSettingTemplate(localizedReadyPrompt, commonVariables));
  body = appendUniqueBlock(body, emailFooter);
  body = appendReplyGuidance(body, language, replyToken);
  sms = appendUniqueBlock(sms, smsFooter);
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
  let resendError = null;
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
      resendError = `Resend API failed: ${error?.message || 'Unknown Resend error'}`;
    }
  }

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

  if (resendError && smtpError) {
    throw new Error(`${resendError} | ${smtpError}`);
  }
  if (resendError) {
    throw new Error(resendError);
  }
  if (smtpError) {
    throw new Error(smtpError);
  }

  throw new Error('Email is not configured');
};

app.get('/api/tickets', requireAuth, async (_req, res) => {
  try {
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
        ORDER BY t.created_at DESC
      `
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

    const normalizedPhone = normalizePhone(cleanedPhone);
    const { rows } = await query(
      `
        INSERT INTO service_tickets (
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `,
      [
        customer_name,
        cleanedEmail || null,
        cleanedPhone || null,
        normalizedPhone || null,
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
      'preferred_contact_channel',
      'customer_email',
      'customer_phone',
      'additional_notes',
      'device_model',
      'completed_at',
      'customer_notified_at',
      'picked_up_at',
      'closed_at',
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

app.get('/api/tickets/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT id, ticket_id, channel, direction, sender_user, to_number, from_number, subject, body, raw_body, parse_method, parse_confidence, message_id, in_reply_to, references_header, reply_token, provider, provider_id, created_at
       FROM message_logs
       WHERE ticket_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    );
    const settings = await getAdminMessageSettings();
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

app.post('/api/tickets/:id/messages', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, body, message, text, channel = 'email' } = req.body || {};
    const sender = req.user?.email || 'okänd';

    if (channel !== 'email') {
      return res.status(400).json({ error: 'Endast e-post stöds för manuell konversation just nu.' });
    }
    const rawBodyInput = [body, message, text].find(
      (value) => value !== undefined && value !== null && value.toString().trim()
    );
    if (!rawBodyInput?.toString().trim()) {
      return res.status(400).json({ error: 'Meddelandetext saknas.' });
    }

    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1', [id]);
    const ticket = rows[0];
    if (!ticket) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }
    if (!ticket.customer_email) {
      return res.status(400).json({ error: 'Kunden saknar e-postadress.' });
    }

    const baseSubject = subject?.toString().trim() || `Re: Ärende #${ticket.ticket_number}`;
    const baseBody = rawBodyInput.toString().trim();
    const language = getLanguage(ticket);

    const [translatedSubject, translatedBody] = await Promise.all([
      translateIfNeeded(baseSubject, language, { allowEnglish: true }),
      translateIfNeeded(baseBody, language, { allowEnglish: true }),
    ]);
    const resolvedSubject = translatedSubject?.toString().trim() || baseSubject;
    const replyToken = generateReplyToken();
    const resolvedBody = appendReplyGuidance(translatedBody?.toString().trim() || baseBody, language, replyToken);
    if (!resolvedBody) {
      return res.status(400).json({ error: 'Meddelandetext saknas efter översättning.' });
    }

    await sendEmail({
      to: ticket.customer_email,
      subject: resolvedSubject,
      body: resolvedBody,
    });

    const inserted = await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, ticket_id, channel, direction, sender_user, to_number, from_number, subject, body, provider, provider_id, created_at`,
      [ticket.id, 'email', 'outbound', sender, ticket.customer_email, resolvedSubject, resolvedBody, replyToken, 'smtp']
    );

    await query(
      `UPDATE service_tickets
       SET last_staff_contact_at = NOW(),
           last_staff_contact_by = $2,
           last_staff_contact_channel = 'email'
       WHERE id = $1`,
      [ticket.id, sender]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    console.error('POST /api/tickets/:id/messages error:', error);
    res.status(500).json({ error: 'Kunde inte skicka meddelandet.' });
  }
});

app.post('/api/tickets/:id/messages/ai-suggest', requireAuth, requireRole('service'), async (req, res) => {
  try {
    if (!DEEPSEEK_API_KEY) {
      return res.status(400).json({ error: 'DEEPSEEK_API_KEY saknas.' });
    }

    const { id } = req.params;
    const { draft = '' } = req.body || {};
    const sender = req.user?.email || 'okänd';
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1', [id]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = getLanguage(ticket);
    const settings = await getAdminMessageSettings();
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

app.post('/api/tickets/:id/actions/standardize', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { id } = req.params;
    const { planned_actions: plannedActions = '' } = req.body || {};
    const sourceText = String(plannedActions || '').trim();
    if (!sourceText) {
      return res.status(400).json({ error: 'planned_actions krävs.' });
    }

    const { rows } = await query('SELECT id FROM service_tickets WHERE id = $1', [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Ärende hittades inte.' });
    }

    // Deterministic local fallback
    const fallbackChecklist = sourceText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) =>
        line
          .split(/(?<=[.!?])\s+/)
          .map((part) => part.trim())
          .filter(Boolean)
      )
      .map((line) => line.replace(/^[-*•]\s*/, ''))
      .filter(Boolean)
      .map((line) => `- ${line}`)
      .join('\n');

    if (!DEEPSEEK_API_KEY) {
      return res.json({ ok: true, standardized_actions: fallbackChecklist || sourceText, via: 'fallback' });
    }

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
              'Convert planned repair actions into a concise performed-actions checklist. Keep the same language as input. Return plain text only with one bullet per line starting with "- ". Do not add explanations.',
          },
          {
            role: 'user',
            content: `Planned actions:\n${sourceText}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('Standardize actions AI failed:', response.status, details);
      return res.json({ ok: true, standardized_actions: fallbackChecklist || sourceText, via: 'fallback' });
    }

    const data = await response.json();
    const aiText = data?.choices?.[0]?.message?.content?.trim() || '';
    const standardized =
      aiText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith('- ') ? line : `- ${line.replace(/^[-*•]\s*/, '')}`))
        .join('\n') || fallbackChecklist || sourceText;

    return res.json({ ok: true, standardized_actions: standardized, via: 'ai' });
  } catch (error) {
    console.error('POST /api/tickets/:id/actions/standardize error:', error);
    return res.status(500).json({ error: 'Kunde inte standardisera åtgärder.' });
  }
});

app.post('/api/tickets/:id/actions/translate', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { id } = req.params;
    const { text = '', language = 'sv' } = req.body || {};
    const sourceText = String(text || '').trim();
    if (!sourceText) return res.status(400).json({ error: 'text krävs.' });

    const { rows } = await query('SELECT id FROM service_tickets WHERE id = $1', [id]);
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

app.get('/api/admin/message-settings', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const settings = await getAdminMessageSettings();
    res.json(settings);
  } catch (error) {
    console.error('GET /api/admin/message-settings error:', error);
    res.status(500).json({ error: 'Kunde inte hämta meddelandeinställningar.' });
  }
});

app.put('/api/admin/message-settings', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const settings = mergeMessageSettings(req.body || {});
    const { rows } = await query(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
       RETURNING value_json`,
      ['message_templates', JSON.stringify(settings)]
    );
    void autoTranslateMessageSettings(settings)
      .then(async (translatedSettings) => {
        await query(
          `INSERT INTO app_settings (key, value_json, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
          ['message_templates', JSON.stringify(translatedSettings)]
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

app.post('/api/admin/message-settings/auto-translate', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const current = await getAdminMessageSettings();
    const translated = await autoTranslateMessageSettings(current);
    const { rows } = await query(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
       RETURNING value_json`,
      ['message_templates', JSON.stringify(translated)]
    );
    res.json(rows[0]?.value_json || translated);
  } catch (error) {
    console.error('POST /api/admin/message-settings/auto-translate error:', error);
    res.status(500).json({ error: 'Kunde inte auto-översätta meddelandeinställningar.' });
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
    const messageSettings = await getAdminMessageSettings();
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

    return res.json({ ok: true, language, ...preview });
  } catch (error) {
    console.error('POST /api/preview-notification error:', error);
    return res.status(500).json({
      error: 'Kunde inte generera förhandsvisning.',
      details: error?.message || 'Okänt fel',
    });
  }
});

app.post('/api/notify/cost-proposal', requireAuth, requireRole('service'), async (req, res) => {
  try {
    const { ticketId, channel, language: requestedLanguage } = req.body || {};
    const { rows } = await query('SELECT * FROM service_tickets WHERE id = $1', [ticketId]);
    const ticket = rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ärende hittades inte.' });

    const language = requestedLanguage || getLanguage(ticket);
    const replyToken = generateReplyToken();
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language, { strict: language !== 'sv' });
    const messageSettings = await getAdminMessageSettings();
    const preview = await buildNotificationPreview({
      templateType: 'kostnadsforslag',
      ticket: localizedTicket,
      language,
      settings: messageSettings,
      replyToken,
    });
    const message = preview.sms;
    const translatedBody = preview.body;
    const translatedSubject = preview.subject;
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
          `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
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
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
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

      const preferred = resolvePreferredContactChannel(ticket);
      const trySmsFirst = preferred === 'sms' || (preferred !== 'email' && ticket.customer_phone && !ticket.customer_email);

      if (trySmsFirst && ticket.customer_phone) {
        try {
          const smsResponse = await sendSms({
            to: ticket.customer_phone,
            message,
          });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
          );
          delivery.sms_sent = true;
        } catch (error) {
          console.error('SMS send failed (cost-proposal/auto preferred):', error);
          delivery.warnings.push('SMS kunde inte skickas.');
        }
      }

      if (!delivery.sms_sent && ticket.customer_email) {
        try {
          await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
          );
          delivery.email_sent = true;
        } catch (error) {
          console.error('Email send failed (cost-proposal/auto preferred):', error);
          delivery.warnings.push('E-post kunde inte skickas.');
        }
      }

      if (!trySmsFirst && !delivery.email_sent && ticket.customer_phone) {
        try {
          const smsResponse = await sendSms({
            to: ticket.customer_phone,
            message,
          });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
          );
          delivery.sms_sent = true;
        } catch (error) {
          console.error('SMS fallback failed (cost-proposal/auto preferred):', error);
          delivery.warnings.push('SMS kunde inte skickas.');
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
        `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
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
    const replyToken = generateReplyToken();
    if (requestedLanguage && requestedLanguage !== ticket.disclaimer_language) {
      await query(`UPDATE service_tickets SET disclaimer_language = $1 WHERE id = $2`, [requestedLanguage, ticket.id]);
    }
    const localizedTicket = await localizeTicketFreeText(ticket, language, { strict: language !== 'sv' });
    const messageSettings = await getAdminMessageSettings();
    const preview = await buildNotificationPreview({
      templateType: 'reparationFardig',
      ticket: localizedTicket,
      language,
      settings: messageSettings,
      replyToken,
    });
    const message = preview.sms;
    const translatedBody = preview.body;
    const translatedSubject = preview.subject;
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
          `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
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
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
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

      const preferred = resolvePreferredContactChannel(ticket);
      const trySmsFirst = preferred === 'sms' || (preferred !== 'email' && ticket.customer_phone && !ticket.customer_email);

      if (trySmsFirst && ticket.customer_phone) {
        try {
          const smsResponse = await sendSms({
            to: ticket.customer_phone,
            message,
          });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
          );
          delivery.sms_sent = true;
        } catch (error) {
          console.error('SMS send failed (repair-ready/auto preferred):', error);
          delivery.warnings.push('SMS kunde inte skickas.');
        }
      }

      if (!delivery.sms_sent && ticket.customer_email) {
        try {
          await sendEmail({ to: ticket.customer_email, subject: translatedSubject, body: translatedBody });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
          );
          delivery.email_sent = true;
        } catch (error) {
          console.error('Email send failed (repair-ready/auto preferred):', error);
          delivery.warnings.push('E-post kunde inte skickas.');
        }
      }

      if (!trySmsFirst && !delivery.email_sent && ticket.customer_phone) {
        try {
          const smsResponse = await sendSms({
            to: ticket.customer_phone,
            message,
          });
          await query(
            `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, body, provider, provider_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [ticket.id, 'sms', 'outbound', sender, ticket.customer_phone, message, '46elks', smsResponse?.id || null]
          );
          delivery.sms_sent = true;
        } catch (error) {
          console.error('SMS fallback failed (repair-ready/auto preferred):', error);
          delivery.warnings.push('SMS kunde inte skickas.');
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
        `INSERT INTO message_logs (ticket_id, channel, direction, sender_user, to_number, subject, body, reply_token, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ticket.id, 'email', 'outbound', sender, ticket.customer_email, translatedSubject, translatedBody, replyToken, 'smtp']
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
      for (let attempt = 1; attempt <= 6 && !inbound.text; attempt += 1) {
        try {
          const received = await loadResendReceivedEmail(inbound.emailId);
          inbound.text = extractInboundText(received) || inbound.text;
          if (!inbound.text && attempt < 6) {
            await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
          }
          if (!inbound.text && attempt === 6) {
            console.warn('Resend inbound email has no extractable text body', {
              emailId: inbound.emailId,
              receivedKeys: received ? Object.keys(received) : [],
            });
          }
        } catch (error) {
          if (attempt === 6) {
            console.error('Resend receiving fetch failed:', error);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
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

    const rawInboundText = inbound.text && typeof inbound.text === 'string' ? inbound.text : '';
    const extractedReply = extractTopReply(rawInboundText || inbound.subject || '');
    const cleanedReplyText = cleanVisibleReplyText(extractedReply.text || '');
    const inboundReplyText = cleanedReplyText || extractedReply.text || (inbound.subject || '');
    if (!ticket) {
      await query(
        `INSERT INTO message_logs (channel, direction, from_number, to_number, subject, body, raw_body, parse_method, parse_confidence, message_id, in_reply_to, references_header, reply_token, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          'email',
          'inbound',
          inbound.from,
          inbound.to || null,
          inbound.subject || null,
          inboundReplyText || null,
          rawInboundText || null,
          extractedReply.method,
          extractedReply.confidence,
          inbound.messageId || null,
          inbound.inReplyTo || null,
          inbound.referencesHeader || null,
          extractedReply.replyToken || null,
          inbound.provider,
        ]
      );
      return res.json({ ok: true, matched: false });
    }

    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, from_number, to_number, subject, body, raw_body, parse_method, parse_confidence, message_id, in_reply_to, references_header, reply_token, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        ticket.id,
        'email',
        'inbound',
        inbound.from,
        inbound.to || null,
        inbound.subject || null,
        inboundReplyText || null,
        rawInboundText || null,
        extractedReply.method,
        extractedReply.confidence,
        inbound.messageId || null,
        inbound.inReplyTo || null,
        inbound.referencesHeader || null,
        extractedReply.replyToken || null,
        inbound.provider,
      ]
    );

    let decision = parseApprovalDecision(inboundReplyText);
    if (!decision && !inbound.text && req.rawBody) {
      const fallbackSnippet = extractReplySnippetFromRawWebhook(req.rawBody);
      if (fallbackSnippet) {
        decision = parseApprovalDecision(extractTopReplyText(fallbackSnippet));
      }
    }
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
        ['Kostnadsförslag godkänt', ticket.id, inboundReplyText]
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
        ['Kostnadsförslag nekat', ticket.id, inboundReplyText]
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
         SET last_customer_decision = 'pending',
             last_customer_response_text = $2,
             last_customer_response_channel = 'email',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, inboundReplyText]
      );
      try {
        await sendDecisionClarification({
          ticket,
          channel: 'email',
          emailTo: inbound.from,
        });
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
    const messageWithSwedish = await maybeAppendSwedishTranslation(ticket, message);

    if (!ticket) {
      await query(
        `INSERT INTO message_logs (channel, direction, from_number, body, provider)
         VALUES ($1,$2,$3,$4,$5)`,
        ['sms', 'inbound', from, messageWithSwedish, '46elks']
      );
      return res.json({ ok: true });
    }

    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, from_number, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ticket.id, 'sms', 'inbound', from, messageWithSwedish, '46elks']
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
         SET last_customer_decision = 'pending',
             last_customer_response_text = $2,
             last_customer_response_channel = 'sms',
             last_customer_response_at = NOW()
         WHERE id = $1`,
        [ticket.id, message]
      );
      try {
        await sendDecisionClarification({
          ticket,
          channel: 'sms',
          smsTo: from,
        });
      } catch (error) {
        console.error('SMS clarification send failed (unknown):', error);
      }
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

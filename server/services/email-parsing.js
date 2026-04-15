// ---------------------------------------------------------------------------
// Email parsing & reply-extraction helpers
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { query } from '../db.js';
import { RESEND_API_KEY, EMAIL_INBOUND_PROVIDER } from '../lib/constants.js';

// Lazy-init resend client (created once on first use)
let _resendClient;
const getResendClient = () => {
  if (_resendClient === undefined) {
    _resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
  }
  return _resendClient;
};

// ---------------------------------------------------------------------------
// Language-specific reply markers
// ---------------------------------------------------------------------------
export const REPLY_MARKER_BY_LANGUAGE = {
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

export const REPLY_HINT_BY_LANGUAGE = {
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

export const REPLY_DIRECT_BY_LANGUAGE = {
  sv: 'Du kan svara direkt på detta meddelande.',
  en: 'You can reply directly to this message.',
  ar: 'يمكنك الرد مباشرة على هذه الرسالة.',
  es: 'Puede responder directamente a este mensaje.',
  fi: 'Voit vastata tähän viestiin suoraan.',
  ku: 'Tu dikarî rasterast bersiva vê peyamê bidî.',
  tr: 'Bu mesajı doğrudan yanıtlayabilirsiniz.',
  pl: 'Możesz odpowiedzieć bezpośrednio na tę wiadomość.',
  uk: 'Ви можете відповісти безпосередньо на це повідомлення.',
};

// ---------------------------------------------------------------------------
// Delimiters & regex patterns
// ---------------------------------------------------------------------------
export const OUTBOUND_BLOCK_DELIMITER = '----------<>----------';
export const EMAIL_REPLY_MARKERS = [...Object.values(REPLY_MARKER_BY_LANGUAGE), ...Object.values(REPLY_HINT_BY_LANGUAGE)].map((line) =>
  line.toLowerCase()
);
// Match both legacy RECOMPUTE_* and new SVC_* markers for backward compat
export const REPLY_TOKEN_REGEX = /(?:RECOMPUTE|SVC)[_-]?REPLY[_-]?START[:\s_-]*([a-z0-9-]{6,64})/i;
export const OUTBOUND_BLOCK_START_REGEX = /(?:RECOMPUTE|SVC)[_-]?OUTBOUND[_-]?START[:\s_-]*([a-z0-9-]{6,64})/i;
export const OUTBOUND_BLOCK_END_REGEX = /(?:RECOMPUTE|SVC)[_-]?OUTBOUND[_-]?END[:\s_-]*([a-z0-9-]{6,64})/i;
export const QUOTE_HEADER_REGEX = /(^|\n)\s*(on .+wrote:|den .+skrev:|från:|from:|skickat:|sent:|till:|to:|am .+schrieb|el .+escribi[oó]|le .+a écrit)/i;

// ---------------------------------------------------------------------------
// Marker / token line helpers
// ---------------------------------------------------------------------------
export const getReplyMarkerLine = (language = 'sv') => REPLY_MARKER_BY_LANGUAGE[language] || REPLY_MARKER_BY_LANGUAGE.sv;
export const getReplyHintLine = (language = 'sv') => REPLY_HINT_BY_LANGUAGE[language] || REPLY_HINT_BY_LANGUAGE.sv;
export const getReplyDirectLine = (language = 'sv') => REPLY_DIRECT_BY_LANGUAGE[language] || REPLY_DIRECT_BY_LANGUAGE.sv;
export const getReplyTokenLine = (replyToken = '') =>
  replyToken ? `--- SVC_REPLY_START:${replyToken} ---` : '--- SVC_REPLY_START ---';
export const getOutboundStartLine = (replyToken = '') =>
  `${OUTBOUND_BLOCK_DELIMITER} SVC_OUTBOUND_START${replyToken ? `:${replyToken}` : ''} ${OUTBOUND_BLOCK_DELIMITER}`;
export const getOutboundEndLine = (replyToken = '') =>
  `${OUTBOUND_BLOCK_DELIMITER} SVC_OUTBOUND_END${replyToken ? `:${replyToken}` : ''} ${OUTBOUND_BLOCK_DELIMITER}`;
export const generateReplyToken = () => crypto.randomBytes(6).toString('hex');

// ---------------------------------------------------------------------------
// Reply guidance
// ---------------------------------------------------------------------------
export const appendReplyGuidance = (body = '', language = 'sv', replyToken = '') => {
  const directReplyLine = getReplyDirectLine(language);
  const tokenLine = getReplyTokenLine(replyToken);
  const outboundStart = getOutboundStartLine(replyToken);
  const outboundEnd = getOutboundEndLine(replyToken);
  const normalizedBody = String(body || '').trim();
  const bodyWithoutAnyMarker = normalizedBody
    .split('\n')
    .filter((line) => !EMAIL_REPLY_MARKERS.includes(line.trim().toLowerCase()))
    .join('\n')
    .trim();
  return `${outboundStart}\n${bodyWithoutAnyMarker}\n\n${directReplyLine}\n${outboundEnd}\n${tokenLine}`.trim();
};

// ---------------------------------------------------------------------------
// Machine-line detection & stripping
// ---------------------------------------------------------------------------
export const isMachineReplyLine = (line = '') => {
  const normalizedLine = String(line || '').trim();
  if (!normalizedLine) return false;
  if (normalizedLine === OUTBOUND_BLOCK_DELIMITER) return true;
  return (
    OUTBOUND_BLOCK_START_REGEX.test(normalizedLine) ||
    OUTBOUND_BLOCK_END_REGEX.test(normalizedLine) ||
    REPLY_TOKEN_REGEX.test(normalizedLine)
  );
};

export const stripReplySystemLines = (body = '') =>
  String(body || '')
    .split('\n')
    .filter((line) => !isMachineReplyLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
export const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const buildEmailHtml = (body = '') => {
  const lines = String(body || '').split('\n');
  const machineLines = lines.filter((line) => isMachineReplyLine(line));
  const visibleBody = stripReplySystemLines(body);
  const visibleHtml = escapeHtml(visibleBody).replace(/\n/g, '<br>');
  const hiddenHtml = machineLines.length
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;opacity:0;mso-hide:all;">${escapeHtml(machineLines.join('\n')).replace(/\n/g, '<br>')}</div>`
    : '';

  return `${hiddenHtml}<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.6;color:#111827;white-space:normal;">${visibleHtml}</div>`;
};

// ---------------------------------------------------------------------------
// SMS dedup helpers
// ---------------------------------------------------------------------------
export const getInboundSmsProviderId = (payload = {}) => {
  const candidates = [
    payload.id,
    payload.smsid,
    payload.message_id,
    payload.messageid,
    payload.sid,
  ];
  const found = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return found ? String(found).trim() : null;
};

export const isDuplicateInboundSms = async (
  { ticketId = null, from = '', body = '', providerId = null },
  dbQuery = query
) => {
  if (providerId) {
    const existing = await dbQuery(
      `SELECT id FROM message_logs
       WHERE channel = 'sms'
         AND direction = 'inbound'
         AND provider = '46elks'
         AND provider_id = $1
       LIMIT 1`,
      [providerId]
    );
    if (existing.rowCount > 0) return true;
  }

  const duplicate = await dbQuery(
    `SELECT id FROM message_logs
     WHERE channel = 'sms'
       AND direction = 'inbound'
       AND provider = '46elks'
       AND COALESCE(ticket_id::text, '') = COALESCE($1::text, '')
       AND COALESCE(from_number, '') = COALESCE($2, '')
       AND COALESCE(body, '') = COALESCE($3, '')
       AND created_at >= NOW() - INTERVAL '2 minutes'
     LIMIT 1`,
    [ticketId, from, body]
  );
  return duplicate.rowCount > 0;
};

// ---------------------------------------------------------------------------
// Reply extraction
// ---------------------------------------------------------------------------
export const extractTopReply = (rawMessage = '') => {
  const message = String(rawMessage || '').replace(/\r/g, '').trim();
  if (!message) return { text: '', method: 'empty', confidence: 'low', replyToken: null };

  const tokenMatch = message.match(REPLY_TOKEN_REGEX);
  if (tokenMatch?.index !== undefined) {
    const text = message.slice(0, tokenMatch.index).trim() || message;
    return { text, method: 'reply_token', confidence: 'high', replyToken: tokenMatch[1] || null };
  }

  const lower = message.toLowerCase();
  let cutoff = lower.length;

  const outboundStartMatch = message.match(OUTBOUND_BLOCK_START_REGEX);
  if (outboundStartMatch?.index !== undefined) {
    const text = message.slice(0, outboundStartMatch.index).trim() || message;
    return { text, method: 'outbound_start', confidence: 'high', replyToken: outboundStartMatch[1] || null };
  }

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

export const cleanVisibleReplyText = (raw = '') => {
  const input = String(raw || '').replace(/\r/g, '').trim();
  if (!input) return '';

  const lines = input.split('\n');
  const cleaned = [];

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (REPLY_TOKEN_REGEX.test(trimmed)) break;
    if (OUTBOUND_BLOCK_START_REGEX.test(trimmed)) break;
    if (OUTBOUND_BLOCK_END_REGEX.test(trimmed)) break;
    if (EMAIL_REPLY_MARKERS.includes(lower)) break;
    if (/^---\s*(?:recompute|svc)[_-]?reply[_-]?start/i.test(trimmed)) break;
    if (/^[-<> ]*(?:recompute|svc)[_-]?outbound[_-]?(start|end)/i.test(trimmed)) break;
    if (/^[-_]{2,}\s*(svara ovanf[oö]r denna linje|reply above this line)\s*[-_]{2,}$/i.test(trimmed)) break;
    if (QUOTE_HEADER_REGEX.test(`\n${trimmed}`)) break;
    if (/^(från:|from:|skickat:|sent:|till:|to:|ämne:|subject:)/i.test(trimmed)) break;
    if (trimmed.startsWith('>')) break;
    if (/^[-_]{2,}\s*(original message|ursprungligt meddelande|forwarded message)/i.test(trimmed)) break;

    cleaned.push(line);
  }

  return cleaned.join('\n').trim();
};

export const extractTopReplyText = (rawMessage = '') => {
  const extracted = extractTopReply(rawMessage).text;
  const cleaned = cleanVisibleReplyText(extracted);
  return cleaned || extracted;
};

// ---------------------------------------------------------------------------
// Approval decision parser (multilingual yes/no)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Regex-based fallback decision parser
// ---------------------------------------------------------------------------
const parseApprovalDecisionRegex = (message) => {
  const cutMarkers = [
    '\n>', '\n--', '\nfrån:', '\nfrom:', '\non ', '\nden ',
    '\nle ', '\nam ', '\nel ', '\nكتب ', '\nwrote:', '\nskrev:',
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
    /\bja\b/, /\byes\b/, /\byep\b/, /\byeah\b/, /\byup\b/,
    /\bok\b/, /\bokej\b/, /\bokay\b/, /\bgodkann\w*\b/,
    /\bapprove\w*\b/, /\baccept\w*\b/, /\bproceed\w*\b/,
    /\bcontinue\w*\b/, /\bgo on\b/, /\bgo ahead\b/, /\bdo it\b/,
    /\bkor\b/, /\bsi\b/, /\bsi claro\b/, /\bev(et)?\b/, /\btak\b/,
    /\bkylla\b/, /\bere\b/, /\bta(k)?\b/, /\bniam\b/, /\bnaam\b/,
    /\bvisst\b/, /\babsolut\b/, /\bsjalvklart\b/, /\bgor det\b/,
    /\bdet gar bra\b/, /\bdet ar ok\b/, /\bsure\b/, /\bof course\b/,
    /\bfine\b/, /\bagree\w*\b/, /\bconfirm\w*\b/, /\bdet funkar\b/,
    /\bsjakert\b/, /\bklart\b/, /\bkor pa\b/, /\bkor igång\b/,
    /(^|\s)نعم(\s|$)/u, /(^|\s)اي(\s|$)/u, /(^|\s)أيوه(\s|$)/u,
    /(^|\s)ايوه(\s|$)/u, /(^|\s)اوكي(\s|$)/u, /(^|\s)موافق(\s|$)/u,
    /(^|\s)موافقه(\s|$)/u, /(^|\s)تاک(\s|$)/u, /(^|\s)так(\s|$)/u,
    /(^|\s)да(\s|$)/u, /(^|\s)موافق\w*(\s|$)/u, /(^|\s)تمام(\s|$)/u,
  ];
  const noPatterns = [
    /\bnej\b/, /\bno\b/, /\bnope\b/, /\bnah\b/, /\bavboj\w*\b/,
    /\bdeclin\w*\b/, /\breject\w*\b/, /\bdon t approve\b/,
    /\bdo not approve\b/, /\bdon t proceed\b/, /\bdo not proceed\b/,
    /\bnot now\b/, /\bnot interested\b/, /\bcancel\w*\b/, /\bstop\b/,
    /\bnon\b/, /\bhayir\b/, /\bhayr\b/, /\bnie\b/,
    /\bfor dyrt\b/, /\binte vart\b/, /\binte intresserad\b/,
    /\btoo expensive\b/, /\bnot worth\b/, /\bskip\b/,
    /(^|\s)لا(\s|$)/u, /(^|\s)كلا(\s|$)/u, /(^|\s)مو(\s|$)/u,
    /(^|\s)ليس(\s|$)/u, /(^|\s)غير موافق(\s|$)/u,
    /(^|\s)niet(\s|$)/u, /(^|\s)ні(\s|$)/u, /(^|\s)ніт(\s|$)/u,
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

// ---------------------------------------------------------------------------
// AI-powered decision parsing (DeepSeek) with regex fallback
// ---------------------------------------------------------------------------
const AI_DECISION_PROMPT = `You are a customer reply classifier for a repair service.
The customer was asked to approve or decline a cost proposal for repairing their device.
Classify the customer's reply as exactly one of: YES, NO, or UNKNOWN.

Rules:
- YES = the customer approves, agrees, accepts, or says anything affirmative in any language
- NO = the customer declines, rejects, refuses, or says anything negative in any language
- UNKNOWN = the reply is ambiguous, asks a question, or is unrelated

Reply with ONLY one word: YES, NO, or UNKNOWN. Nothing else.`;

const classifyWithAI = async (customerReply) => {
  const { DEEPSEEK_API_KEY, DEEPSEEK_MODEL } = await import('../lib/constants.js');
  if (!DEEPSEEK_API_KEY) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 5,
        temperature: 0,
        messages: [
          { role: 'system', content: AI_DECISION_PROMPT },
          { role: 'user', content: customerReply.slice(0, 500) },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = await response.json();
    const answer = (data?.choices?.[0]?.message?.content || '').trim().toUpperCase();

    if (answer === 'YES') return 'yes';
    if (answer === 'NO') return 'no';
    return null; // UNKNOWN or unexpected → fall through to regex
  } catch (error) {
    console.warn('AI decision classification failed, using regex fallback:', error?.message);
    return null;
  }
};

export const parseApprovalDecision = async (rawMessage = '') => {
  const message = cleanVisibleReplyText(extractTopReplyText(rawMessage));
  if (!message) return null;

  // Try AI classification first
  const aiDecision = await classifyWithAI(message);
  if (aiDecision) {
    console.log('Decision from AI:', aiDecision, '| message:', message.slice(0, 80));
    return aiDecision;
  }

  // Fallback to regex patterns
  const regexDecision = parseApprovalDecisionRegex(message);
  console.log('Decision from regex:', regexDecision, '| message:', message.slice(0, 80));
  return regexDecision;
};

// ---------------------------------------------------------------------------
// Object path helpers
// ---------------------------------------------------------------------------
export const readPath = (obj, path) =>
  path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

export const firstString = (obj, paths) => {
  for (const path of paths) {
    const value = readPath(obj, path);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

// ---------------------------------------------------------------------------
// HTML-to-text conversion
// ---------------------------------------------------------------------------
export const htmlToPlainText = (html = '') =>
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

// ---------------------------------------------------------------------------
// Text candidate extraction
// ---------------------------------------------------------------------------
export const collectTextCandidates = (value, keyPath = '', out = []) => {
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

export const pickBestTextCandidate = (candidates = []) => {
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

// ---------------------------------------------------------------------------
// Inbound text extraction
// ---------------------------------------------------------------------------
export const extractInboundText = (payload) => {
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

// ---------------------------------------------------------------------------
// Raw webhook snippet extraction
// ---------------------------------------------------------------------------
export const extractReplySnippetFromRawWebhook = (raw = '') => {
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

// ---------------------------------------------------------------------------
// Email address extraction
// ---------------------------------------------------------------------------
export const extractEmailAddress = (raw = '') => {
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const candidate = match ? match[1] : raw;
  return candidate.trim().toLowerCase();
};

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------
export const inferInboundProvider = (body) => {
  if (EMAIL_INBOUND_PROVIDER !== 'auto') return EMAIL_INBOUND_PROVIDER;
  if (body?.type?.toString().toLowerCase().includes('email') || body?.data?.from) return 'resend';
  if (body?.message?.payload || body?.gmail || body?.historyId) return 'gmail';
  return 'unknown';
};

// ---------------------------------------------------------------------------
// Inbound email payload parsing
// ---------------------------------------------------------------------------
export const parseInboundEmailPayload = (body) => {
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

// ---------------------------------------------------------------------------
// Ticket number extraction from subject/text
// ---------------------------------------------------------------------------
export const extractTicketNumber = (subject = '', text = '') => {
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

// ---------------------------------------------------------------------------
// Resend received-email loader
// ---------------------------------------------------------------------------
export const loadResendReceivedEmail = async (emailId) => {
  const resendClient = getResendClient();
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

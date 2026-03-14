// ---------------------------------------------------------------------------
// Ticket status constants
// ---------------------------------------------------------------------------
export const TICKET_STATUS = Object.freeze({
  NEW: 'Nytt',
  IN_PROGRESS: 'Pågående',
  WAITING_CUSTOMER: 'Väntar på kund',
  COST_PROPOSAL_SENT: 'Kostnadsförslag skickat',
  COST_PROPOSAL_APPROVED: 'Kostnadsförslag godkänt',
  COST_PROPOSAL_DECLINED: 'Kostnadsförslag nekat',
  REPAIR_DONE: 'Färdig',
  CUSTOMER_NOTIFIED: 'Kund meddelad',
  PICKED_UP: 'Uthämtad',
  CLOSED: 'Avslutad',
});

// ---------------------------------------------------------------------------
// Customer decision outcomes
// ---------------------------------------------------------------------------
export const CUSTOMER_DECISION = Object.freeze({
  APPROVED: 'approved',
  DECLINED: 'declined',
  PENDING: 'pending',
});

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
export const CHANNEL = Object.freeze({
  SMS: 'sms',
  EMAIL: 'email',
});

export const DIRECTION = Object.freeze({
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
});

// ---------------------------------------------------------------------------
// Role hierarchy
// ---------------------------------------------------------------------------
export const ROLE_RANK = Object.freeze({
  base: 1,
  service: 2,
  admin: 3,
});

export const canAccess = (role, minimumRole) =>
  (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimumRole] || 0);

// ---------------------------------------------------------------------------
// Branding & supported languages
// ---------------------------------------------------------------------------
export const BRAND_NAME = process.env.BRAND_NAME || 're:Compute-IT';
export const SUPPORTED_LANGUAGES = Object.freeze(['sv', 'en', 'ar', 'es', 'fi', 'ku', 'tr', 'pl', 'uk']);
export const TRANSLATION_PROTECTED_TERMS = Object.freeze([BRAND_NAME].filter(Boolean));

// ---------------------------------------------------------------------------
// External service config
// ---------------------------------------------------------------------------
export const API_KEY = process.env.API_KEY || '';
export const ELKS_API_USERNAME = process.env.ELKS_API_USERNAME || '';
export const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD || '';
export const ELKS_SMS_FROM = process.env.ELKS_SMS_FROM || '';
export const ELKS_WEBHOOK_SECRET = process.env.ELKS_WEBHOOK_SECRET || '';
export const SMS_DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || '+46';
export const EMAIL_WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || '';
export const EMAIL_INBOUND_PROVIDER = (process.env.EMAIL_INBOUND_PROVIDER || 'auto').toLowerCase();
export const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_FROM = process.env.SMTP_FROM || '';
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || '';

export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const RESEND_FROM = process.env.RESEND_FROM || '';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

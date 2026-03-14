import { SMS_DEFAULT_COUNTRY_CODE } from '../lib/constants.js';

export const normalizePhone = (phone) => {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.replace(/[^\d]/g, '')}`;
  }
  return trimmed.replace(/[^\d]/g, '');
};

export const toSmsNumber = (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  if (normalized.startsWith('+')) return normalized;
  if (normalized.startsWith('00')) return `+${normalized.slice(2)}`;
  if (normalized.startsWith('0')) return `${SMS_DEFAULT_COUNTRY_CODE}${normalized.slice(1)}`;
  if (/^\d+$/.test(normalized)) return `+${normalized}`;
  return normalized;
};

export const getLanguage = (ticket) => ticket?.disclaimer_language || 'sv';

export const normalizePreferredChannel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sms') return 'sms';
  if (normalized === 'email' || normalized === 'e-post') return 'email';
  return '';
};

export const resolvePreferredContactChannel = (ticketOrPayload = {}) => {
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

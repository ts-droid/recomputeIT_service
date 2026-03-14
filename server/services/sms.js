import { ELKS_API_USERNAME, ELKS_API_PASSWORD, ELKS_SMS_FROM } from '../lib/constants.js';
import { brandConfig } from '../lib/brand.js';
import { toSmsNumber } from './phone.js';

export const sendSms = async ({ to, message }) => {
  if (!ELKS_API_USERNAME || !ELKS_API_PASSWORD) {
    throw new Error('SMS credentials missing');
  }

  const smsTo = toSmsNumber(to);
  if (!/^\+\d{6,15}$/.test(smsTo)) {
    throw new Error(`Invalid phone number format for SMS: ${to}`);
  }

  const params = new URLSearchParams({
    from: ELKS_SMS_FROM || brandConfig.smsFrom,
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

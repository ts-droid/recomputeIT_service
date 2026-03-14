import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { Webhook as SvixWebhook } from 'svix';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  EMAIL_REPLY_TO,
  RESEND_API_KEY,
  RESEND_FROM,
  RESEND_WEBHOOK_SECRET,
} from '../lib/constants.js';
import { brandConfig } from '../lib/brand.js';

export const mailer = SMTP_HOST
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

export const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const resendWebhookVerifier = RESEND_WEBHOOK_SECRET
  ? new SvixWebhook(RESEND_WEBHOOK_SECRET)
  : null;

export const sendEmail = async ({ to, subject, body, html }) => {
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
        html: html || undefined,
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
        html: html || undefined,
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

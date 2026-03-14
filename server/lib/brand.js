// ---------------------------------------------------------------------------
// Server-side brand configuration
// ---------------------------------------------------------------------------
// Centralises branding so that outbound emails, SMS and future HTML templates
// all reference a single source of truth.  Every value can be overridden via
// an environment variable; if none is set, sensible defaults for the internal
// re:Compute-IT deployment are used.
// ---------------------------------------------------------------------------

const trim = (v) => String(v ?? '').trim();

const THEME_PRESETS = Object.freeze({
  forest: {
    primary: '#166534',
    primaryHover: '#14532d',
    primarySoft: '#dcfce7',
    accent: '#0f766e',
    panel: '#1f2937',
  },
  ocean: {
    primary: '#155e75',
    primaryHover: '#164e63',
    primarySoft: '#cffafe',
    accent: '#0f766e',
    panel: '#0f2c37',
  },
  navy: {
    primary: '#1e3a8a',
    primaryHover: '#1e40af',
    primarySoft: '#dbeafe',
    accent: '#0f766e',
    panel: '#172554',
  },
  graphite: {
    primary: '#334155',
    primaryHover: '#1f2937',
    primarySoft: '#e2e8f0',
    accent: '#475569',
    panel: '#1f2937',
  },
});

const DEFAULT = Object.freeze({
  name: 're:Compute-IT',
  supportEmail: 'kontakt@recompute.it',
  supportPhone: '016-5416700',
  logoUrl: '',
  faviconUrl: '',
  themePreset: 'forest',
});

const themeKey = trim(process.env.BRAND_THEME_PRESET).toLowerCase() || DEFAULT.themePreset;

export const brandConfig = Object.freeze({
  // Identity
  name: trim(process.env.BRAND_NAME) || DEFAULT.name,
  supportEmail: trim(process.env.SUPPORT_EMAIL) || DEFAULT.supportEmail,
  supportPhone: trim(process.env.SUPPORT_PHONE) || DEFAULT.supportPhone,

  // Visual (used in future branded HTML-emails)
  logoUrl: trim(process.env.BRAND_LOGO_URL) || DEFAULT.logoUrl,
  faviconUrl: trim(process.env.BRAND_FAVICON_URL) || DEFAULT.faviconUrl,
  themePreset: themeKey,
  theme: THEME_PRESETS[themeKey] || THEME_PRESETS.forest,

  // Outbound sender addresses (branding layer over raw env vars)
  smtpFrom: trim(process.env.SMTP_FROM) || trim(process.env.SMTP_USER) || '',
  emailReplyTo: trim(process.env.EMAIL_REPLY_TO) || '',
  resendFrom: trim(process.env.RESEND_FROM) || '',
  smsFrom: trim(process.env.ELKS_SMS_FROM) || '',
});

/**
 * Returns "supportEmail eller supportPhone" for use in customer-facing text.
 */
export const getSupportContactText = () => {
  const parts = [brandConfig.supportEmail, brandConfig.supportPhone].filter(Boolean);
  return parts.join(' eller ');
};

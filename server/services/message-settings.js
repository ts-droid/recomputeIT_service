import { query } from '../db.js';
import { SUPPORTED_LANGUAGES } from '../lib/constants.js';
import { translateIfNeeded } from './translation.js';

export const textTemplates = {
  costProposal: {
    sv: (ticket, amount) =>
      `Hej ${ticket.customer_name}!\nÄrende #${ticket.ticket_number} (${ticket.device_type}${ticket.device_model ? ` ${ticket.device_model}` : ''}).\nDiagnos: ${ticket.diagnosis || 'Se bifogad information från butik.'}\nKostnadsförslag: ${amount} kr.\nSvara JA för godkännande eller NEJ för att avböja.`,
    en: (ticket, amount) =>
      `Hi ${ticket.customer_name}!\nCase #${ticket.ticket_number} (${ticket.device_type}${ticket.device_model ? ` ${ticket.device_model}` : ''}).\nDiagnosis: ${ticket.diagnosis || 'See detailed info from the service desk.'}\nCost proposal: ${amount} SEK.\nReply YES to approve or NO to decline.`,
  },
  costProposalUpdate: {
    sv: (ticket, amount) =>
      `Hej ${ticket.customer_name}!\nÄrende #${ticket.ticket_number} (${ticket.device_type}${ticket.device_model ? ` ${ticket.device_model}` : ''}).\nVi har ett uppdaterat kostnadsförslag.\nDiagnos: ${ticket.diagnosis || 'Se bifogad information från butik.'}\nNytt kostnadsförslag: ${amount} kr.\nSvara JA för godkännande eller NEJ för att avböja.`,
    en: (ticket, amount) =>
      `Hi ${ticket.customer_name}!\nCase #${ticket.ticket_number} (${ticket.device_type}${ticket.device_model ? ` ${ticket.device_model}` : ''}).\nWe have an updated cost proposal.\nDiagnosis: ${ticket.diagnosis || 'See detailed info from the service desk.'}\nNew cost proposal: ${amount} SEK.\nReply YES to approve or NO to decline.`,
  },
  repairReady: {
    sv: (ticket) =>
      `Hej ${ticket.customer_name}!\nDin enhet för ärende #${ticket.ticket_number} är klar för upphämtning.\n${ticket.final_cost ? `Slutlig kostnad: ${ticket.final_cost} kr.\n` : ''}${ticket.work_done_summary ? `Utförda åtgärder: ${ticket.work_done_summary}\n` : ''}Välkommen in!`,
    en: (ticket) =>
      `Hi ${ticket.customer_name}!\nYour device for case #${ticket.ticket_number} is ready for pickup.\n${ticket.final_cost ? `Final cost: ${ticket.final_cost} SEK.\n` : ''}${ticket.work_done_summary ? `Work done: ${ticket.work_done_summary}\n` : ''}Welcome in!`,
  },
};

export const emailTemplates = {
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
  costProposalUpdate: {
    sv: (ticket, amount) => ({
      subject: `Uppdaterat kostnadsförslag för ärende #${ticket.ticket_number}`,
      body: `Hej ${ticket.customer_name},\n\nVi har ett uppdaterat kostnadsförslag för ditt ärende (#${ticket.ticket_number}).\nNy kostnad: ${amount} kr.`,
    }),
    en: (ticket, amount) => ({
      subject: `Updated cost proposal for case #${ticket.ticket_number}`,
      body: `Hi ${ticket.customer_name},\n\nWe have an updated cost proposal for your case (#${ticket.ticket_number}).\nNew cost: ${amount} SEK.`,
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

export const DEFAULT_MESSAGE_SETTINGS = {
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
  cost_update_prompt_by_lang: {
    sv: 'Vi har reviderat kostnadsförslaget. Svara JA för att godkänna det nya förslaget, eller NEJ för att avböja.',
    en: 'We have revised the cost proposal. Reply YES to approve the new proposal, or NO to decline.',
  },
  ready_prompt_by_lang: {
    sv: 'Har du frågor, svara på detta mail eller SMS.',
    en: 'If you have questions, reply to this email or SMS.',
  },
  decision_approved_sms_by_lang: {
    sv: 'Tack för förtroendet. Vi återkommer så snart reparationen är klar.',
    en: 'Thanks for your approval. We will contact you as soon as the repair is complete.',
  },
  decision_approved_email_subject_by_lang: {
    sv: 'Tack för ditt godkännande',
    en: 'Thank you for your approval',
  },
  decision_approved_email_body_by_lang: {
    sv: 'Tack för förtroendet. Vi återkommer så snart reparationen är klar.',
    en: 'Thanks for your approval. We will contact you as soon as the repair is complete.',
  },
  decision_declined_sms_by_lang: {
    sv: 'Tråkigt att höra. Har du frågor, kontakta oss på kontakt@recompute.it eller 016-5416700. Vi förbehåller oss rätten att kassera din inlämnade produkt om den inte upphämtas inom 7 dagar från nekat kostnadsförslag.',
    en: 'Sorry to hear that. Questions? Contact us at kontakt@recompute.it or 016-5416700. We reserve the right to discard uncollected products 7 days after a declined quote.',
  },
  decision_declined_email_subject_by_lang: {
    sv: 'Information om nekat kostnadsförslag',
    en: 'Information about declined quote',
  },
  decision_declined_email_body_by_lang: {
    sv: 'Tråkigt att höra.\n\nHar du frågor kan du kontakta oss på kontakt@recompute.it eller 016-5416700.\n\nVi förbehåller oss rätten att kassera din inlämnade produkt om den inte upphämtas inom 7 dagar från nekat kostnadsförslag.',
    en: 'Sorry to hear that.\n\nIf you have questions, contact us at kontakt@recompute.it or 016-5416700.\n\nWe reserve the right to discard uncollected products 7 days after a declined quote.',
  },
  decision_unclear_sms_by_lang: {
    sv: 'Vi kunde inte tolka ditt svar för ärende #{{ticket_number}}. Svara endast JA för godkänna eller NEJ för neka.',
    en: 'We could not interpret your response for case #{{ticket_number}}. Please reply with YES to approve or NO to decline.',
  },
  decision_unclear_email_subject_by_lang: {
    sv: 'Bekräfta svar för ärende #{{ticket_number}}',
    en: 'Please confirm your response for case #{{ticket_number}}',
  },
  decision_unclear_email_body_by_lang: {
    sv: 'Hej {{customer_name}},\n\nVi kunde inte tolka ditt senaste svar för ärende #{{ticket_number}}.\nSvara endast med JA för att godkänna kostnadsförslaget eller NEJ för att neka.\n\nTack!',
    en: 'Hi {{customer_name}},\n\nWe could not interpret your latest response for case #{{ticket_number}}.\nPlease reply with YES to approve the quote or NO to decline.\n\nThank you!',
  },
  ai_reply_assistant_prompt:
    'Du hjälper servicepersonal att svara kunder kort, tydligt och professionellt. Föreslå ett konkret svar som kan skickas direkt.',
  ai_message_suggestion_prompt:
    'Skapa ett tydligt kundmeddelande för serviceärende baserat på diagnos, kostnad, status och senaste kunddialog.',
  ai_work_done_prompt:
    'Du hjälper en servicetekniker att skriva utförda åtgärder baserat på planerade åtgärder. Formulera en kort, tydlig och professionell punktlista över det arbete som ska eller har utförts.',
  chat_default_language: 'sv',
};

export const mergeMessageSettings = (raw) => {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  const mergeByLang = (key) => ({
    ...DEFAULT_MESSAGE_SETTINGS[key],
    ...(parsed[key] && typeof parsed[key] === 'object' ? parsed[key] : {}),
  });
  return {
    email_footer_by_lang: mergeByLang('email_footer_by_lang'),
    sms_footer_by_lang: mergeByLang('sms_footer_by_lang'),
    cost_prompt_by_lang: mergeByLang('cost_prompt_by_lang'),
    cost_update_prompt_by_lang: mergeByLang('cost_update_prompt_by_lang'),
    ready_prompt_by_lang: mergeByLang('ready_prompt_by_lang'),
    decision_approved_sms_by_lang: mergeByLang('decision_approved_sms_by_lang'),
    decision_approved_email_subject_by_lang: mergeByLang('decision_approved_email_subject_by_lang'),
    decision_approved_email_body_by_lang: mergeByLang('decision_approved_email_body_by_lang'),
    decision_declined_sms_by_lang: mergeByLang('decision_declined_sms_by_lang'),
    decision_declined_email_subject_by_lang: mergeByLang('decision_declined_email_subject_by_lang'),
    decision_declined_email_body_by_lang: mergeByLang('decision_declined_email_body_by_lang'),
    decision_unclear_sms_by_lang: mergeByLang('decision_unclear_sms_by_lang'),
    decision_unclear_email_subject_by_lang: mergeByLang('decision_unclear_email_subject_by_lang'),
    decision_unclear_email_body_by_lang: mergeByLang('decision_unclear_email_body_by_lang'),
    ai_reply_assistant_prompt:
      parsed?.ai_reply_assistant_prompt || DEFAULT_MESSAGE_SETTINGS.ai_reply_assistant_prompt,
    ai_message_suggestion_prompt:
      parsed?.ai_message_suggestion_prompt || DEFAULT_MESSAGE_SETTINGS.ai_message_suggestion_prompt,
    ai_work_done_prompt:
      parsed?.ai_work_done_prompt || DEFAULT_MESSAGE_SETTINGS.ai_work_done_prompt,
    chat_default_language:
      parsed?.chat_default_language || DEFAULT_MESSAGE_SETTINGS.chat_default_language,
  };
};

export const getAdminMessageSettings = async (tenantId) => {
  if (tenantId) {
    const { rows } = await query(
      'SELECT value_json FROM app_settings WHERE tenant_id = $1 AND key = $2',
      [tenantId, 'message_templates']
    );
    return mergeMessageSettings(rows[0]?.value_json || {});
  }
  // Fallback for cases without tenant context (e.g. webhooks)
  const { rows } = await query('SELECT value_json FROM app_settings WHERE key = $1 LIMIT 1', ['message_templates']);
  return mergeMessageSettings(rows[0]?.value_json || {});
};

export const fillMissingTranslations = async (byLang = {}, options = {}) => {
  const { overwriteExisting = false } = options;
  const sourceSv = byLang?.sv?.toString().trim() || '';
  const sourceEn = byLang?.en?.toString().trim() || '';
  const sourceLanguage = sourceSv ? 'sv' : sourceEn ? 'en' : '';
  const sourceText = sourceLanguage === 'sv' ? sourceSv : sourceEn;
  if (!sourceText) return byLang;

  const next = { ...byLang };
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === sourceLanguage) continue;
    const existing = next?.[lang]?.toString().trim() || '';
    if (!overwriteExisting && existing) continue;
    next[lang] = await translateIfNeeded(sourceText, lang, { allowEnglish: true });
  }
  return next;
};

export const autoTranslateMessageSettings = async (settings = {}) => {
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
    cost_update_prompt_by_lang: await fillMissingTranslations(normalized.cost_update_prompt_by_lang, {
      overwriteExisting: true,
    }),
    ready_prompt_by_lang: await fillMissingTranslations(normalized.ready_prompt_by_lang, {
      overwriteExisting: true,
    }),
    decision_approved_sms_by_lang: await fillMissingTranslations(normalized.decision_approved_sms_by_lang, {
      overwriteExisting: true,
    }),
    decision_approved_email_subject_by_lang: await fillMissingTranslations(
      normalized.decision_approved_email_subject_by_lang,
      {
        overwriteExisting: true,
      }
    ),
    decision_approved_email_body_by_lang: await fillMissingTranslations(
      normalized.decision_approved_email_body_by_lang,
      {
        overwriteExisting: true,
      }
    ),
    decision_declined_sms_by_lang: await fillMissingTranslations(normalized.decision_declined_sms_by_lang, {
      overwriteExisting: true,
    }),
    decision_declined_email_subject_by_lang: await fillMissingTranslations(
      normalized.decision_declined_email_subject_by_lang,
      {
        overwriteExisting: true,
      }
    ),
    decision_declined_email_body_by_lang: await fillMissingTranslations(
      normalized.decision_declined_email_body_by_lang,
      {
        overwriteExisting: true,
      }
    ),
    decision_unclear_sms_by_lang: await fillMissingTranslations(normalized.decision_unclear_sms_by_lang, {
      overwriteExisting: true,
    }),
    decision_unclear_email_subject_by_lang: await fillMissingTranslations(
      normalized.decision_unclear_email_subject_by_lang,
      {
        overwriteExisting: true,
      }
    ),
    decision_unclear_email_body_by_lang: await fillMissingTranslations(
      normalized.decision_unclear_email_body_by_lang,
      {
        overwriteExisting: true,
      }
    ),
  };
};

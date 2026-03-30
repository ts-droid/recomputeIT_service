import { query } from '../db.js';
import { DEEPSEEK_API_KEY, DEEPSEEK_MODEL, BRAND_NAME } from '../lib/constants.js';
import { sendSms } from './sms.js';
import { sendEmail } from './email.js';
import { translateIfNeeded, translateText } from './translation.js';
import { getAdminMessageSettings, mergeMessageSettings, textTemplates, emailTemplates, DEFAULT_MESSAGE_SETTINGS, getFirstName } from './message-settings.js';
import { getLanguage } from './phone.js';
import { generateReplyToken, appendReplyGuidance, buildEmailHtml, escapeHtml, stripReplySystemLines } from './email-parsing.js';

const buildFallbackActionChecklist = (sourceText = '') =>
  String(sourceText || '')
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

const standardizeActionsText = async (sourceText = '', options = {}) => {
  const normalizedText = String(sourceText || '').trim();
  if (!normalizedText) return '';

  const fallbackChecklist = buildFallbackActionChecklist(normalizedText);
  if (!DEEPSEEK_API_KEY) {
    return { standardized: fallbackChecklist || normalizedText, via: 'fallback' };
  }

  try {
    const messageSettings =
      options?.messageSettings && typeof options.messageSettings === 'object'
        ? mergeMessageSettings(options.messageSettings)
        : await getAdminMessageSettings();
    const workDonePrompt =
      messageSettings?.ai_work_done_prompt || DEFAULT_MESSAGE_SETTINGS.ai_work_done_prompt;

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
            content: `${workDonePrompt}\n\nRules:\n- Keep the same language as input.\n- Return plain text only.\n- Use one bullet per line starting with "- ".\n- Do not add headings or explanations outside the list.`,
          },
          {
            role: 'user',
            content: `Planned actions:\n${normalizedText}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('Standardize actions AI failed:', response.status, details);
      return { standardized: fallbackChecklist || normalizedText, via: 'fallback' };
    }

    const data = await response.json();
    const aiText = data?.choices?.[0]?.message?.content?.trim() || '';
    const standardized =
      aiText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith('- ') ? line : `- ${line.replace(/^[-*•]\s*/, '')}`))
        .join('\n') || fallbackChecklist || normalizedText;

    return { standardized, via: 'ai' };
  } catch (error) {
    console.error('standardizeActionsText error:', error);
    return { standardized: fallbackChecklist || normalizedText, via: 'fallback' };
  }
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

const buildDecisionMessageTemplate = async ({ ticket, type, settings }) => {
  const language = getLanguage(ticket);
  const activeSettings = mergeMessageSettings(settings || {});
  const variables = {
    customer_name: ticket.customer_name || '',
    customer_first_name: getFirstName(ticket.customer_name),
    ticket_number: ticket.ticket_number || '',
    device_type: ticket.device_type || '',
    device_model: ticket.device_model || '',
    amount: ticket.final_cost || '',
    final_cost: ticket.final_cost || '',
  };

  const map = {
    approved: {
      sms: activeSettings.decision_approved_sms_by_lang,
      subject: activeSettings.decision_approved_email_subject_by_lang,
      body: activeSettings.decision_approved_email_body_by_lang,
    },
    declined: {
      sms: activeSettings.decision_declined_sms_by_lang,
      subject: activeSettings.decision_declined_email_subject_by_lang,
      body: activeSettings.decision_declined_email_body_by_lang,
    },
    unclear: {
      sms: activeSettings.decision_unclear_sms_by_lang,
      subject: activeSettings.decision_unclear_email_subject_by_lang,
      body: activeSettings.decision_unclear_email_body_by_lang,
    },
  };

  const selected = map[type];
  if (!selected) return { sms: '', subject: '', body: '' };

  const smsTemplate = await getLocalizedSetting(selected.sms, language);
  const subjectTemplate = await getLocalizedSetting(selected.subject, language);
  const bodyTemplate = await getLocalizedSetting(selected.body, language);

  return {
    sms: renderMessageSettingTemplate(smsTemplate, variables),
    subject: renderMessageSettingTemplate(subjectTemplate, variables),
    body: renderMessageSettingTemplate(bodyTemplate, variables),
  };
};

const sendDecisionAcknowledgement = async ({ ticket, decision, channel, smsTo, emailTo }) => {
  const settings = await getAdminMessageSettings();
  const template = await buildDecisionMessageTemplate({
    ticket,
    type: decision === 'yes' ? 'approved' : 'declined',
    settings,
  });

  if (channel === 'sms' && smsTo && template.sms) {
    await sendSms({ to: smsTo, message: template.sms });
    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ticket.id, 'sms', 'outbound', smsTo, template.sms, '46elks']
    );
    return;
  }

  if (channel === 'email' && emailTo && (template.subject || template.body)) {
    const plainBody = template.body || '';
    await sendEmail({
      to: emailTo,
      subject: template.subject || `Ärende #${ticket.ticket_number}`,
      body: plainBody,
      html: buildEmailHtml(plainBody),
    });
    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ticket.id, 'email', 'outbound', emailTo, template.subject || null, template.body || null, 'smtp']
    );
  }
};

const sendDecisionClarification = async ({ ticket, channel, smsTo, emailTo }) => {
  const settings = await getAdminMessageSettings();
  const template = await buildDecisionMessageTemplate({
    ticket,
    type: 'unclear',
    settings,
  });

  if (channel === 'sms' && smsTo && template.sms) {
    await sendSms({ to: smsTo, message: template.sms });
    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, to_number, body, provider)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ticket.id, 'sms', 'outbound', smsTo, template.sms, '46elks']
    );
    return;
  }

  if (channel === 'email' && emailTo && (template.subject || template.body)) {
    const language = getLanguage(ticket);
    const replyToken = generateReplyToken();
    const bodyWithMarker = appendReplyGuidance(template.body || '', language, replyToken);
    await sendEmail({
      to: emailTo,
      subject: template.subject || `Ärende #${ticket.ticket_number}`,
      body: bodyWithMarker,
      html: buildEmailHtml(bodyWithMarker),
    });
    await query(
      `INSERT INTO message_logs (ticket_id, channel, direction, to_number, subject, body, reply_token, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ticket.id, 'email', 'outbound', emailTo, template.subject || null, bodyWithMarker, replyToken, 'smtp']
    );
  }
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
    customer_first_name: getFirstName(localizedTicket.customer_name),
    ticket_number: localizedTicket.ticket_number || '',
    device_type: localizedTicket.device_type || '',
    device_model: localizedTicket.device_model || '',
    diagnosis: localizedTicket.diagnosis || '',
    work_done: localizedTicket.work_done_summary || '',
    amount: localizedTicket.final_cost || '',
    final_cost: localizedTicket.final_cost || '',
  };

  if (templateType === 'kostnadsforslag' || templateType === 'kostnadsforslag_uppdatering') {
    const isUpdate = templateType === 'kostnadsforslag_uppdatering';
    const amount = ticket.final_cost || '—';
    const templateKey = isUpdate ? 'costProposalUpdate' : 'costProposal';
    const promptKey = isUpdate ? 'cost_update_prompt_by_lang' : 'cost_prompt_by_lang';
    const messageBase =
      textTemplates[templateKey]?.[language]?.(localizedTicket, amount) ||
      textTemplates[templateKey]?.sv(localizedTicket, amount) ||
      textTemplates.costProposal[language]?.(localizedTicket, amount) ||
      textTemplates.costProposal.sv(localizedTicket, amount);
    let sms = await translateIfNeeded(messageBase, language);
    const template =
      emailTemplates[templateKey]?.[language]?.(localizedTicket, amount) ||
      emailTemplates[templateKey]?.sv(localizedTicket, amount) ||
      emailTemplates.costProposal[language]?.(localizedTicket, amount) ||
      emailTemplates.costProposal.sv(localizedTicket, amount);
    const subject = await translateIfNeeded(template.subject, language);
    let body = await translateIfNeeded(template.body, language);
    const localizedCostPrompt = await getLocalizedSetting(activeSettings[promptKey] || activeSettings.cost_prompt_by_lang, language);
    body = appendUniqueBlock(body, renderMessageSettingTemplate(localizedCostPrompt, commonVariables));
    body = appendUniqueBlock(body, emailFooter);
    body = appendReplyGuidance(body, language, replyToken);
    sms = appendUniqueBlock(sms, smsFooter);
    return { subject, body, display_body: stripReplySystemLines(body), html: buildEmailHtml(body), sms };
  }

  if (templateType === 'ejReparerbar') {
    const messageBase =
      textTemplates.notRepairable?.[language]?.(localizedTicket) ||
      textTemplates.notRepairable?.sv(localizedTicket);
    let sms = await translateIfNeeded(messageBase, language);
    const template =
      emailTemplates.notRepairable?.[language]?.(localizedTicket) ||
      emailTemplates.notRepairable?.sv(localizedTicket);
    const subject = await translateIfNeeded(template.subject, language);
    let body = await translateIfNeeded(template.body, language);
    const localizedPrompt = await getLocalizedSetting(activeSettings.not_repairable_prompt_by_lang, language);
    body = appendUniqueBlock(body, renderMessageSettingTemplate(localizedPrompt, commonVariables));
    body = appendUniqueBlock(body, emailFooter);
    body = appendReplyGuidance(body, language, replyToken);
    sms = appendUniqueBlock(sms, smsFooter);
    return { subject, body, display_body: stripReplySystemLines(body), html: buildEmailHtml(body), sms };
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
  return { subject, body, display_body: stripReplySystemLines(body), html: buildEmailHtml(body), sms };
};

export {
  buildFallbackActionChecklist,
  standardizeActionsText,
  getLocalizedSetting,
  appendUniqueBlock,
  renderMessageSettingTemplate,
  buildDecisionMessageTemplate,
  sendDecisionAcknowledgement,
  sendDecisionClarification,
  localizeTicketFreeText,
  buildNotificationPreview,
};

import { query } from '../db.js';
import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL,
  TRANSLATION_PROTECTED_TERMS,
  SUPPORTED_LANGUAGES,
} from '../lib/constants.js';

export const getCachedTranslation = async (text, targetLanguage) => {
  const { rows } = await query(
    `SELECT translated_text
     FROM translation_cache
     WHERE source_text = $1 AND target_language = $2
     LIMIT 1`,
    [text, targetLanguage]
  );
  return rows[0]?.translated_text || '';
};

export const setCachedTranslation = async (text, targetLanguage, translatedText) => {
  await query(
    `INSERT INTO translation_cache (source_text, target_language, translated_text, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (source_text, target_language)
     DO UPDATE SET translated_text = EXCLUDED.translated_text, updated_at = NOW()`,
    [text, targetLanguage, translatedText]
  );
};

export const protectTermsForTranslation = (text, preserveTerms = []) => {
  const source = text?.toString() || '';
  let prepared = source;
  const replacements = [];

  [...new Set(preserveTerms.filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .forEach((term, index) => {
      if (!prepared.includes(term)) return;
      const token = `__PRESERVE_TERM_${index}__`;
      prepared = prepared.split(term).join(token);
      replacements.push([token, term]);
    });

  return { prepared, replacements };
};

export const restoreProtectedTerms = (text, replacements = []) =>
  replacements.reduce((value, [token, term]) => value.split(token).join(term), text?.toString() || '');

export const normalizeComparableText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isLikelySwedish = (text = '') => {
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

export const translateText = async (text, targetLanguage, options = {}) => {
  const { strict = false, preserveTerms = TRANSLATION_PROTECTED_TERMS } = options;
  if (!text || !targetLanguage) return text;
  if (targetLanguage === 'sv' && isLikelySwedish(text)) return text;

  const { prepared, replacements } = protectTermsForTranslation(text, preserveTerms);

  try {
    const cached = await getCachedTranslation(prepared, targetLanguage);
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
              'Translate the text into the requested target language. Keep numbers, names, case numbers, and placeholder tokens like __PRESERVE_TERM_0__ unchanged. Return only the translated text.',
          },
          {
            role: 'user',
            content: `Target language: ${targetLanguage}\nText: ${prepared}`,
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
    const finalText = restoreProtectedTerms(cleaned || text, replacements);
    if (finalText && finalText !== text) {
      try {
        await setCachedTranslation(prepared, targetLanguage, finalText);
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

export const translateIfNeeded = async (text, language, options = {}) => {
  const { allowEnglish = false, strict = false } = options;
  if (!text || !language) return text;

  // If target is Swedish, only translate when the text is NOT already Swedish
  if (language === 'sv') {
    if (isLikelySwedish(text)) return text;
    // Text is not Swedish — translate it to Swedish
    return translateText(text, 'sv', { strict });
  }

  if (language === 'en' && !allowEnglish) return text;
  return translateText(text, language, { strict });
};

export const maybeAppendSwedishTranslation = async (_ticket, text) => {
  if (!text) return text;
  if (isLikelySwedish(text)) return text;

  const translated = await translateText(text, 'sv');
  if (!translated) return text;
  if (normalizeComparableText(translated) === normalizeComparableText(text)) {
    return text;
  }
  return `${text}\n\n(Svenska: ${translated})`;
};

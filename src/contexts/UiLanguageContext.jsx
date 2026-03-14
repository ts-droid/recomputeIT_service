import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useUiTranslation } from '@/lib/uiTranslations';

const UiLanguageContext = createContext(undefined);

const STORAGE_KEY = 'recomputeit_ui_lang';

/**
 * Provides the current UI language and a translation object to the component tree.
 * Language defaults to 'sv' and is persisted in localStorage.
 */
export function UiLanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'sv';
    } catch {
      return 'sv';
    }
  });

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const t = useUiTranslation(language);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <UiLanguageContext.Provider value={value}>
      {children}
    </UiLanguageContext.Provider>
  );
}

/**
 * Returns the current UI language, a setter, and the translation object.
 *
 * @example
 *   const { t, language, setLanguage } = useUiLanguage();
 *   console.log(t.dashboard.logout); // 'Logga ut' or 'Log out'
 */
export function useUiLanguage() {
  const ctx = useContext(UiLanguageContext);
  if (!ctx) {
    throw new Error('useUiLanguage must be used within a UiLanguageProvider');
  }
  return ctx;
}

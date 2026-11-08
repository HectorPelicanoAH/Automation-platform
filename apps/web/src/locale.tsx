import React, { createContext, useContext, useEffect, useState } from 'react';
import es from './locales/es.json' with { type: 'json' };
export type Language = 'en' | 'es';
type Values = Record<string, string | number>;
const messages: Record<string, string> = es;
export function translate(language: Language, key: string, values: Values = {}) {
  const message =
    language === 'es'
      ? Object.hasOwn(messages, key.trim())
        ? key.replace(key.trim(), () => messages[key.trim()])
        : key
      : key;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
const Locale = createContext({
  language: 'en' as Language,
  setLanguage: (_: Language) => {},
  t: (key: string, values?: Values) => translate('en', key, values),
});
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <Locale.Provider
      value={{ language, setLanguage, t: (key, values) => translate(language, key, values) }}
    >
      {children}
    </Locale.Provider>
  );
}
export const useLocale = () => useContext(Locale);

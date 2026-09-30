// i18next with the ten catalogs from @kawase/i18n. The language comes from the user's choice (stored),
// else the phone's language, else English. Right-to-left is applied per screen tree with `Direction`,
// so changing language never needs a restart.
import { getLocales } from "expo-localization";
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@kawase/config";
import { CATALOGS } from "@kawase/i18n";

export type { SupportedLocale };

export function deviceLocale(): SupportedLocale {
  const code = getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
  return isSupportedLocale(code) ? code : DEFAULT_LOCALE;
}

const resources = Object.fromEntries(Object.entries(CATALOGS).map(([locale, catalog]) => [locale, { translation: catalog }]));

export function initI18n(locale: SupportedLocale) {
  if (i18next.isInitialized) {
    void i18next.changeLanguage(locale);
    return i18next;
  }
  void i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18next;
}

export function setLocale(locale: SupportedLocale) {
  return i18next.changeLanguage(locale);
}

export const useT = useTranslation;

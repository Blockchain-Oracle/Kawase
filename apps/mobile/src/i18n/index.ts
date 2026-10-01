// i18next with the ten catalogs from @kawase/i18n. The language comes from the user's choice (stored),
// else the phone's language, else English. Right-to-left is applied per screen tree with `Direction`,
// so changing language never needs a restart.
import { getLocales } from "expo-localization";
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@kawase/config";
import { CATALOGS } from "@kawase/i18n";

export type { SupportedLocale };

export function deviceLocale(): SupportedLocale {
  const code = getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
  return isSupportedLocale(code) ? code : DEFAULT_LOCALE;
}

/**
 * These lines name the owner's check, and the check differs by platform: Face ID or Touch ID on an iPhone (the
 * original words), a fingerprint or the screen lock on Android, a code from their email in a browser
 * (wallet/biometric.web.ts). On Android and the web each line is replaced by its `…Android` / `…Web` twin from the same
 * catalog when it has one, so no screen has to know the difference.
 */
const CHECK_WORDS = [
  "send.allowanceAbove",
  "send.allowanceOff",
  "send.allowanceStepUp",
  "send.allowanceUsdcOnly",
  "send.faceIdCancelled",
  "send.approvalUnavailable",
  "errors.biometricUnavailable",
  "story.boundsBody",
  "story.boundsAbove",
  "limits.offBody",
  "home.allowanceOffBody",
  "wallet.allowanceBody",
  "wallet.mainnetConsentBody",
  "setup.primerTitle",
  "setup.primerBody",
] as const;

const TWIN_SUFFIX: Partial<Record<typeof Platform.OS, string>> = { web: "Web", android: "Android" };

type Tree = { [key: string]: string | Tree };

function withCheckWords(catalog: Tree, suffix: string): Tree {
  const copy = JSON.parse(JSON.stringify(catalog)) as Tree;
  for (const path of CHECK_WORDS) {
    const [block, key] = path.split(".") as [string, string];
    const group = copy[block];
    if (typeof group === "object" && typeof group[`${key}${suffix}`] === "string") group[key] = group[`${key}${suffix}`]!;
  }
  return copy;
}

const twinSuffix = TWIN_SUFFIX[Platform.OS];
const resources = Object.fromEntries(
  Object.entries(CATALOGS).map(([locale, catalog]) => [
    locale,
    { translation: twinSuffix ? withCheckWords(catalog as unknown as Tree, twinSuffix) : catalog },
  ]),
);

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

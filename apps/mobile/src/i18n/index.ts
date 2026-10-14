// i18next with the catalogs from @kawase/i18n. The language comes from the user's choice (stored), else the phone's
// language, else English. English ships with the app; another language is loaded when it is first needed (on start,
// before the first screen, or when the person switches), so the first load carries one language, not ten.
// Right-to-left is applied per screen tree with `Direction`, so changing language never needs a restart.
import { getLocales } from "expo-localization";
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@kawase/config";
import { en } from "@kawase/i18n/en";
import { loadCatalog } from "@kawase/i18n/lazy";

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
    if (typeof group === "object" && typeof group[`${key}${suffix}`] === "string")
      group[key] = group[`${key}${suffix}`]!;
  }
  return copy;
}

const twinSuffix = TWIN_SUFFIX[Platform.OS];
const bundle = (catalog: unknown): Tree =>
  twinSuffix ? withCheckWords(catalog as Tree, twinSuffix) : (catalog as Tree);

/** Make sure a language's words are in i18next (English always is). */
async function ensureLocale(locale: SupportedLocale) {
  if (i18next.hasResourceBundle(locale, "translation")) return;
  const catalog = await loadCatalog(locale);
  i18next.addResourceBundle(locale, "translation", bundle(catalog), true, true);
}

export async function initI18n(locale: SupportedLocale) {
  if (!i18next.isInitialized)
    await i18next.use(initReactI18next).init({
      resources: { [DEFAULT_LOCALE]: { translation: bundle(en) } },
      lng: DEFAULT_LOCALE,
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  await setLocale(locale);
  return i18next;
}

export async function setLocale(locale: SupportedLocale) {
  // A language that fails to load leaves English on screen rather than blank keys.
  await ensureLocale(locale).catch(() => undefined);
  return i18next.changeLanguage(i18next.hasResourceBundle(locale, "translation") ? locale : DEFAULT_LOCALE);
}

export const useT = useTranslation;

// The ten locales and their own names, apart from the catalogs themselves, so a screen that only lists languages
// does not load every language's words (the web's first load carried all ten).

/** The ten supported locales (D3), in the order of `SUPPORTED_LOCALES` in @kawase/config. */
export const CATALOG_LOCALES = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur"] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

/** The language's own name, for the language picker. */
export const LANGUAGE_NAMES: Record<CatalogLocale, string> = {
  en: "English",
  zh: "中文",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  bn: "বাংলা",
  pt: "Português",
  ru: "Русский",
  ur: "اردو",
};

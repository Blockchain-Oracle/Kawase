// The docs speak the app's ten languages (D4), from the same list the app uses (@kawase/config), never a copy.
// English has no prefix (/docs/…); every other language does (/fr/docs/…). Content is grouped by language folder
// (content/docs/<lang>/…); a page missing in a language falls back to English.
import { defineI18n } from "fumadocs-core/i18n";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@kawase/config";
import { isRtlLocale } from "@kawase/i18n";

export const i18n = defineI18n({
  defaultLanguage: DEFAULT_LOCALE,
  languages: [...SUPPORTED_LOCALES],
  hideLocale: "default-locale",
  parser: "dir",
});

export const directionOf = (lang: string): "rtl" | "ltr" => (isRtlLocale(lang) ? "rtl" : "ltr");

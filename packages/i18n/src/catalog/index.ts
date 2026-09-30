import { ar } from "./ar";
import { bn } from "./bn";
import { en, type Catalog } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { hi } from "./hi";
import { pt } from "./pt";
import { ru } from "./ru";
import { ur } from "./ur";
import { zh } from "./zh";

export type { Catalog };

/** The ten supported locales (D3), in the order of `SUPPORTED_LOCALES` in @kawase/config. */
export const CATALOGS = { en, zh, hi, es, fr, ar, bn, pt, ru, ur } as const;
export type CatalogLocale = keyof typeof CATALOGS;

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

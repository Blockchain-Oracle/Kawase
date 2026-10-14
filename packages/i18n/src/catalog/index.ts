import { ar } from "./ar/index";
import { bn } from "./bn/index";
import { en, type Catalog } from "./en/index";
import { es } from "./es/index";
import { fr } from "./fr/index";
import { hi } from "./hi/index";
import { pt } from "./pt/index";
import { ru } from "./ru/index";
import { ur } from "./ur/index";
import { zh } from "./zh/index";

export type { Catalog };

/** The ten supported locales (D3), in the order of `SUPPORTED_LOCALES` in @kawase/config. */
export const CATALOGS = { en, zh, hi, es, fr, ar, bn, pt, ru, ur } as const;
export type CatalogLocale = keyof typeof CATALOGS;
export { CATALOG_LOCALES, LANGUAGE_NAMES } from "./names";
export { loadCatalog } from "./lazy";

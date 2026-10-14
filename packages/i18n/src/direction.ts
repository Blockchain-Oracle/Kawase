import type { CatalogLocale } from "./catalog/names";

const RTL: ReadonlySet<string> = new Set<CatalogLocale>(["ar", "ur"]);

/** True for languages written right-to-left. */
export const isRtlLocale = (locale: string): boolean => RTL.has(locale.split("-")[0] ?? locale);

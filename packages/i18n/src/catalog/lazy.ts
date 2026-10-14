// One language's catalog, loaded when it is needed (the app ships English and fetches the person's language on
// start or when they switch): on the web each language is its own chunk.
import type { Catalog } from "./en/index";
import type { CatalogLocale } from "./names";

export function loadCatalog(locale: CatalogLocale): Promise<Catalog> {
  switch (locale) {
    case "en":
      return import("./en/index").then((module) => module.en);
    case "zh":
      return import("./zh/index").then((module) => module.zh);
    case "hi":
      return import("./hi/index").then((module) => module.hi);
    case "es":
      return import("./es/index").then((module) => module.es);
    case "fr":
      return import("./fr/index").then((module) => module.fr);
    case "ar":
      return import("./ar/index").then((module) => module.ar);
    case "bn":
      return import("./bn/index").then((module) => module.bn);
    case "pt":
      return import("./pt/index").then((module) => module.pt);
    case "ru":
      return import("./ru/index").then((module) => module.ru);
    case "ur":
      return import("./ur/index").then((module) => module.ur);
  }
}

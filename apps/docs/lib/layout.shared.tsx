import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { uiTranslations } from "fumadocs-ui/i18n";
import { LANGUAGE_NAMES, type CatalogLocale } from "@kawase/i18n";

import { Brand } from "@/components/brand";
import { i18n } from "./i18n";
import { getMessages } from "./messages";
import { MESSAGES } from "@/messages/index";
import { links } from "./shared";

type UiStrings = Record<string, string>;

/** Fumadocs' own interface strings (search, "On this page", …): written per language by scripts/translate.ts. */
const uiStrings = (lang: string): UiStrings => {
  const translated = (MESSAGES[lang] as { fumadocs?: UiStrings } | undefined)?.fumadocs ?? {};
  return { displayName: LANGUAGE_NAMES[lang as CatalogLocale] ?? lang, ...translated };
};

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add(Object.fromEntries(i18n.languages.map((lang) => [lang, uiStrings(lang)])) as Partial<Record<string, UiStrings>>);

export function baseOptions(lang: string): BaseLayoutProps {
  const t = getMessages(lang);
  return {
    nav: {
      title: <Brand />,
      url: lang === i18n.defaultLanguage ? "/" : `/${lang}`,
    },
    githubUrl: links.github,
    links: [
      { text: t.nav.webApp, url: links.webApp, external: true },
      { text: t.nav.showcase, url: links.landing, external: true },
    ],
  };
}

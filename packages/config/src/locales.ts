/** The 10 launch locales (D4: English, French, Spanish and the most widely spoken languages). */
export const SUPPORTED_LOCALES = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ur"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";
/** Right-to-left locales; switching to or from these reloads the app on native (I18nManager). */
export const RTL_LOCALES = ["ar", "ur"] as const satisfies readonly SupportedLocale[];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

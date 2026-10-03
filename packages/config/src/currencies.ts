// Display currencies (plan §A.4 14 "Make it mine": any common fiat). Values are kept in US dollars and converted with
// a daily rate (open.er-api.com, free, cached on the server); names and symbols come from the device's Intl in the
// person's language, so no currency name is written here.
export const DISPLAY_CURRENCIES = [
  "USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "EGP", "INR", "PKR", "BDT", "CNY", "JPY", "KRW", "IDR", "PHP", "VND",
  "SGD", "AED", "SAR", "TRY", "BRL", "MXN", "ARS", "COP", "CAD", "AUD", "CHF",
] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const isDisplayCurrency = (code: string): code is DisplayCurrency => (DISPLAY_CURRENCIES as readonly string[]).includes(code.toUpperCase());

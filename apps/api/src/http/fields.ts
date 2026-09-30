// Bounds for request fields, in one place.
export const FIELD = {
  installationIdMin: 8,
  installationIdMax: 128,
  appVersionMax: 40,
  localeMax: 16,
  currencyCodeLength: 3,
  timezoneMax: 64,
  consentVersionMax: 20,
} as const;

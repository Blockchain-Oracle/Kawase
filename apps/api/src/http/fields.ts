// Bounds for request fields, in one place.
export const FIELD = {
  installationIdMin: 8,
  installationIdMax: 128,
  appVersionMax: 40,
  localeMax: 16,
  currencyCodeLength: 3,
  timezoneMax: 64,
  consentVersionMax: 20,
  /** Generous on purpose: the handle rules (3–20, a-z 0-9 _) answer with their own problem codes. */
  handleInputMax: 64,
} as const;

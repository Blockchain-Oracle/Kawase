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
  /** RFC 5321's limit on an address. */
  emailMax: 254,
  /** The api's sign-in nonces are 43 base64url characters; room for a change of length. */
  nonceMax: 128,
} as const;

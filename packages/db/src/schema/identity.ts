// Kawase owns the user, the device sessions and the sign-in nonces. The wallet provider (Privy, D41) owns the
// credentials and the user's key.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { NotificationPrefs, QuietHours, VoicePrefs } from "@kawase/config";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";

export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);
export const riskModeEnum = pgEnum("risk_mode", ["careful", "balanced", "autonomous"]);
export const platformEnum = pgEnum("platform", ["ios", "android", "web", "desktop"]);
/** Who proved the person's identity at sign-in (D41). */
export const identityProviderEnum = pgEnum("identity_provider", ["privy"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Present after the first account sign-in (an email the provider verified); null for guests. */
    email: text(),
    /** The optional public @handle (D35): lowercase, unique without regard to case, changeable. */
    handle: text(),
    /**
     * When the optional handle step was answered (a handle saved or Skip): onboarding asks it once per account,
     * not at every sign-in (Codex review R07). It stays changeable in Settings.
     */
    handlePromptedAt: timestampTz(),
    /** Who proved the person's identity and their id there (Privy: the user's DID); null for guests and dev accounts. */
    identityProvider: identityProviderEnum(),
    identitySubject: text(),
    isAnonymous: boolean().notNull().default(true),
    locale: text().notNull().default("en"),
    replyLanguage: text(),
    displayCurrency: text().notNull().default("USD"),
    timezone: text().notNull().default("UTC"),
    // Koe is a dark stage by default (DESIGN.md); "system" and "light" are the user's choice.
    theme: themeEnum().notNull().default("light"),
    activeNetwork: networkEnum().notNull().default("testnet"),
    riskMode: riskModeEnum().notNull().default("balanced"),
    practiceMode: boolean().notNull().default(false),
    /** Set when the user paused everything (automations, agent spending). */
    pausedAllAt: timestampTz(),
    /** Per event and channel; what is not set follows NOTIFICATION_DEFAULTS (Stage 9). */
    notificationPrefs: jsonb().$type<NotificationPrefs>().notNull().default({}),
    /** Push waits during these hours (the person's time zone); null = off. */
    quietHours: jsonb().$type<QuietHours>(),
    /** Push on the lock screen says "You received money" with no figure (plan §A.4.11); the inbox keeps amounts. */
    notifyHideAmounts: boolean().notNull().default(false),
    /** Settings → Voice; what is not set follows DEFAULT_VOICE_PREFS (read with `voicePrefs`). */
    voicePrefs: jsonb().$type<Partial<VoicePrefs>>().notNull().default({}),
    /** Conversations (chat and voice transcripts) older than this many days are deleted; null = kept until deleted. */
    transcriptRetentionDays: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_idx")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
    uniqueIndex("users_handle_idx")
      .on(sql`lower(${table.handle})`)
      .where(sql`${table.handle} is not null`),
    uniqueIndex("users_identity_idx")
      .on(table.identityProvider, table.identitySubject)
      .where(sql`${table.identitySubject} is not null`),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum().notNull(),
    /** A stable id the app generates once and keeps in secure storage. */
    installationId: text().notNull(),
    expoPushToken: text(),
    appVersion: text(),
    locale: text(),
    biometricEnrolled: boolean().notNull().default(false),
    /** The device's own name ("Abu's iPhone"), as the app reports it, for Settings → Devices. */
    name: text(),
    /** The Privy session that proved the latest sign-in here (the access token's `sid`): refused once signed out. */
    identitySessionId: text(),
    /** Where it last signed in or was seen, coarsely ("Lisbon, Portugal"), from its IP; the IP itself is never kept. */
    location: text(),
    locationAt: timestampTz(),
    lastSeenAt: timestampTz().defaultNow().notNull(),
    revokedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("devices_installation_idx").on(table.userId, table.installationId),
    uniqueIndex("devices_push_token_idx")
      .on(table.expoPushToken)
      .where(sql`${table.expoPushToken} is not null`),
  ],
);

/** One session per device; the token itself is never stored, only its hash. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid()
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    tokenHash: text().notNull(),
    expiresAt: timestampTz().notNull(),
    revokedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("sessions_token_hash_idx").on(table.tokenHash), index("sessions_user_idx").on(table.userId)],
);

/** Single-use nonces a dev-mode key signs to prove the sign-in (Privy sign-in needs none; KAWASE_DEV_AUTH only). */
export const signInNonces = pgTable("sign_in_nonces", {
  nonce: text().primaryKey(),
  expiresAt: timestampTz().notNull(),
  usedAt: timestampTz(),
  createdAt: createdAt(),
});

/**
 * Privy sessions signed out from Settings → Devices (one device, or every other one): a sign-in with tokens from one of
 * them is refused, so the device must sign in afresh. Privy keeps the session itself until its refresh token lapses.
 */
export const revokedIdentitySessions = pgTable("revoked_identity_sessions", {
  sessionId: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  revokedAt: createdAt(),
});

/**
 * The web's owner check (a browser has no Face ID): a six-digit code emailed to the account's verified address before
 * a signature that binds them. Only its hash is kept; one live code per person, a few tries, ten minutes.
 */
export const approvalCodes = pgTable(
  "approval_codes",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestampTz().notNull(),
    usedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [index("approval_codes_user_idx").on(table.userId)],
);

export const consentKindEnum = pgEnum("consent_kind", [
  "terms",
  "mainnet_real_money",
  "meme_risk",
  "marketplace_risk",
  "voice_retention",
]);

export const consents = pgTable(
  "consents",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: consentKindEnum().notNull(),
    version: text().notNull(),
    locale: text().notNull(),
    acceptedAt: createdAt(),
  },
  (table) => [uniqueIndex("consents_pk").on(table.userId, table.kind, table.version)],
);

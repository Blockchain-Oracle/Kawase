// Kawase owns the user, the device sessions and the sign-in nonces. Turnkey owns the credentials.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { NotificationPrefs, QuietHours, VoicePrefs } from "@kawase/config";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";

export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);
export const riskModeEnum = pgEnum("risk_mode", ["careful", "balanced", "autonomous"]);
export const platformEnum = pgEnum("platform", ["ios", "android", "web", "desktop"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Present after the first Turnkey sign-in; null for guests. */
    email: text(),
    /** The optional public @handle (D35): lowercase, unique without regard to case, changeable. */
    handle: text(),
    /**
     * When the optional handle step was answered (a handle saved or Skip): onboarding asks it once per account,
     * not at every sign-in (Codex review R07). It stays changeable in Settings.
     */
    handlePromptedAt: timestampTz(),
    turnkeySubOrganizationId: uuid(),
    turnkeyUserId: uuid(),
    isAnonymous: boolean().notNull().default(true),
    locale: text().notNull().default("en"),
    replyLanguage: text(),
    displayCurrency: text().notNull().default("USD"),
    timezone: text().notNull().default("UTC"),
    // Koe is a dark stage by default (DESIGN.md); "system" and "light" are the user's choice.
    theme: themeEnum().notNull().default("dark"),
    activeNetwork: networkEnum().notNull().default("testnet"),
    riskMode: riskModeEnum().notNull().default("balanced"),
    practiceMode: boolean().notNull().default(false),
    /** Set when the user paused everything (automations, agent spending). */
    pausedAllAt: timestampTz(),
    /** Per event and channel; what is not set follows NOTIFICATION_DEFAULTS (Stage 9). */
    notificationPrefs: jsonb().$type<NotificationPrefs>().notNull().default({}),
    /** Push waits during these hours (the person's time zone); null = off. */
    quietHours: jsonb().$type<QuietHours>(),
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
    uniqueIndex("users_turnkey_sub_organization_idx")
      .on(table.turnkeySubOrganizationId)
      .where(sql`${table.turnkeySubOrganizationId} is not null`),
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
    /** The Turnkey session key that proved the latest sign-in here: the API key "sign out this device" deletes. */
    turnkeyPublicKey: text(),
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

/** Single-use nonces the client signs with its Turnkey session key to prove the sign-in. */
export const signInNonces = pgTable("sign_in_nonces", {
  nonce: text().primaryKey(),
  expiresAt: timestampTz().notNull(),
  usedAt: timestampTz(),
  createdAt: createdAt(),
});

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

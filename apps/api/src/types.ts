import type { Logger } from "@kawase/log";

/** Per-request variables set by the middleware. */
export type AppEnv = {
  Variables: {
    requestId: string;
    log: Logger;
    userId?: string;
    sessionId?: string;
    user?: SessionUser;
  };
};

export type SessionUser = {
  id: string;
  email: string | null;
  handle: string | null;
  handlePromptedAt: Date | null;
  isAnonymous: boolean;
  locale: string;
  replyLanguage: string | null;
  displayCurrency: string;
  timezone: string;
  theme: string;
  activeNetwork: "mainnet" | "testnet";
  riskMode: string;
  practiceMode: boolean;
  /** Set while the person has paused all agent and automation spending. */
  pausedAllAt?: Date | null;
  turnkeySubOrganizationId: string | null;
  turnkeyUserId: string | null;
  /** Settings → Voice as stored (read with `voicePrefs`). */
  voicePrefs?: unknown;
};

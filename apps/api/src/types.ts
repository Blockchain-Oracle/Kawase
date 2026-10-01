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
  isAnonymous: boolean;
  locale: string;
  replyLanguage: string | null;
  displayCurrency: string;
  timezone: string;
  theme: string;
  activeNetwork: "mainnet" | "testnet";
  riskMode: string;
  practiceMode: boolean;
  turnkeySubOrganizationId: string | null;
  turnkeyUserId: string | null;
};

// Settings → Account (cards/access.md): devices and sessions, the email, export, deleting the account.
import type { NetworkId, RevokeRequest } from "./types";

export type DeviceView = {
  id: string;
  platform: "ios" | "android" | "web" | "desktop";
  name: string | null;
  appVersion: string | null;
  lastSeenAt: string;
  createdAt: string;
  /** The device this request came from. */
  current: boolean;
  signedIn: boolean;
  /** Roughly where it was last seen ("Lisbon, Portugal"). */
  location: string | null;
};

export type AccountHoldings = {
  address: string | null;
  networks: {
    network: NetworkId;
    balances: { USDC: string; EURC: string };
    agentWallet: string;
    activeGrants: { id: string; kind: "allowance" | "automation" | "marketplace" }[];
  }[];
};

export type AccountDeleted = { deleted: true; handleHeldDays: number };

/** The web's owner check: where the code went (masked) and until when it works. */
export type ApprovalCodeSent = { sentTo: string; expiresAt: string };

export type AccountApi = {
  devices: () => Promise<{ devices: DeviceView[] }>;
  touchDevice: (input: { name?: string; appVersion?: string }) => Promise<void>;
  signOutDevice: (id: string) => Promise<{ signedOut: true }>;
  signOutEverywhere: () => Promise<{ signedOut: number }>;
  exportRecorded: () => Promise<void>;
  sendApprovalCode: () => Promise<ApprovalCodeSent>;
  verifyApprovalCode: (code: string) => Promise<{ approved: true }>;
  holdings: () => Promise<AccountHoldings>;
  revokeAllRequest: (network: NetworkId) => Promise<{ revoke: RevokeRequest | null }>;
  deleteAccount: (confirm: string) => Promise<AccountDeleted>;
};

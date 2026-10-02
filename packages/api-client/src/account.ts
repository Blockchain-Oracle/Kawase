// Settings → Account (cards/access.md): devices and sessions, the email, export, deleting the account.
import type { NetworkId, TransactionRequestResponse } from "./types";

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
  turnkeyPublicKey: string | null;
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

export type AccountApi = {
  devices: () => Promise<{ devices: DeviceView[] }>;
  touchDevice: (input: { name?: string; appVersion?: string }) => Promise<void>;
  signOutDevice: (id: string) => Promise<{ turnkeyPublicKey: string | null }>;
  signOutEverywhere: () => Promise<{ turnkeyPublicKeys: string[] }>;
  syncEmail: () => Promise<{ email: string | null }>;
  exportRecorded: () => Promise<void>;
  holdings: () => Promise<AccountHoldings>;
  revokeAllRequest: (network: NetworkId) => Promise<{ revoke: TransactionRequestResponse | null }>;
  deleteAccount: (confirm: string) => Promise<AccountDeleted>;
};

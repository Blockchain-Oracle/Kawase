// Dev mode's WalletSigner (config.ts `isDev`): the signed-in dev email's throwaway testnet key, as a viem account —
// it already has the WalletSigner shape (7702 authorization, typed data, raw hashes, transactions).
import * as React from "react";

import type { ApprovalStrength, WalletSigner } from "@kawase/wallet";

import { useSession } from "@/session/session-provider";
import { currentDevAccount } from "./dev-key";

export function useDevWalletSigner(approval: ApprovalStrength = "session"): WalletSigner | undefined {
  void approval;
  const { status, user } = useSession();
  return React.useMemo(() => (status === "account" && user ? (currentDevAccount() as WalletSigner | undefined) : undefined), [status, user]);
}

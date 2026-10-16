// Web: Privy's React provider (D41). Its own login modal and wallet UIs are never shown: the sign-in sheet drives the
// headless hooks, and `showWalletUIs: false` keeps message, typed-data and raw-hash signatures silent (the budget
// decides when the person confirms, not the wallet). Arc testnet is the wallet's default chain; signing never depends
// on it, since every signature is a raw digest and our own RPC broadcasts.
import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { ARC_CHAINS } from "@kawase/networks";

import { PRIVY_APP_ID, PRIVY_WEB_CLIENT_ID } from "./config";
import { PrivyOAuthBridge } from "./privy-oauth";

// Arc's chains with its current endpoints (testnet moved to arc.io; viem's built-ins still carry the old hosts).
const { mainnet: arc, testnet: arcTestnet } = ARC_CHAINS;

export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      {...(PRIVY_WEB_CLIENT_ID ? { clientId: PRIVY_WEB_CLIENT_ID } : {})}
      config={{
        supportedChains: [arcTestnet, arc],
        defaultChain: arcTestnet,
        loginMethods: ["email", "google", "apple"],
        embeddedWallets: { showWalletUIs: false, ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <PrivyOAuthBridge>{children}</PrivyOAuthBridge>
    </PrivyProvider>
  );
}

// iOS and Android: Privy's Expo provider (D41), with the app client id (dashboard → App clients; allowed app ids
// xyz.kawase.app, URL scheme kawase). The embedded wallet is created on login for accounts without one, and the sign-in
// core creates it itself when that did not happen. Arc testnet is listed first (the wallet's default chain); signing
// never depends on it, since every signature is a raw digest and our own RPC broadcasts.
import "./privy-polyfills.native";

import { PrivyProvider } from "@privy-io/expo";
import type { ReactNode } from "react";
import { arc, arcTestnet } from "viem/chains";

import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "./config";

export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      supportedChains={[arcTestnet, arc]}
      config={{ embedded: { ethereum: { createOnLogin: "users-without-wallets" } } }}
    >
      {children}
    </PrivyProvider>
  );
}

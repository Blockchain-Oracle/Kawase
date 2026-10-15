// Web: Privy around the app (D41). Dev mode needs no provider (the key is local), and a build without the Privy ids
// still runs (guest look-around).
import type { ReactNode } from "react";

import { isDev, isWalletConfigured } from "./config";
import { PrivyWalletProvider } from "./privy-provider";

export function WalletProvider({ children }: { children: ReactNode }) {
  if (isDev || !isWalletConfigured) return <>{children}</>;
  return <PrivyWalletProvider>{children}</PrivyWalletProvider>;
}

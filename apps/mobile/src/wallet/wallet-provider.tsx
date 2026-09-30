import type { ReactNode } from "react";

// Web build: the React Native wallet kit is native-only. The web wallet (Turnkey's web kit) is wired in a
// later step; until then the web app renders without a wallet provider.
export function WalletProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

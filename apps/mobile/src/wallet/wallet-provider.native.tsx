// iOS and Android: Privy around the app (D41). Its native modules load only when the build has the Privy ids; without
// them the app still runs (guest look-around).
import type { ReactNode } from "react";

import { isWalletConfigured } from "./config";

const privy: typeof import("./privy-provider.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Privy's native modules load only with its ids
  isWalletConfigured ? require("./privy-provider.native") : undefined;

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!privy) return <>{children}</>;
  return <privy.PrivyWalletProvider>{children}</privy.PrivyWalletProvider>;
}

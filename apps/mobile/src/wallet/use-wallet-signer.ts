import type { ApprovalStrength, WalletSigner } from "@kawase/wallet";

// Web build: no wallet signer yet (see wallet-provider.tsx).
export function useWalletSigner(approval: ApprovalStrength = "session"): WalletSigner | undefined {
  void approval;
  return undefined;
}

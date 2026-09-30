import type { ApprovalStrength, WalletSigner } from '@kawase/wallet';

// Web build: no wallet signer yet (see wallet-provider.tsx).
export function useWalletSigner(_approval: ApprovalStrength = 'session'): WalletSigner | undefined {
  return undefined;
}

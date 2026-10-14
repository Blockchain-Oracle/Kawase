// iOS and Android: the app's WalletSigner over Privy's embedded wallet (D41). Every signature is a raw 32-byte digest
// through the wallet's EIP-1193 `secp256k1_sign` (packages/wallet/src/privy.ts); the Expo SDK shows no UI for it.
// The app's own Face ID gates (biometric.ts) stay with the flows that ask for them, so `approval` adds no prompt here.
import "./privy-polyfills.native";

import { useEmbeddedEthereumWallet, usePrivy } from "@privy-io/expo";
import * as React from "react";
import type { Address, Hex } from "viem";

import { privySigner, type ApprovalStrength, type WalletSigner } from "@kawase/wallet";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export function usePrivyWalletSigner(approval: ApprovalStrength = "session"): WalletSigner | undefined {
  const { isReady } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();
  const wallet = wallets[0];
  // One provider per wallet, fetched on the first signature and kept (Privy: do not refetch per signature).
  const provider = React.useRef<{ address: string; provider: Promise<Eip1193> } | undefined>(undefined);
  return React.useMemo(() => {
    // Never sign before Privy is ready: wallet calls before it can throw.
    if (!isReady || !wallet) return undefined;
    const address = wallet.address as Address;
    const getProvider = () => {
      if (provider.current?.address !== address) provider.current = { address, provider: wallet.getProvider() as Promise<Eip1193> };
      return provider.current.provider;
    };
    return privySigner({
      address,
      approval,
      async signHash(hash) {
        const signature = await (await getProvider()).request({ method: "secp256k1_sign", params: [hash] });
        if (typeof signature !== "string") throw new Error("The wallet returned no signature");
        return signature as Hex;
      },
    });
  }, [isReady, wallet, approval]);
}

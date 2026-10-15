// Web: the app's WalletSigner over Privy's embedded wallet (D41). Every signature is a raw 32-byte digest through the
// wallet's EIP-1193 `secp256k1_sign` (packages/wallet/src/privy.ts); with `showWalletUIs: false` nothing pops up.
// The app's own owner checks (biometric.web.ts: an emailed code) stay with the flows that ask for them.
import * as React from "react";
import type { Address, Hex } from "viem";

import { privySigner, type WalletSigner } from "@kawase/wallet";

import { useEmbeddedWallet } from "./privy-account";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export function usePrivyWalletSigner(): WalletSigner | undefined {
  const { wallet } = useEmbeddedWallet();
  // One provider per wallet, fetched on the first signature and kept (Privy: do not refetch per signature).
  const provider = React.useRef<{ address: string; provider: Promise<Eip1193> } | undefined>(undefined);
  return React.useMemo(() => {
    if (!wallet) return undefined;
    const address = wallet.address as Address;
    const getProvider = () => {
      if (provider.current?.address !== address) provider.current = { address, provider: wallet.getEthereumProvider() as Promise<Eip1193> };
      return provider.current.provider;
    };
    return privySigner({
      address,
      async signHash(hash) {
        const signature = await (await getProvider()).request({ method: "secp256k1_sign", params: [hash] });
        if (typeof signature !== "string") throw new Error("The wallet returned no signature");
        return signature as Hex;
      },
    });
  }, [wallet]);
}

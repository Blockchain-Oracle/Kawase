// M12 with Privy (D41): a Privy key is not bound to the device, so a proofed request carries the person's own wallet
// signature over the activity id that names it (session/device-proof.ts); the api checks it recovers to the wallet
// registered for the account. One silent raw-hash signature per proofed request (approve a send, a waiting run, delete).
import * as React from "react";

import type { WalletSigner } from "@kawase/wallet";

import { setDeviceProver } from "@/session/device-proof";

export const PROOF_ACTIVITY_HEADER = "x-kawase-proof-activity";
export const PROOF_SIGNATURE_HEADER = "x-kawase-proof-signature";

export function usePrivyDeviceProver(signer: WalletSigner | undefined) {
  React.useEffect(() => {
    if (!signer) {
      setDeviceProver(undefined);
      return undefined;
    }
    setDeviceProver(async (activityId) => ({
      [PROOF_ACTIVITY_HEADER]: activityId,
      [PROOF_SIGNATURE_HEADER]: await signer.signMessage({ message: activityId }),
    }));
    return () => setDeviceProver(undefined);
  }, [signer]);
}

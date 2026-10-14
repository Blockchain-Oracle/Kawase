// Web: keeps the device proof (M12) for this build's wallet provider; renders nothing. Mounted once at the root.
// - Turnkey: stamped by the web kit's session.
// - Privy (D41): Google and Apple return to the page signed in at Privy, and this finishes that sign-in. The wallet's
//   per-request proof is not sent from the browser yet: the api's CORS list does not allow the proof headers, so a
//   proofed request would fail before it left (the lead adds them in app.ts; then this uses usePrivyDeviceProver).
//   While DEVICE_PROOF_REQUIRED is off, requests without a proof go on as before.
import { useTurnkey } from "@turnkey/react-wallet-kit";

import { isPrivy, isTurnkeyConfigured, isWalletConfigured } from "./config";
import { usePrivyOAuthReturn } from "./privy-account";
import { useDeviceProver } from "./turnkey-account-core";

function TurnkeySync() {
  useDeviceProver(useTurnkey());
  return null;
}

function PrivySync() {
  usePrivyOAuthReturn();
  return null;
}

// Without the provider's ids there is no provider above this (see wallet-provider.tsx), so it must not call the kit.
export function DeviceProofSync() {
  if (isPrivy) return isWalletConfigured ? <PrivySync /> : null;
  return isTurnkeyConfigured ? <TurnkeySync /> : null;
}

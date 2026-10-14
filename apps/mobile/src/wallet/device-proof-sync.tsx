// Web: keeps the device proof (M12) for this build's wallet provider; renders nothing. Mounted once at the root.
// - Turnkey: stamped by the web kit's session.
// - Privy (D41): the wallet's per-request proof is not sent from the browser yet: the api's CORS list does not allow
//   the proof headers, so a proofed request would fail before it left (the lead adds them in app.ts; then this uses
//   usePrivyDeviceProver). While DEVICE_PROOF_REQUIRED is off, requests without a proof go on as before. Google and
//   Apple coming back to the page are finished by privy-oauth-return.tsx, which has a surface to show it on.
import { useTurnkey } from "@turnkey/react-wallet-kit";

import { isPrivy, isTurnkeyConfigured } from "./config";
import { useDeviceProver } from "./turnkey-account-core";

function TurnkeySync() {
  useDeviceProver(useTurnkey());
  return null;
}

// Without the provider's ids there is no provider above this (see wallet-provider.tsx), so it must not call the kit.
export function DeviceProofSync() {
  if (isPrivy) return null;
  return isTurnkeyConfigured ? <TurnkeySync /> : null;
}

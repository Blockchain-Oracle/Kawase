// Keeps the device proof (security review M12) on every platform; renders nothing. Mounted once at the root. A Privy key
// is not bound to one device, so a proofed request (approving a send or a waiting run, deleting the account) carries the
// person's own wallet signature over the activity id that names it (privy-device-proof.ts): Privy's wallet on a phone
// and in a browser alike (D41), the throwaway key in dev mode. Google and Apple coming back to the page are finished by
// privy-oauth-return.tsx, which has a surface to show it on.
import { usePrivyDeviceProver } from "./privy-device-proof";
import { useWalletSigner } from "./use-wallet-signer";

export function DeviceProofSync() {
  usePrivyDeviceProver(useWalletSigner());
  return null;
}

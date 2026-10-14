// iOS and Android: keeps the device proof (M12) for this build's wallet provider; renders nothing. Mounted once at the
// root. Turnkey: stamped by the React Native kit's session. Privy (D41): the person's wallet signs each proofed
// request (privy-device-proof.ts); Privy's modules load only on a Privy build.
import { useTurnkey } from "@turnkey/react-native-wallet-kit";

import { isPrivy, isTurnkeyConfigured, isWalletConfigured } from "./config";
import { usePrivyDeviceProver } from "./privy-device-proof";
import { useDeviceProver } from "./turnkey-account-core";

const privy: typeof import("./privy-signer.native") | undefined =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluated only on a Privy build (see above)
  isPrivy && isWalletConfigured ? require("./privy-signer.native") : undefined;

function TurnkeySync() {
  useDeviceProver(useTurnkey());
  return null;
}

function PrivySync({ useSigner }: { useSigner: NonNullable<typeof privy>["usePrivyWalletSigner"] }) {
  usePrivyDeviceProver(useSigner());
  return null;
}

// Without the provider's ids there is no provider above this (see wallet-provider.native.tsx), so it must not call the kit.
export function DeviceProofSync() {
  if (isPrivy) return privy ? <PrivySync useSigner={privy.usePrivyWalletSigner} /> : null;
  return isTurnkeyConfigured ? <TurnkeySync /> : null;
}

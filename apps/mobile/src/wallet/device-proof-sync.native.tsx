// Native: keeps the device proof (M12) stamped by the React Native wallet kit's session; renders nothing.
import { useTurnkey } from "@turnkey/react-native-wallet-kit";

import { isWalletConfigured } from "./config";
import { useDeviceProver } from "./turnkey-account-core";

function Sync() {
  useDeviceProver(useTurnkey());
  return null;
}

// Without the Turnkey ids there is no provider above this (see wallet-provider.native.tsx), so it must not call the kit.
export function DeviceProofSync() {
  return isWalletConfigured ? <Sync /> : null;
}

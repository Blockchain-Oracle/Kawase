// The Face ID (or Touch ID / fingerprint / device passcode) check before the allowance is signed (D33: one Face ID
// to accept a daily allowance). Until passkeys hold the key on a real domain, the session key signs, and this
// check is what makes the approval the device owner's. A device with no biometrics and no passcode cannot be
// checked, so it proceeds; the web has no such check yet.
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export type BiometricKind = "faceId" | "touchId" | "fingerprint" | "passcode" | "none";
export type BiometricResult = "approved" | "cancelled" | "unavailable";

/** Which check this device will show, for the button's words ("Accept with Face ID"). */
export async function biometricKind(): Promise<BiometricKind> {
  if (Platform.OS === "web") return "none";
  const [hardware, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  if (hardware && enrolled) {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "faceId" : "fingerprint";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === "ios" ? "touchId" : "fingerprint";
  }
  return level === LocalAuthentication.SecurityLevel.NONE ? "none" : "passcode";
}

/** Asks the device owner to confirm; resolves "approved" when they did or the device has nothing to ask with. */
export async function confirmWithBiometrics(promptMessage: string, cancelLabel: string): Promise<BiometricResult> {
  if ((await biometricKind()) === "none") return "unavailable";
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel, disableDeviceFallback: false });
  return result.success ? "approved" : "cancelled";
}

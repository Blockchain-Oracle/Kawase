// The device owner's check before the wallet signs anything that binds them: accepting the daily allowance, and a
// send above it (D33). Until passkeys hold the key on a real domain the session key signs, so this check is what
// makes the approval the owner's. Only an explicit "approved" may continue: a cancel, a failure, a lockout or a
// device with nothing to check with (no biometrics, no passcode, the web) stops the signature and says why
// (Codex review R03). Nothing here lowers the requirement or invents a PIN.
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

/**
 * What the device will show, for the words on the button ("Send with Face ID", "…with your fingerprint"). "emailCode"
 * is the web's check (biometric.web.ts): a fresh email code verified by Turnkey stands in for Face ID in a browser.
 */
export type BiometricKind = "faceId" | "touchId" | "face" | "fingerprint" | "passcode" | "emailCode" | "none";
export type BiometricResult = "approved" | "cancelled" | "failed" | "unavailable";

const CANCELLED = new Set(["user_cancel", "app_cancel", "system_cancel"]);
const UNAVAILABLE = new Set(["not_enrolled", "not_available", "passcode_not_set", "lockout"]);

export async function biometricKind(): Promise<BiometricKind> {
  if (Platform.OS === "web") return "none";
  const [hardware, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  if (hardware && enrolled) {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "faceId" : "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === "ios" ? "touchId" : "fingerprint";
  }
  return level === LocalAuthentication.SecurityLevel.NONE ? "none" : "passcode";
}

/** Asks the device owner to confirm. Callers continue only on "approved". */
export async function confirmWithBiometrics(promptMessage: string, cancelLabel: string): Promise<BiometricResult> {
  if ((await biometricKind()) === "none") return "unavailable";
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel, disableDeviceFallback: false });
  if (result.success) return "approved";
  if (CANCELLED.has(result.error)) return "cancelled";
  if (UNAVAILABLE.has(result.error)) return "unavailable";
  return "failed";
}

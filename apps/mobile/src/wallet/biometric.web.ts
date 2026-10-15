// Web: there is no Face ID in a browser, so the owner's check is a fresh code Kawase emails to the account's verified
// address and checks itself (api account/approval-codes.ts), shown as a sheet by web-approval-host.tsx. It is a real possession check, not
// a lowered requirement: the same contract holds — only "approved" signs (Codex review R03).
import type { BiometricKind, BiometricResult } from "./biometric";
import { webApprover } from "./web-approver";

export type { BiometricKind, BiometricResult };

export async function biometricKind(): Promise<BiometricKind> {
  return webApprover() ? "emailCode" : "none";
}

export async function confirmWithBiometrics(promptMessage: string, cancelLabel: string): Promise<BiometricResult> {
  void cancelLabel;
  const approve = webApprover();
  return approve ? approve(promptMessage) : "unavailable";
}

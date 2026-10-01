// The web's approval check is a sheet (web-approval-host.tsx) that asks for a fresh email code; `confirmWithBiometrics`
// on the web (biometric.web.ts) reaches it through this one registration, so callers keep a single contract on
// every platform. Read only from async code, never during render.
import type { BiometricResult } from "./biometric";

export type WebApprover = (promptMessage: string) => Promise<BiometricResult>;

let current: WebApprover | undefined;

export function setWebApprover(approver: WebApprover | undefined) {
  current = approver;
}

/** Clears the registration only if it is still this host's: a host mounting during another's unmount keeps its own. */
export function clearWebApprover(approver: WebApprover) {
  if (current === approver) current = undefined;
}

export function webApprover(): WebApprover | undefined {
  return current;
}

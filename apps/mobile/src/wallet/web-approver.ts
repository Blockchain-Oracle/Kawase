// The web's approval check is a sheet (web-approval-host.tsx) that asks for a fresh email code; `confirmWithBiometrics`
// on the web (biometric.web.ts) reaches it through this one registration, so callers keep a single contract on
// every platform. Read only from async code, never during render.
import type { BiometricResult } from "./biometric";

export type WebApprover = (promptMessage: string) => Promise<BiometricResult>;

let current: WebApprover | undefined;

export function setWebApprover(approver: WebApprover | undefined) {
  current = approver;
}

export function webApprover(): WebApprover | undefined {
  return current;
}

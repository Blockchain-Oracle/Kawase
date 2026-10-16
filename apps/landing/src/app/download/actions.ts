"use server";
// /download's "Email me" (components/landing/app-invite.tsx). iPhone: the api adds the address to the public TestFlight
// group (Apple emails the invitation) and sends Kawase's own email with the join link and the steps.
// Android: the api emails the APK with how to install it (apps/api src/public/testflight.ts). The App Store Connect key
// lives with the api only, and so do the limits (one request per address in ten minutes, a cap per hour).
import { links } from "@/lib/links";

export type InviteResult = "sent" | "already" | "unavailable" | "failed" | "busy" | "invalid";
export type InviteState = { result: InviteResult | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL = 254;
const TIMEOUT_MS = 15_000;
const RESULTS: readonly InviteResult[] = ["sent", "already", "unavailable", "failed", "busy", "invalid"];

export async function requestAppInvite(_previous: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const platform = form.get("platform") === "android" ? "android" : "ios";
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) return { result: "invalid" };
  try {
    const response = await fetch(`${links.api}/public/testflight-invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, platform }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { result?: string } | null;
    const result = RESULTS.find((entry) => entry === body?.result);
    return { result: response.ok && result ? result : "failed" };
  } catch {
    return { result: "failed" };
  }
}

"use server";
// The iPhone card's "Email me when it opens": the api adds the address to the public TestFlight group (Apple emails the
// invitation the minute the beta opens) and sends Kawase's own "you're on the list" email (apps/api
// src/public/testflight.ts). The App Store Connect key lives with the api only. A light per-visitor limit here keeps a
// script from filling the list from one place.
import { headers } from "next/headers";

import { links } from "@/lib/links";

export type InviteResult = "sent" | "already" | "unavailable" | "failed" | "busy" | "invalid";
export type InviteState = { result: InviteResult | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL = 254;
/** Five tries per visitor in ten minutes. */
const WINDOW_MS = 600_000;
const PER_WINDOW = 5;
const TIMEOUT_MS = 15_000;
const RESULTS: readonly InviteResult[] = ["sent", "already", "unavailable", "failed", "busy", "invalid"];
const seen = new Map<string, number[]>();

function limited(key: string): boolean {
  const now = Date.now();
  const recent = (seen.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  seen.set(key, recent);
  return recent.length > PER_WINDOW;
}

export async function requestIosInvite(_previous: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) return { result: "invalid" };
  const from = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(from)) return { result: "busy" };
  try {
    const response = await fetch(`${links.api}/public/testflight-invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
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

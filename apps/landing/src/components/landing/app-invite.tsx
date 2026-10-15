"use client";
// The email field under /download's iPhone and Android cards. iPhone, while Apple reviews the beta: the address joins
// the public TestFlight group, so Apple emails the invitation the minute testers are let in, and Kawase sends one email
// to say so. Android: Kawase emails the APK with how to install it, for someone on a laptop whose phone is elsewhere.
// Each answer says what happens next; nothing pretends an invitation went out today.
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import { requestAppInvite, type InviteResult } from "@/app/download/actions";
import { BUTTON_SECONDARY } from "@/components/landing/hero";

type Platform = "ios" | "android";

const COPY: Record<Platform, { label: string; idle: string; sent: string; already: string }> = {
  ios: {
    label: "Get the TestFlight invite by email",
    idle: "Apple sends the invitation; Kawase sends one email to say you're on the list.",
    sent: "You're on the list: check your inbox. Apple emails the TestFlight invitation the minute the beta opens.",
    already: "That address is already on the list. Apple's invitation goes to it the minute the beta opens.",
  },
  android: {
    label: "Send the download link to your phone",
    idle: "One email from Kawase with the APK and how to install it.",
    sent: "Sent. Open it on your Android phone and tap Download the APK.",
    already: "Sent. Open it on your Android phone and tap Download the APK.",
  },
};

const SAID: Record<Exclude<InviteResult, "sent" | "already">, string> = {
  invalid: "That doesn't look like an email address.",
  busy: "Already sent to that address. Give it a few minutes before asking again.",
  unavailable: "Email isn't available from this page right now. Use the button above meanwhile.",
  failed: "That didn't go through just now. Try again in a minute.",
};

export function AppInvite({ platform }: { platform: Platform }) {
  const [state, send, pending] = useActionState(requestAppInvite, { result: null });
  const copy = COPY[platform];
  const done = state.result === "sent" || state.result === "already";
  const id = `invite-${platform}`;
  const said = state.result === "sent" || state.result === "already" ? copy[state.result] : state.result ? SAID[state.result] : copy.idle;
  return (
    <form action={send} className="mt-6 grid gap-2.5">
      <input type="hidden" name="platform" value={platform} />
      <label htmlFor={id} className="text-[14px] font-semibold text-foreground">
        {copy.label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          disabled={pending || done}
          className="h-12 w-full min-w-0 shrink-0 rounded-full border border-border bg-card px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 sm:w-auto sm:flex-1"
        />
        <button type="submit" disabled={pending || done} className={`${BUTTON_SECONDARY} disabled:opacity-60`}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : done ? <Check className="size-4" aria-hidden /> : null}
          {done ? "Sent" : "Email me"}
          {pending || done ? null : <ArrowRight className="size-4" aria-hidden />}
        </button>
      </div>
      <p aria-live="polite" className={`text-[14px] ${done ? "text-foreground" : "text-muted-foreground"}`}>
        {said}
      </p>
    </form>
  );
}

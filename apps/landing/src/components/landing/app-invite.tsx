"use client";
// /download's email form, in the hero where nobody has to scroll for it (Abu, 10-16: "put the email at the hero…
// select Apple or Android"): which phone (the visitor's own, chosen for them), the address, Email me. iPhone, while Apple
// reviews the beta: the address joins the public TestFlight group, so Apple emails the invitation the minute testers
// are let in, and Kawase sends one email to say so. Android: Kawase emails the APK with how to install it. Each answer
// says what happens next; nothing pretends an invitation went out today. One row on a laptop, stacked on a phone.
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { requestAppInvite, type InviteResult } from "@/app/download/actions";
import { AndroidGlyph, AppleGlyph } from "@/components/landing/glyphs";
import { BUTTON_PRIMARY } from "@/components/landing/hero";

type Platform = "ios" | "android";

const IDLE: Record<Platform, string> = {
  ios: "Apple emails the TestFlight invite as soon as the beta opens; Kawase sends one email to say you're on the list.",
  android: "One email from Kawase with the APK and how to install it.",
};
const SENT: Record<Platform, string> = {
  ios: "You're on the list: check your inbox. Apple emails the TestFlight invitation the minute the beta opens.",
  android: "Sent. Open it on your Android phone and tap Download the APK.",
};
const SAID: Record<Exclude<InviteResult, "sent" | "already">, string> = {
  invalid: "That doesn't look like an email address.",
  busy: "Already sent to that address. Give it a few minutes before asking again.",
  unavailable: "Email isn't available right now. Use the buttons below meanwhile.",
  failed: "That didn't go through just now. Try again in a minute.",
};

export function AppInvite({ initial }: { initial: Platform }) {
  const [platform, setPlatform] = useState<Platform>(initial);
  const [state, send, pending] = useActionState(requestAppInvite, { result: null });
  const result = state.result;
  const done = result === "sent" || result === "already";
  const said = result === "sent" || result === "already" ? SENT[platform] : result ? SAID[result] : IDLE[platform];
  const option = (value: Platform, label: string, glyph: React.ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={platform === value}
      onClick={() => setPlatform(value)}
      disabled={pending || done}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors ${
        platform === value ? "bg-foreground text-background" : "text-foreground hover:bg-background/60"
      }`}
    >
      {glyph}
      {label}
    </button>
  );

  return (
    <form action={send} className="mt-8 w-full max-w-[560px]" aria-label="Get Kawase on your phone by email">
      <input type="hidden" name="platform" value={platform} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-semibold text-foreground">Send it to my phone</span>
        <div role="radiogroup" aria-label="Your phone" className="inline-flex rounded-full border border-border bg-muted p-1">
          {option("ios", "iPhone", <AppleGlyph className="size-4" />)}
          {option("android", "Android", <AndroidGlyph className="h-3 w-auto" />)}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="invite-email" className="sr-only">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          disabled={pending || done}
          className="h-12 w-full min-w-0 rounded-full border border-border bg-card px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 sm:flex-1"
        />
        <button type="submit" disabled={pending || done} className={`${BUTTON_PRIMARY} shrink-0 disabled:opacity-60`}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : done ? <Check className="size-4" aria-hidden /> : null}
          {done ? "Sent" : "Email me"}
          {pending || done ? null : <ArrowRight className="size-4" aria-hidden />}
        </button>
      </div>
      <p aria-live="polite" className={`mt-2.5 text-[14px] ${done ? "text-foreground" : "text-muted-foreground"}`}>
        {said}
      </p>
    </form>
  );
}

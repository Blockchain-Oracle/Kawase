"use client";
// The iPhone card's waiting list while Apple reviews the beta: an email field and one button. The address joins the
// public TestFlight group, so Apple emails the invitation itself the minute testers are let in. Each answer says what
// happens next; nothing pretends an invitation went out today.
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import { requestIosInvite, type InviteState } from "@/app/download/actions";
import { BUTTON_SECONDARY } from "@/components/landing/hero";

const SAID: Record<NonNullable<InviteState["result"]>, string> = {
  sent: "You're on the list: check your inbox. Apple emails the TestFlight invitation the minute the beta opens.",
  already: "That address is already on the list. Apple's invitation goes to it the minute the beta opens.",
  invalid: "That doesn't look like an email address.",
  busy: "Too many tries from here. Give it a few minutes.",
  unavailable: "The list isn't open from this page yet. Use the web app on your iPhone meanwhile.",
  failed: "Apple didn't take it just now. Try again in a minute.",
};

export function IosInvite() {
  const [state, send, pending] = useActionState(requestIosInvite, { result: null });
  const done = state.result === "sent" || state.result === "already";
  return (
    <form action={send} className="mt-6 grid gap-2.5">
      <label htmlFor="ios-invite" className="text-[14px] font-semibold text-foreground">
        Get the TestFlight invite by email
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ios-invite"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          disabled={pending || done}
          className="h-12 min-w-0 flex-1 rounded-full border border-border bg-card px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
        />
        <button type="submit" disabled={pending || done} className={`${BUTTON_SECONDARY} disabled:opacity-60`}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : done ? <Check className="size-4" aria-hidden /> : null}
          {done ? "On the list" : "Email me"}
          {pending || done ? null : <ArrowRight className="size-4" aria-hidden />}
        </button>
      </div>
      <p aria-live="polite" className={`text-[14px] ${done ? "text-foreground" : "text-muted-foreground"}`}>
        {state.result ? SAID[state.result] : "Apple sends the invitation; Kawase sends one email to say you're on the list."}
      </p>
    </form>
  );
}

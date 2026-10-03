// Where a person was when sign-in started, so finishing onboarding brings them back there (Codex review R07): a
// guest who tapped Fund on home, opened Receive, or asked the agent to send lands back on that page — the page's
// own state kept, nothing submitted for them — instead of on home. A pushed page (send, receive, a contact) is
// returned to by dismissing the onboarding pages above it; a tab is returned to by clearing the stack and switching.
// The story and the sign-in deep link are not places to return to. Read only in event handlers and effects.
import { router, type Href } from "expo-router";

/** Pages that are part of signing in rather than something the person was doing. */
const NOT_A_DESTINATION = new Set(["/welcome", "/sign-in", "/handle", "/wallet"]);
const TABS = new Set(["/", "/chat", "/activity", "/settings"]);

let returnTo: string | undefined;
/** A link opened with no session at all (a push, an email): the story and sign-in end there instead of home. */
let deepLink: string | undefined;

/** Called when a signed-out open had to go to the story first (A5-2: signed out → sign in → it resumes). */
export function rememberDeepLink(href: string) {
  const path = href.split("?")[0] ?? href;
  deepLink = NOT_A_DESTINATION.has(path) || path === "/" ? undefined : href;
}

/** The link to land on after the story or sign-in, once (then it is forgotten). */
export function takeDeepLink(): string | undefined {
  const target = deepLink;
  deepLink = undefined;
  return target;
}

/** Called when sign-in opens: remembers the page under the sheet (the latest opening wins). */
export function rememberReturnTo(pathname: string) {
  returnTo = NOT_A_DESTINATION.has(pathname) ? undefined : pathname;
}

/** Forgets it (a sign-in that needed no onboarding: the person simply stays where they are). */
export function forgetReturnTo() {
  returnTo = undefined;
}

/**
 * Leaves the onboarding pages for the page sign-in was opened from. Without one, it goes back if there is a page
 * to go back to (Wallet & limits opened setup) and otherwise home.
 */
export function finishOnboarding() {
  const target = returnTo ?? takeDeepLink();
  returnTo = undefined;
  if (!target) {
    if (router.canGoBack()) router.back();
    else router.replace("/");
    return;
  }
  if (TABS.has(target)) {
    if (router.canDismiss()) router.dismissAll();
    router.navigate(target as Href);
    return;
  }
  router.dismissTo(target as Href);
}

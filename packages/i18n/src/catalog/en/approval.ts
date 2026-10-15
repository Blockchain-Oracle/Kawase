export const approval = {
  title: "Confirm it's you",
  body: "On the web, a code sent to {{email}} stands in for Face ID. Nothing is signed until you enter it.",
  confirm: "Confirm",
  sending: "Sending a code to your email…",
  sendFailed: "The code could not be sent. Try again.",
  /** The phone refused to sign: what it was asked to sign differs from the card (security review M6). */
  refused: "This didn't match what's on screen, so nothing was signed.",
} as const;

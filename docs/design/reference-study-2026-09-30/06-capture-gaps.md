# Capture gaps and useful next recordings

> **Reuse context:** This guide preserves the original Senryo example. Its D2/product decisions and existing-plan labels are historical, not rules for another app. Start with the [project handoff](PROJECT-HANDOFF.md).

[Study index](README.md) · [Component handoff](05-components-and-agent-handoff.md)

The current study covers the demonstrated journeys. These branches cannot be reconstructed exactly from the supplied footage. Their absence is evidence of a capture gap, not evidence that the apps lack the feature.

## Highest-value missing flows

| Priority | Gap | What a new recording should show |
|---|---|---|
| 1 | Passkey creation and sign-in | Actual Create passkey action, OS chooser, consent, success, later sign-in; cancellation/failure if available. Face ID alone does not establish passkeys. |
| 1 | Text-password setup/recovery | Field layout, requirements, visibility toggle, confirmation, invalid/weak/mismatch states, reset/forgotten path. Existing Solflare footage shows a numeric passcode instead. |
| 1 | Successful funding | From method choice through amount/network/address/authorization to pending and credited balance, with return and receipt. Current crypto/Apple Pay/KYC flows stop early. |
| 1 | Successful order lifecycle | Valid funded amount, enabled confirmation/slider behavior, review, pending, success, resulting position and close/cancel. Current recordings show zero/insufficient-funds states. |
| 2 | Security alternatives | Recovery phrase create/import, Shield, private-key import, hardware-wallet connection; record layout/sequence while keeping actual secrets hidden. |
| 2 | Error/cancel recovery | Denied/cancelled biometric/provider login, unavailable network, interrupted verification, order failure/retry, failed username submission, passcode mismatch. |
| 2 | Complete risk control | Enter SL/TP price and %, validate bad values, save, reopen/edit, and show the linked position. Capture keyboard and return path. |
| 2 | Settings/account utilities | Actual settings menu, network/address switching, notifications, account management, avatar/banner edits, saved bio, rewards/history. Solflare's settings menu is tutorial artwork here. |
| 3 | Send/receive results | Recipient search, selected recipient, review/error/success; QR Copy confirmation and native Share result; chain/network switching. |
| 3 | Social/search/discovery | Entered search and results, follow/unfollow persistence, clan detail, ranking filters, feed interaction, external dApp navigation. |
| 3 | Motion exits/gestures | Slow open/close repetitions, outside taps, drag-to-dismiss, interrupted transition, repeated navigation and keyboard dismiss. Existing footage does not establish all gesture thresholds. |

## Recording method for fidelity

For each flow, start on the parent screen and pause briefly before the trigger. Enter the child, wait for loading to settle, scroll to the bottom, show the main action, and return using the intended back/dismiss control. Repeat one transition slowly to make its layering clear, then once at normal speed. Include unsuccessful/empty and successful states when practical. Keep system prompts and keyboard transitions in the recording.

For animated art, hold a screen long enough to see a complete loop, then show its transition to the next state. For the fan/dock/sheets, include opening, settled state, selection, dismissal and restored parent. For cards, capture both the card and its opened destination.

Use demonstration data for any future shareable capture and keep secrets offscreen. A visible pending state is useful; do not shorten it so aggressively that agents confuse network completion with animation timing. Source resolution/frame rate and a short description of which branch was attempted help align later evidence.

No additional recording is required to use the current guide as inspiration. These gaps become blockers only when a future agent claims exact fidelity for the missing behavior.

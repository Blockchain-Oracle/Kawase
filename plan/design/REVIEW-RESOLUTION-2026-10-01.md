# Resolution log: Codex mobile UX review (2026-10-01)

Purpose: what was done about each finding in `MOBILE-UX-REVIEW-CODEX-2026-10-01.md`, with evidence. A finding is "fixed" only with the evidence named; "in progress" and "open" stay visible until then (review §9.5, §10 Pass 4).
Last updated: 2026-10-01

## Pass 1 — trust and recovery contract

| ID | Status | What changed | Evidence |
|---|---|---|---|
| R01 session cleared on network errors | fixed | only a 401 clears the session; offline/5xx keep the token and the cached last user, mark the session stale (banner with Retry, timer + foreground retries); a never-cached offline open shows a "can't reach Kawase" page instead of a blank one; home shows the first-steps checklist only from a known wallet state; activity re-reads when the connection returns | simulator: api stopped → cold start keeps @kawasedemo with "You're offline. Showing what Kawase knew last.", no false "Set up your wallet"; api back → one Retry → banner gone, activity reloaded ("To Bob", "To Carol") |
| R02 authority scope after approval | fixed | the allowance proposal is fetched first; "What you're allowing" renders the scope decoded from that payload above the approval button; that exact payload is checked, signed and submitted; a stale proposal is re-fetched and shown again; completion shows the accepted receipt | simulator: revoke → "Turn on the daily allowance" → scope (network, until, can, can never, worst case) above "Accept with Face ID" → Face ID match → "You're all set" |
| R03 unavailable treated as approved | fixed | `wallet/biometric.ts`: `approved · cancelled · failed · unavailable` (Android face unlock named); setup and the send route continue only on `approved` and say why otherwise; buttons name the real check | simulator: EURC send → Face ID no-match → Cancel → "Face ID was cancelled. Nothing was sent.", send still waiting, no transaction; allowance accepted with a match |
| R04 network provenance | fixed | activity kept per (account, network), newest read wins, mismatched rows dropped, stale rows marked; stored chat cards render their own recorded network. Found while verifying: the React Compiler memoized the module-store read in render, so activity never left "loading" — the store is now read only through `useSyncExternalStore` snapshots | simulator: cold start shows recent rows with contact names; network race not runnable (mainnet off locally) |
| R05 failed revoke leaves the hold committed | fixed | HoldToConfirm separates the hold from the result (`done`, `resetKey`); revoke runs idle → signing → pending → confirmed/failed/checking/unconfirmed and re-reads `/wallet` instead of re-sending; the api asks the chain whether the grant is disabled | simulator: hold → "Turning off…" → off only after the api confirmed; failure paths by code |
| R06 web /welcome 500 | fixed | the story and the two dev routes used the native Skia orb directly; they now use the platform wrapper `components/orb` | `GET /welcome` 500 → 200 on the local web server |
| R08 auth/setup errors misclassified | fixed in code | sign-in phases separated (a valid code never shows "invalid code"; wallet creation retried alone), wrong/expired/rate-limited/offline named, late completions ignored after close, resend cooldown, wallet-load error with Retry, guest-start failure with Retry | Turnkey error codes for a real wrong/expired code not yet observed |

## R17 — the Stage 5 send/contact drafts

| # | Status | What changed | Evidence |
|---|---|---|---|
| 1 currency once | fixed | `formatAmount(…, { withSymbol: false })` where the symbol is drawn separately; `useMoney` no longer appends a second symbol (api summary too) | simulator: "19.99 USDC available", review "1.00 USDC" |
| 2 device-approval bypass on the send route | fixed | only `approved` signs; unavailable/failed/cancelled each have their own words | simulator: no-match + Cancel → nothing signed; match earlier → `0xdd15a43f…9f20` |
| 3 refresh ownership | fixed | reads are tagged with an epoch bumped by every action; an older version or a non-final state never replaces a newer/final one | code |
| 4 lost connection while money moves | fixed | `connectionLost` from failed reads; a transport error after an action re-reads the send instead of toasting "failed"; the status says the send may still be going through | code |
| 5 resolve-and-resume continuation | fixed | the network-switch carry-over keeps the request until the new send exists and offers Retry | code |
| 6 provenance after an edit | fixed | a hand edit of the address field marks it typed; the "how do you know" question was removed (Abu) and the source is inferred | simulator |
| 7 recipient inspection | fixed | the recipient row on the review expands to the full selectable LTR address and "You wrote …" | simulator: tap → `0x067e95C4…f96bf323a`, "You wrote "bob"" |
| 8 flight only on success | fixed | the plane flies off only for a send this screen watched move and then confirm; other endings fade in calmly | device run pending |
| 9 localization of new strings | fixed | all new keys in ten catalogs; key-parity and placeholder tests pass | `packages/i18n` tests 5/5 |
| 10 chat approval vs D33 | fixed and documented | inside the allowance the chat proposal is approved as it is made; after a fix on the card the same request continues; Face ID routes wait on the card; the moving card always shows "amount → recipient"; DESIGN.md states the screen/chat distinction | simulator: "send 1 usdc to bob" → card opens on "Sending…" with no tap → "Sent · 1.00 USDC to Bob"; the agent says it is on its way |
| 11 mixed-script amounts | fixed | the keypad display renders the fraction in the locale's digits too | code |
| 12 provenance when saving from chat | fixed | carries the recipient's source, or "added in chat" | code |

## Pass 2 — one coherent journey

| ID | Status | What changed | Evidence |
|---|---|---|---|
| R07 state-aware routing | fixed in code | the handle step is asked once per account (`users.handle_prompted_at`, migration `0006`); after sign-in: handle only if never answered, setup only if the wallet is not set up on the active network, else the sheet closes; the page under sign-in is remembered and returned to; nothing is submitted for the person (the chat send card re-checks after sign-in and waits for a tap) | sign-in routing not run on a device (needs a sign-out); web sign-in landed on home as expected |
| R09 home by state | fixed | guest intro + "Try it in chat"; unknown (skeleton/last known, no checklist); setup (step n of 4); fund (Get test USDC); first send; ready (USDC balance with its mark, allowance cue, EURC row, one lime Send); the allowance is an optional card, not a step; the plus is quiet glass | simulator: ready state (`h-ready.png`); other states need other accounts |
| R10 story that explains | fixed | five panels, one product event each, built from real cards and marks, labelled "Example · Arc Testnet": request → fields, the allowance boundary, test vs real money, one request in three languages, the first task | simulator via `/dev/board/story`, Arabic RTL; web `/welcome` renders the new story |
| R11 interruptible carousel | fixed | stops on the last panel; pauses for drag, sheets, unfocus, background, screen reader, reduced motion; drag cancels travel and settles; labelled non-overlapping step buttons; RTL placement fixed | simulator swipe both directions incl. Arabic |
| R12 promise only what works | fixed | entry points from the capability registry; Request shows "Soon" before the tap and does nothing; Send leads the fan; chips only for working things | simulator fan (`h-fan.png`), web home shows "Soon · Request" |

## Web (judges reach Kawase here, D10)

| Item | Status | Evidence |
|---|---|---|
| Web sign-in | working | `@turnkey/react-wallet-kit` behind the shared core; email code → Turnkey session → api proof → home as @kawasedemo, in Chrome at `localhost:8081` |
| tslib web crash | fixed | `metro.config.js` resolves `tslib` to `tslib.es6.js` on web |
| Sheet text input on web | fixed | gorhom's input called an API react-native-web lacks; a plain field is used on web |
| Approvals on web | built, last step unverified | the web's device check is a fresh email code verified by Turnkey's enclave (`initOtp` + `verifyOtp`, no new login) in a sheet (`wallet/web-approval-host.tsx`), behind the same `confirmWithBiometrics` contract; buttons read "Send/Accept with an email code" | Chrome: EURC send → "Send with an email code" → sheet "Confirm it's you · Send 1.00 EURC to Bob" → code requested and accepted by Turnkey; cancel → nothing sent. Entering the code + web signing not run (mail.tm outage) |
| Web wording | open | a few send-flow lines and the cancel toast still say "Face ID" in a browser |
| Desktop width | open | the phone layout stretches on a laptop (story art misplaced, a black disc over the progress bar) — next: a phone-width column on wide screens |

## Pass 3–4

Not started: R13–R16, the acceptance matrix (§11).

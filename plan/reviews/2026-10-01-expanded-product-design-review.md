# Kawase: expanded product, design and architecture review

Reviewed 1 October 2026. This extends the earlier [product scope audit](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-product-scope-audit.md) with the design review requested in this turn. The paired [Senryo review](/Users/abu/dev/hackathon/metropolis/docs/design/reviews/2026-10-01-expanded-product-design-review.md) and [shared handoff](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-two-project-review-handoff.md) complete the two-repository request.

**Verdict:** the concern about narrowed implementation is supported, but the evidence does not establish that the builder has abandoned the full product. The plans explicitly retain much of it. The recurring problem is that a broad capability gets represented by one working path, while recovery, controls, other actions and acceptance evidence remain unfinished. The current visual system is considerably stronger than the earlier onboarding review; further work should complete its journeys and information hierarchy.

## Evidence and authority

- Original scope: [Abu's decisions](/Users/abu/dev/hackathon/tamion/context/08-product-research/DECISIONS-FROM-ABU.md), [master plan](/Users/abu/dev/hackathon/tamion/plan/MASTER-PLAN.md), stage files, [DESIGN.md](/Users/abu/dev/hackathon/tamion/DESIGN.md) and [revamp plan](/Users/abu/dev/hackathon/tamion/plan/design/REVAMP-PLAN.md). D33 governs wallet authority; D34/D35 govern the reference-led redesign, optional handle, language entry and Lime on Ink direction.
- References: the local Solflare, Phantom and Fomo study, including its [identity contract](/Users/abu/dev/hackathon/tamion/docs/design/reference-study-2026-09-30/08-logos-and-identity.md) and [component/behavior guide](/Users/abu/dev/hackathon/tamion/docs/design/reference-study-2026-09-30/05-components-and-agent-handoff.md). Reference features are interpreted through Kawase's approved product scope, rather than automatically imported wholesale.
- Existing `/tmp` simulator screenshots were inspected and selected images preserved. No new screenshots, builds, chain actions or production checks were performed. Screenshots show the captured build, not necessarily the newest source.
- Source baseline: `1278f5a5af40605b1a1b0ea2e01f1333ebbad6ad`, plus the auto-save working changes. [Manifest and source snapshots](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-expanded-evidence/manifest.json) record hashes, original image times and the working tree. Another agent was editing during the review. **Closing update:** the builder now records auto-save as built and tested on Arc testnet, including balance restoration and incoming-USDC wakeup, in the Stage 8 progress log. Those are recorded builder results, not tests rerun by this review; the inspected K01–K03 source stayed unchanged.
- Read-only 21st scans completed with zero errors: mobile source, 160 files, four warnings/ten suggestions; native UI package, 60 files, three warnings/20 suggestions. [Mobile scan](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-expanded-evidence/apps-mobile-src-21st.json) and [UI scan](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-expanded-evidence/packages-ui-native-src-21st.json). Autofocus and hardcoded art-color findings require context; they are not automatically product defects. No `.21st/design.json` was found at the root or app locations checked, so the approved design documents were used.

![Saved Kawase screen comparison](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-expanded-evidence/images/tamion-saved-screen-board.jpg)

## Prioritized findings

### K01 · P1 · A claimed automation can be stranded by interruption

**Proven source defect; architecture/recovery.** [Automation service](/Users/abu/dev/hackathon/tamion/apps/api/src/automations/service.ts:568) inserts an `executing` occurrence, advances the schedule, invokes the money pipeline, then attaches the resulting intent. These are separate operations. If the process stops after claiming and before creating/linking the intent, a later tick sees the occurrence already claimed and returns. [Settlement](/Users/abu/dev/hackathon/tamion/apps/api/src/automations/service.ts:663) uses an inner join to intents, so a run without an intent is invisible to it. The new auto-save branch also waits whenever an executing run exists, which can make this orphan block subsequent checks.

The unique occurrence key prevents a duplicate claim; it does not prove completion or recoverability. The stage's statement that restarts lose nothing is too broad for this window. Preserve the working transfer/delegation checks, but persist a recoverable run state and stable operation identity before execution, reconcile orphan claims, and resume the same money intent. [Executor](/Users/abu/dev/hackathon/tamion/apps/executor/src/main.ts:1) and [workflow package](/Users/abu/dev/hackathon/tamion/packages/workflows/src/index.ts:1) remain placeholders. Moving to DBOS alone will not repair an operation whose identity was never persisted.

**Acceptance:** interrupt at claim, schedule advance, intent creation and intent link; restart; each occurrence reaches one truthful terminal outcome without an extra payment. Include auto-save's blocked-following-run case. This needs a targeted integration/recovery check, not another successful-schedule demonstration.

### K02 · P1 · The model still describes an approval step that the server skips

**Proven contract mismatch; product truth.** [Prompt](/Users/abu/dev/hackathon/tamion/packages/agent/src/prompt.ts:20) says nothing moves until the person taps Send. [Agent context](/Users/abu/dev/hackathon/tamion/apps/api/src/agent/context.ts:98) approves inside-allowance chat sends immediately. That implementation follows D33 and the updated DESIGN.md; the prompt did not catch up. Its introductory capability sentence also describes card confirmation universally.

An accurate moving card does not neutralize contradictory assistant speech. Use the actual intent outcome and policy route to distinguish moving, confirmed, blocked and awaiting-device-approval. Keep the screen/chat distinction explicit in the same authority contract used by prompt, tool summary and UI.

**Acceptance:** an inside-allowance chat send never says it is waiting for a tap; an approval-required send never implies execution; a blocked request names the actual next action.

### K03 · P1 · Resolve-and-resume remains specific to individual cards

**Proven source gap; interaction/architecture.** [Automation card](/Users/abu/dev/hackathon/tamion/apps/mobile/src/chat/automation-card.tsx:50) can redraft a scheduled send after adding a contact, but its sign-in fix only opens sign-in, and its wallet fix navigates away. There is no equivalent completion-triggered resumption here. The redraft is transfer-shaped and returns when `action` is absent; an auto-save request needs its own preserved payload. The earlier audit also found guest drafts losing the original actionable amount/identity.

This repeats the user's concern beyond automation: a working local flow is treated as the general product behavior. [Stage 4](/Users/abu/dev/hackathon/tamion/plan/stages/04-agent-brain-resolve-and-resume-chat.md) still requires durable intent resumption and `/i/[intentId]` links. The existing send card offers useful continuation behavior to reuse, but a shared continuation contract must preserve action type, parameters, original network, version and authority.

**Acceptance:** start a scheduled send and auto-save as a guest; sign in or complete setup; return to the same accurate proposal without repeating the request. Reopen after remount. Changing network must not silently rewrite an existing proposal's destination or authority.

### K04 · P2 · Broad capability flags conceal remaining product branches

**Scope/architecture finding.** [Capability registry](/Users/abu/dev/hackathon/tamion/packages/config/src/capabilities.ts:46) marks `swap`, `bridge`, `yield` and `automations` shipped. The implemented slices differ materially from the complete scope: USDC/EURC swap; outbound CCTP bridging; selected USDC vault actions; scheduled sends plus auto-save. A flag can truthfully enable an entry point while still being insufficient to answer whether a specific request works.

Keep coarse navigation flags if useful, and add finer action/network/asset/provider availability consumed by policy and agent tools. [Stage 6](/Users/abu/dev/hackathon/tamion/plan/stages/06-trading-tokens-bridge-yield.md:4) already names arbitrary tokens, token rules, other executable routes and portfolio charts as open. [Stage 8](/Users/abu/dev/hackathon/tamion/plan/stages/08-automations-delegated-authority.md) now records the first balance/event behavior in auto-save; broader conditions/actions, price-triggered execution, templates and practice/attended behavior remain. These are reminders of agreed work, not evidence that all such features should execute arbitrary calls today.

**Acceptance:** the capability answer to “swap token X,” “bridge using the cheapest executable route” and “act when a price threshold is met” reflects the precise supported branch. A broad label cannot stand in for that answer.

### K05 · P2 · The control surface does not yet fulfill user ownership of policy

**Partial implementation; planned remainder.** The [limits screen](/Users/abu/dev/hackathon/tamion/apps/mobile/src/screens/limits-screen.tsx:211) exposes allowance status and revocation, which are useful real controls. It does not complete editable spending budgets, risk/practice behavior or general action rules. [Settings](/Users/abu/dev/hackathon/tamion/apps/mobile/src/screens/settings-screen.tsx:150) honestly labels multiple controls as coming. Stored risk/practice/display preferences should not be described as behavior until their effect is connected to execution and previews.

Finish policy controls with observable consequences: changing a limit changes the next evaluation; practice produces “would have” outcomes without real execution; global pause applies to all relevant action paths; loosening onchain authority requires the corresponding new approval. Maintain the distinction between an app-side preference and an onchain enforceable bound.

### K06 · P2 · Vault rows expose technical names and crowd out useful context

**Observed visual issue plus current source confirmation; design/information hierarchy.** The saved Earn screen shows `EarnKit USDC Vault (Arc T…)` and `MockMorphoVault (Arc T…)`, with large liquidity figures and a shortened protocol/curator line. [VaultRow](/Users/abu/dev/hackathon/tamion/apps/mobile/src/earn/vault-row.tsx:47) renders the raw name on one line. The real Morpho mark and separated APY are good; the displayed identifier reads like configuration rather than a deliberate user-facing choice.

Give known vaults a curated display title while retaining the full authoritative name/address in detail. Keep the protocol mark, network, curator, mock/test label, yield basis and withdrawal liquidity distinct. Format unusually large available amounts compactly in the list, with exact values in detail. Selection and risk information must remain understandable when two vaults have similar names; APY alone is not identity.

**Acceptance:** at phone width and large text, users can distinguish each vault, its protocol/network and its test status without relying on an ellipsis or an APY guess.

### K07 · P2 · Entity artwork is implemented, but route-provider identity is still weak

**Design-system gap, not a general finding that every icon is wrong.** USDC/EURC, Arc, destination chain badges, Morpho and avatars already use actual marks. In [bridge comparison rows](/Users/abu/dev/hackathon/tamion/apps/mobile/src/bridge/bridge-review.tsx:102), the provider is text alongside a selection check. The check is a status utility; it cannot provide recognizable provider identity. Known provider artwork should be a separate leading entity, with selection, availability reason and quote to its side. Keep an honest named fallback if the mark has not been delivered.

The review already shows source and destination asset/chain identities separately. Preserve that. Do not replace navigation, info, check, copy or close utilities with logos. The larger functional limitation—comparison without alternative-provider execution—is covered by the earlier scope audit and remains open.

### K08 · P2 · Design acceptance is still weaker than implementation completion

**Evidence/process gap.** The [resolution log](/Users/abu/dev/hackathon/tamion/plan/design/REVIEW-RESOLUTION-2026-10-01.md:60) explicitly leaves an acceptance matrix, Android/TalkBack, large text, some RTL/motion and other device checks unfinished. A logged fix is useful evidence of work, but “fixed in code” and “accepted on the supported platforms” need separate statuses. The [voice overlay](/Users/abu/dev/hackathon/tamion/apps/mobile/src/overlay/voice-overlay.tsx:139) is currently a clear “Voice is on its way” state; its attractive orb does not fulfill the first-class voice promise.

The saved Request capture has untranslated key strings. The current English catalog contains those keys, so this is **historical capture evidence, not a proven current translation defect**. Likewise, older reported onboarding, web-500 and authority problems should not be reopened automatically: the resolution log records corrections. Bind evidence to the revision being accepted and retain specific outstanding checks.

## Whole-product remainder: what the agent must carry forward

This matrix complements the earlier audit's 21 feature groups. “Planned” means still required, not silently excluded. Runtime claims below distinguish code or the builder's recorded evidence from fresh verification by this review.

| Product area | Current evidence | Required remainder / stage |
|---|---|---|
| Sign-in, wallet, allowance | Implemented; prior simulator evidence recorded; scope-before-approval and biometric outcomes corrected | Returning-account/terms branches, device/session controls and supported-platform acceptance; trust stage 11 |
| Send and contacts | Working screen/chat paths; own request can authorize an inside-allowance chat send | Product-wide durable continuation and editable controls; stage 4/5 |
| Request/payment links | Code and current catalog present; saved screenshot predates translation completion | Accurate settlement attribution, interrupted-link/payment lifecycle and wider business use; stage 5 |
| Business | Consumer send/request functionality is insufficient to close business scope | Invoices, batch review, payroll and reporting; stage 5 and subsequent dependent stages |
| Trading/tokens | USDC↔EURC slice | Arbitrary supported tokens, search/safety, user token rules, brake and charts; stage 6 |
| Bridging | CCTP execution and provider comparison | Other executable providers, cost/ETA selection, other supported directions and recovery; stage 6 |
| Earn | USDC vault deposit/withdraw and real protocol mark | Mainnet acceptance, rewards and cross-chain branches recorded as open; stage 6 |
| Automation | Scheduled sends and auto-save now recorded as tested; auto-save includes balance checks and incoming-USDC wakeup | Recover claimed runs first; broader conditions/actions, price triggers, templates, editing, practice/attended modes and “Needs you”; stage 8 |
| Voice | Orb/overlay and honest coming state | Two-way voice, interruptions, action cards, transcript/typed continuity and languages; stage 10 |
| Marketplace/x402 | Coming state | Real service discovery, pricing, bounded purchase and receipt/refund behavior; stage 7 |
| Notifications/inbox | Inbox pieces present; settings do not complete the full channel promise | Push/email policy and actionable deep links; stage 9. Telegram/Discord were explicitly removed, so do not restore them |
| User controls/memory/trust | Some stored fields and real allowance revocation | Visible policy effects, memory controls, devices, consent, audit and support; stages 4/11/12 |
| Platforms and delivery | Shared Expo app and UI; simulator evidence | Android, desktop shell, docs, landing/showcase, production hardening and judge journeys; stages 13–16 |

## Design guidance for the next pass

Use the references for interaction grammar: Solflare's stable onboarding controls and explanatory scenes; Phantom's contextual fan and restored parent; Fomo's nested funding sheets, distinct identity roles and trading hierarchy. Preserve Kawase's approved lime, silver art, language entry and orb. The references' copied sample balances and unsupported features are not target data.

| Surface | Preserve | Next correction / acceptance |
|---|---|---|
| Home | Real token marks, one strong Send CTA, explicit testnet strip, allowance cue | Make next steps state-dependent; any later chart must use real portfolio data and clear stale/error states |
| Fund/receive | Separate entity marks from QR/copy utilities | Back from a network child restores the funding parent, choice and amount; every QR names the correct network |
| Swap | Large entry amount, token identity, keypad, explicit disabled CTA | Full retained amount through refresh/approval; wider token/safety scope must not be hidden behind the polished pair swap |
| Bridge | You-send/you-receive, minimum, network and route reasons | Add provider identity and align route claims with actual execution support |
| Earn | Protocol mark and explicit non-guaranteed/test yield copy | Curated readable title, complete detail, risk/curator/liquidity roles |
| Automation | Read-back, upcoming runs, grants and management | Condition/action disclosure; working continuation; active, skipped, failed, unknown and expired states, with truthful next action |
| Voice/chat | One orb, preserved reading position, typed fallback | Keep unfinished voice honestly labeled; complete the voice action/recovery journey rather than polish the placeholder further |

Screenshots establish settled visual states. Motion acceptance still needs the original or future recorded sequence: trigger, travel, child entry, keyboard, interruption, exit and restored parent, plus reduced motion. No claim about motion quality is based only on the contact sheet.

## Agent handoff and completion order

1. Repair K01–K03: recoverable operation identity, correct approval speech and durable continuation.
2. Bring the existing scope/status records up to date. Stage 5's header still says “not started” despite its progress log and source; broad shipped flags need subcapability records. Preserve every open branch with an owner and dependency.
3. Finish controls and exact product behavior before labeling whole capability families complete. Credit the tested auto-save branch, while retaining the remaining automation rules explicitly.
4. Correct K06/K07 and close design acceptance against the actual revision. Use the existing images as reference evidence; capture new evidence only when a changed implementation needs it.
5. Continue the full approved stage plan, carrying business, voice, marketplace, token rules, notifications and delivery work forward explicitly.

Each requirement should have: user/decision source → plan ID → implementation locations → supported actions/networks/platforms → failure/recovery → evidence revision → remaining work → owner/dependency. A folder, card or successful transaction closes only the branch it proves.

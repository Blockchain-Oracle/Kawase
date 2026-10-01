# Kawase: product intent versus implementation

Date: 2026-10-01. Baseline: `1278f5a5af40605b1a1b0ea2e01f1333ebbad6ad` (Stage 8a). Working-tree observations captured at 14:30 WAT while auto-save was actively being built.

**Finding:** Abu is right that the working product currently delivers less than the agreed vision. Automation is the clearest example of a wider pattern: an illustrative request becomes a feature's implementation boundary, while its remaining behavior survives mainly in prose. There is substantial working infrastructure and the plans explicitly acknowledge many unfinished items. This does **not** establish that the builder forgot the vision or decided to remove it. It establishes incomplete coverage, some contradictions, and a tracking system that makes omissions too easy.

This is an audit and a proposed correction to the build approach. Application source, existing plans, deployments, accounts and money were not changed. Runtime behavior was traced from source; prior testnet and simulator results were read as recorded evidence, not re-run. Visual quality, current production parity, mainnet availability, real-device voice and Android were not freshly verified.

[Evidence snapshot](/Users/abu/dev/hackathon/tamion/plan/reviews/2026-10-01-product-scope-evidence.json) preserves excerpts from the baseline commit and hashes/excerpts of the active changes. Code links below open current files, which may advance after this audit.

## 1. What was agreed

The controlling sources are Abu's [original brief](/Users/abu/dev/hackathon/tamion/context/08-product-research/ABU-BRIEF-VERBATIM.md), [binding decisions](/Users/abu/dev/hackathon/tamion/context/08-product-research/DECISIONS-FROM-ABU.md), and [master plan](/Users/abu/dev/hackathon/tamion/plan/MASTER-PLAN.md). Research suggestions remain subject to later decisions and actual provider availability.

| Commitment | Consequence for the build |
|---|---|
| D1: agent for the whole Arc ecosystem | Transfers, trading, bridge route choice, yield, marketplace, wallets and limits belong to one useful agent. |
| D11: consumers and businesses | P2P transfers do not discharge invoices, vendor payouts, batch payments or payroll. |
| D12: users set their token rules | A fixed two-stablecoin swap screen is an initial slice, not completion of token access. |
| D13: resolve missing setup and resume | The Alex example describes a pattern across requests, not only an add-contact button. |
| D2/D15: both networks, with explicit availability | Testnet proof and a network toggle do not prove mainnet parity. |
| D4/D5: whole-app multilingual and two-way voice | Translated catalogs and an orb do not complete voice or every language's end-to-end flows. |
| D16/D17: everything is MVP; quality is not cut for the deadline | Stages are an engineering order. A later stage or backlog item remains an obligation. |
| D25: iOS, Android, desktop, web, docs and showcase | An iOS simulator plus a web app is partial delivery. |
| D33: no PIN; signed limits; no prompt inside the approved allowance; automations approved once | Preserve the working permission model and accurately describe when execution happens. |

Telegram and Discord were explicitly removed by D31. The old Circle PIN custody design and the old color direction were superseded by D33/D34/D35. These are authorized changes, not omissions to restore. Optional sponsored mainnet funds and legally/provider-restricted products should not be presented as unconditional deliverables.

Abu's current threshold-to-Base example is an explicit clarification of the desired automation breadth. The older plan explicitly names event and price triggers, but does not contain that exact bridge rule. It is a natural combination of the already planned trigger and bridge capabilities; this audit does not pretend its exact trigger semantics were previously specified.

## 2. Automation: the full intended scope

Sources: [feature inventory H, D5 and F4](/Users/abu/dev/hackathon/tamion/context/08-product-research/FEATURE-INVENTORY.md), [automation research](/Users/abu/dev/hackathon/tamion/context/08-product-research/07-automations-contacts-safety/automations.md), [Stage 8](/Users/abu/dev/hackathon/tamion/plan/stages/08-automations-delegated-authority.md), and master plan lines 393–400. The table distinguishes explicit older commitments from today's clarification.

| Intended behavior | Source/status at the audit baseline |
|---|---|
| Scheduled sends to contacts, with one signed grant | H1–H3; implemented on testnet with recorded unattended-run evidence. |
| Create by chat and voice; clarify ambiguity; preview/read-back, dry run, next runs and maximum exposure | H2/S13; chat read-back and next runs exist. Voice, dry run and the complete clarification/preview contract remain open. |
| Price-triggered swaps using the executable quote | H5; planned in 8b, not implemented in the baseline. |
| Salary received → move 20% into savings | H6/F24; no salary-source filter or percentage-of-that-receipt action in the baseline or captured auto-save interface. |
| Balance below a threshold → notify | H6; planned; general alerts and delivery channels are not implemented. |
| Idle-cash sweep and redeem when needed | F4/H7; active auto-save work now adds keep-a-reserve, deposit excess and optionally refill from a vault. Not completed or verified by this audit. |
| DCA, limit orders/TWAP, round-ups, bill pay and payroll templates | D5/H7/R; scheduled send covers part of bill pay. The rest remains open. |
| Balance reaches a threshold → bridge to Base | Today's explicit clarification; no configurable bridge automation in the baseline or captured work. |
| Reusable combinations of supported on-chain actions | Interpretation of D1 plus today's clarification; a common trigger/action contract is recommended below. Not permission for unchecked arbitrary contract calls. |
| Pause, resume, skip next, cancel and revoke | H4; implemented for scheduled sends through app/API. |
| Edit in place, narrow/widen authority correctly, reminders and an actionable underfunded state | H4/S16; edit and 24-hour reminder are explicitly unfinished. A skip with a reason is not the full underfunded recovery journey. |
| Attended execution, practice records and a go-live gate | Stage 8/S3/S23; explicitly open in 8c. |
| Durable execution, trigger evidence, run history and no duplicate payments | H8; uniqueness and transaction reconciliation exist. The intended DBOS runtime and full audit trail do not. |
| Testnet and mainnet | Stage 8 exit criterion; recorded proof is testnet. Mainnet was not checked during this audit. |

### A1. The baseline interface can express only scheduled transfers

**Type: incomplete breadth; architectural extension needed.** The model's [draft_automation tool](/Users/abu/dev/hackathon/tamion/packages/agent/src/tools.ts) requires a recipient, a fixed amount and `every: day | week | month`. The [API](/Users/abu/dev/hackathon/tamion/apps/api/src/automations/routes.ts) accepts the same shape. The baseline data kind is `scheduled_send`; the [runner](/Users/abu/dev/hackathon/tamion/apps/api/src/automations/service.ts) casts its action to a transfer and calls `sends.runAutomation`.

There is no field for a balance condition, a receipt filter, a quote threshold, a bridge destination, a percentage amount, or a chain of steps. A more capable model cannot invoke a workflow that these interfaces cannot represent. Daily/weekly/monthly schedules and days 1–28 are also implementation limits; interval and month-end semantics must be explicit if supported.

The transfer restriction on the *everyday allowance* is a deliberate D33 boundary. It should stay. It does not establish that *every automation* must be a transfer. Other actions need their own validated execution handlers and appropriately scoped authority.

### A2. Auto-save is real progress, but does not close automation breadth

**Type: active work; do not judge unfinished edits as a completed feature.** During this audit, changes appeared in the schema, delegation integration, earn service, automation service, API routes and incoming watcher. They add `auto_save`, three grants for approval/deposit/withdrawal, a reserve amount, optional refill, and incoming-USDC wakeups. This is evidence that development is already moving beyond scheduled payments.

However, the captured [schema](/Users/abu/dev/hackathon/tamion/packages/db/src/schema/automations.ts) still expresses two specialized automation kinds with a required schedule. Incoming transfers pull an auto-save check forward; they are not represented as a general trigger with a receipt identity and filter. This does not express salary-only saving, a configurable balance-to-bridge rule, quote-triggered swaps, or payroll. Adding auto-save should not become a new definition of “automation complete.”

The [new save grants](/Users/abu/dev/hackathon/tamion/packages/integrations/delegation/src/save.ts) pin contracts, methods and payout addresses and expire. The `keep` reserve and a movement budget are not encoded in those grants. The reserve is therefore application behavior, whereas the permitted destination/methods are contract-enforced. The authority receipt must explain this distinction and the possible exposure of funds to the selected vault. This is a boundary to review when the feature is finished, not a claim that the new integration has been fully audited.

**Closing observation:** after the initial snapshot, `draft_auto_save` and its agent-context/prompt wiring also appeared. The evidence file records this separately. Auto-save is progressing through more layers; the wider configurable trigger/action contract and the send instruction contradiction remain unresolved in the inspected source. No in-progress compilation or integration-test result is asserted here.

MetaMask's own [delegation reference](https://github.com/MetaMask/smart-accounts-kit/blob/main/skills/smart-accounts-kit/references/delegations.md) includes function-call scopes and restrictions on target, method and calldata. The framework is not conceptually restricted to ERC-20 sends. This supports extending the existing design; it does not prove any proposed swap/bridge grant safe without checking its exact calls and bounds.

### A3. Duplicate claims are handled; recovery of a claimed occurrence is incomplete

**Type: correctness gap in the baseline; address before depending on unattended workflows.** The baseline runner inserts the occurrence, advances the schedule, calls the send service, then saves the returned intent id. These are separate operations. A crash after the claim or after the send starts, but before `intentId` is saved, can leave an executing run without a linked intent. `settleRuns()` inner-joins on the intent, so that orphan is excluded. A replay finds the unique occurrence already claimed and returns.

The send tracker can reconcile a separately created send. It cannot automatically reconstruct this missing occurrence-to-intent link. Thus the stage log's blanket “a restart loses nothing” statement is stronger than the source establishes. This is not a claim of demonstrated duplicate payment: the specific concern is stalled/lost work or an unreported outcome. With the captured auto-save check refusing to proceed while any run is executing, an orphan could also block later checks.

The [testnet integration](/Users/abu/dev/hackathon/tamion/apps/api/test/automation-testnet.test.ts) exercises a duplicate occurrence, on-chain refusal and lifecycle. It does not inject crashes at these boundaries. The separate DBOS spike is not evidence that this API-timer runtime has DBOS's guarantees.

The intended durable worker is still an [empty executor](/Users/abu/dev/hackathon/tamion/apps/executor/src/main.ts), and [workflows](/Users/abu/dev/hackathon/tamion/packages/workflows/src/index.ts) is a placeholder. DBOS documents [resuming workflows from completed steps](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial) and requires [idempotent external side effects](https://docs.dbos.dev/architecture). Moving into DBOS must preserve stable transaction identities and reconciliation; it is not sufficient to put a non-idempotent payment call inside a retrying step.

## 3. The same narrowing pattern outside automation

### B1. Route comparison does not implement cheapest-route execution

**Type: tracked deferral plus a meaningful behavior gap.** The plan requires fresh executable quotes, a route choice and an explanation. [compareRoutes](/Users/abu/dev/hackathon/tamion/apps/api/src/bridge/compare.ts) always prepends CCTP as `chosen`, then sorts the other quotes. The service prepares CCTP calls. Another provider can return a larger net amount and still remain quote-only.

Choosing the only route whose calls are validated is a sensible initial boundary. The completed behavior must eventually distinguish “best executable route among the routes we support” from “other routes quoted but cannot currently execute.” Showing comparison rows does not fulfill the promise of choosing the cheapest supported route. Socket is also absent from the implemented comparison.

The [bridge tool](/Users/abu/dev/hackathon/tamion/packages/agent/src/tools.ts) supports Arc → the user's own address on six destination chains. Bridging into Arc and cross-chain sending to someone else are explicitly open in Stage 6. A failed forwarder is recorded as `unknown_outcome` in the [bridge service](/Users/abu/dev/hackathon/tamion/apps/api/src/bridge/service.ts); the planned stuck-transfer recovery path is not wired.

### B2. Trading is a stablecoin exchange slice

**Type: tracked deferral at risk of being stranded.** The [swap tool](/Users/abu/dev/hackathon/tamion/packages/agent/src/tools.ts) and request types allow only USDC/EURC. The plan also includes supported arbitrary tokens, discovery, safety, copycat controls, user token rules, charts and portfolio. Stage 6 records these as unfinished. Its concrete build order ends at 6c earn, and STATUS's next-action sequence goes on to later stages without a specific token/routing completion slice.

This is not evidence that other tokens can safely be enabled today. It is evidence that a supported token integration and D12 settings must have an explicit remaining task, rather than be treated as optional because testnet liquidity is sparse. Unsupported testnet assets should receive an accurate availability explanation.

### B3. The agent's instructions disagree with the execution code

**Type: current contradiction; correct before adding more autonomy.** In [prompt.ts](/Users/abu/dev/hackathon/tamion/packages/agent/src/prompt.ts), sending says nothing moves until the user taps Send and the model should never say it was sent. The [propose_send tool description](/Users/abu/dev/hackathon/tamion/packages/agent/src/tools.ts) also says nothing is sent by the call. But [buildAgentContext](/Users/abu/dev/hackathon/tamion/apps/api/src/agent/context.ts) immediately calls `sends.approve()` when the draft is inside the allowance, following D33.

Consequently the agent can describe an action as waiting for confirmation while the backend has already started it. The returned intent state must be the basis of the response, and all instructions must reflect both allowance and wallet-signature paths.

The prompt also says the user can ask the agent to pause, skip or cancel an automation. The baseline tool set exposes drafting but no automation list/get/pause/resume/skip/cancel tools. App/API management exists. Agent management parity does not. This is a concrete example of an agent that can create a feature but cannot fully operate it conversationally.

### B4. Resolve-and-resume is not yet a product-wide contract

**Type: cross-cutting incompleteness, with a concrete automation defect.** Sends have useful sign-in and add-contact continuation, retryable network carry-over and funding controls. That is real progress. The baseline guest automation branch in [agent context](/Users/abu/dev/hackathon/tamion/apps/api/src/agent/context.ts) instead returns a synthetic card with no id, `amount: "0"` and no note. Its [card](/Users/abu/dev/hackathon/tamion/apps/mobile/src/chat/automation-card.tsx) opens sign-in, but has no send-equivalent post-sign-in recheck. The original amount is not retained in that card's action.

The general durable resume service, `precondition.cleared` handling and `/i/[intentId]` route described in Stage 4 are absent from the inspected runtime/routes. Intent rows and persisted chat history exist, so it would be inaccurate to say nothing is durable. What is missing is the consistent mechanism for preserving, finding and continuing the initiating task after funding/setup, closing the app, a network change or a fix on another device.

### B5. User controls are partly data fields rather than functioning controls

**Type: tracked deferral and an integration hazard.** The [limits screen](/Users/abu/dev/hackathon/tamion/apps/mobile/src/screens/limits-screen.tsx) provides an authority receipt and allowance revoke/re-enable. The plan also requires editable per-payment/daily/weekly limits, allowlists, new-recipient rules, temporary raises, pause-all, risk modes and an exit kit. Many are not exposed yet.

There is a real limit reader: [userLimits](/Users/abu/dev/hackathon/tamion/apps/api/src/send/facts.ts) supports stored limits and temporary values. This is not simply a fixed-limit implementation. But the user-facing management paths remain open in 5c. `riskMode`, `practiceMode` and `displayCurrency` are accepted as profile fields; searches of the inspected execution/agent/UI paths found no corresponding runtime semantics. Disabled settings correctly signal unfinished work. Those fields must not be exposed as working safeguards before execution actually obeys them.

### B6. Business and continuous audit are much thinner than their labels

**Type: planned work, not an authorized scope cut.** Requests, share links, incoming matching and inbox entries are implemented. Business profiles, invoices with reference matching, vendor labels, split bills, batch payouts and payroll remain open. [matchIncoming](/Users/abu/dev/hackathon/tamion/apps/api/src/requests/service.ts) pays the oldest open request with the matching asset and exact amount; it does not implement invoice-reference reconciliation. Payment requests are useful, but do not complete business operations.

Similarly, a receipt proves transaction outcome; it does not supply the promised “why this action happened” page. [audit_log](/Users/abu/dev/hackathon/tamion/packages/db/src/schema/system.ts) is defined, but the inspected runtime has no audit writer. There are useful policy reports and outbox records; those are ingredients for the continuous audit, not the complete user-visible decision log, outcome grading or weekly report.

## 4. Whole-product coverage check

Every A–U group in the feature inventory was considered. “Implemented slice” below means source paths and recorded stage evidence exist; it does not mean a fresh production or full-platform acceptance pass was performed. “Deferred” means it remains in the written scope. No completion percentage is asserted because features and flows have very different sizes.

| Inventory group | Present | Remaining scope / limiting pattern | Owning plan/source |
|---|---|---|---|
| A Account, onboarding, wallet | Guest/account paths, Turnkey wallet setup, network context, language controls, receive/faucet | Broader funding sources, external-wallet funding, devices/recovery and verified both-network behavior | Stages 3/11; settings, auth and wallet services |
| B Balance/portfolio | USDC/EURC balances and earn positions | Unified cross-chain balance, broader tokens, display-currency conversion, portfolio/charts and dust/spam controls | Stages 5/6; wallet/earn; disabled currency row |
| C Money movement | Send, receive, request links, receipts, incoming matching | Split, batch, QR scan, richer memos/reference matching, cross-chain recipient send | Stage 5c and Stage 6 leftovers |
| D Trading/tokens | Stablecoin swap with quote/minimum and safety checks | Supported other tokens, user rules, discovery/safety, limit/DCA/TWAP workflows, bridge+swap journey | Stage 6; fixed asset schema/tool |
| E Bridge | Outbound CCTP, status tracking and other-provider quote rows | Executable route choice, inbound routes, recipient choice and stuck recovery | Stage 6; compare/service/tool |
| F Yield | App Kit vault overview, positions, deposits/withdrawals | Auto-save in progress; broader yield integrations, cross-chain funding and rewards as applicable | Stages 6/8; earn service |
| G Marketplace | Scope and capability placeholder | Discovery, autonomous purchase under budget, seller demo, receipts and untrusted-result handling | Stage 7 not started; no runtime purchase tools |
| H Automations | Scheduled-send unattended execution and app lifecycle | Trigger/action breadth and lifecycle/recovery gaps in §2 | Stage 8a/8b/8c |
| I Contacts | Names/handles, versioned addresses, cooldown and payment history | Names on other chains, QR/import, save-from-received and verification workflows | Stage 5c; contacts and recipients |
| J Notifications | Inbox and incoming/skipped/completed event records | Push/email delivery, preferences, quiet hours, alerts and native activity/widget | Stage 9; D31 removes Telegram/Discord |
| K Voice/languages | Ten locale catalogs, agent reply language, voice overlay shell | Two-way STT/TTS, interruption, captions, mid-speech cards, settings and measured language/device flows | Stage 10; voice-agent placeholder |
| L Generative UI | Explicit tool-result cards for implemented actions | Single versioned declarative catalog/twins, safety/marketplace/decision/chart/editor cards | Stage 4; ToolCard switch; cards package empty |
| M Agent intelligence | Shared chat turn, real tools, persisted threads and typed product facts | Thread search, rolling summary, editable memory, risk behavior, proactive suggestions, knowledge help and planned quarantine/taint | Stage 4; prompt/turn/tool/context |
| N Safety/limits | On-chain allowance and recipient-bound automation grants, policy checks, receipt validation, cooldown/lookalike handling | Management UI, temporary raises, allowlists, risk/kill-switch/exit behavior and per-action automation bounds | Stages 5c/8/11 |
| O History/reporting | Activity and receipts for implemented transactions | Why pages, export, decision/outcome grading and weekly reports | Stage 12; audit writer missing |
| P Settings | A real hub with language/theme/network and account paths | Coming rows for currency, notifications, voice, memory, devices, privacy/trust; deeper limit controls | Revamp/Stages 4–12; settings screen |
| Q Platforms | Expo iOS and web implementation, recorded simulator and web flows | Android acceptance, desktop/PWA parity and full physical-device validation | Stages 1/13/16; no desktop app yet |
| R Business | Contacts and payment requests reusable by businesses | Business profile, invoices/reference matching, vendor payouts, payroll, AP/AR journeys | Stages 5c/8; D11 remains binding |
| S Friction/trust | Guest flow, faucet, first steps, authority receipt, some money status/reconciliation | Practice, fee reserve, degraded/status/heartbeat, needs-you queue, complete exit/help, reporting and reminders | Stages 8/11/12/15 |
| T Resolve/resume | Stronger implementation for sends; persisted intents | Uniform task continuation, cleared-precondition events, deep links and remaining inline fixes | Stage 4; automation guest gap |
| U Accessibility/privacy/x402 boundary | Existing accessibility and explicit wallet-approval work | Full no-mic/device/assistive-tech proof, retention/delete/export controls, marketplace purchase boundary | Stages 7/10/12/16 |

Docs, landing/showcase, desktop and the judge proof pages are also separate deliverables in Stages 13–16. Their absence is already acknowledged; they are not evidence of a secret decision to remove them. Real-device social sign-in and mainnet provider approval were recorded as open conditions. Their current external status was not rechecked, and neither should be inferred from stale notes.

## 5. Why the omissions can recur

1. **Examples become acceptance criteria.** Stage 8 names broad automation scope but its exit criteria focus on the Tuesday transfer, grant negatives, editing and practice. They do not demand completion of event triggers, price triggers, DCA or payroll. A narrow happy path can pass while the feature definition stays incomplete.
2. **Feature flags have insufficient detail.** [SHIPPED_CAPABILITIES](/Users/abu/dev/hackathon/tamion/packages/config/src/capabilities.ts) marks `swap`, `bridge` and `automations` available as whole categories. It cannot describe supported assets, trigger/action types, source chains, executable routes or modes. The tool schemas are more truthful, but no longer share the planned single availability contract with the rest of the product.
3. **Cross-cutting requirements are left to feature-by-feature implementation.** Resume, authority, audit, privacy, platform parity and conversational management are not required for every feature slice before it is called complete. They therefore arrive inconsistently.
4. **The resume file contains conflicting eras of status.** [STATUS](/Users/abu/dev/hackathon/tamion/plan/STATUS.md) has later prose documenting successful web sign-in and requests, while older next-action entries and checklist rows still say web sign-in is open and earlier passes are next. It is useful history, but a poor unambiguous current checklist.
5. **Large leftovers do not have concrete return steps.** 5c is a large bucket. Stage 6's arbitrary tokens, route execution and recovery have no comparably concrete next slice in the current queue. “Still open” is better than forgetting, but does not ensure they will be completed.
6. **Research documents retain superseded scope.** The old feature/flow inventories still name Telegram/Discord and describe business as undecided, despite D31/D11 and the master plan. Current decisions should resolve these explicitly whenever a checklist is regenerated.

Performance choices such as deterministic money execution, short LLM responses, atomic batches, compact tool output and scoped grants are reasonable. They do not require reducing supported automation to scheduled payments or fixing route selection to CCTP forever. Some integration work is substantial and should remain gated on verified support. That work should be tracked, not silently replaced by a smaller product definition.

## 6. Proposed correction to the build approach

### Model automation as a rule over supported capabilities

Keep action-specific policy and permission handlers. Separate their definition from the trigger that starts them:

```text
Automation
  trigger: schedule | incoming receipt | balance transition | executable quote
  conditions: source, asset, chain, thresholds, freshness, cooldown/rearm
  action(s): send | swap | bridge | deposit | withdraw | notify
  amount: fixed | percentage of matched receipt | excess above a reserve
  authority: attended | specific signed grants | practice
  limits: per run, per period, total exposure, expiry, approved destinations
  lifecycle: versions, pause/resume/edit/skip/cancel, reminders
  run: trigger evidence, checked facts, decision, step states, receipt, explanation
```

This is a recommended common contract, not permission to run arbitrary calldata. Each supported action needs its own decoded calls, policy checks, exact transaction bounds and reconciliation. If safe unattended authority has not yet been implemented for an action, the same rule should support attended/practice behavior with an accurate explanation.

For “when my balance reaches X, bridge to Base,” the preview must specify which wallet/network/asset, crossing versus repeated level checks, fixed amount versus excess, destination address, route/fee bounds, repeat/rearm/cooldown behavior and authority. The normalized rule and execution checks need these fields. A model guessing them at execution time would not deliver the requested reliability.

Do not add a new LLM money decision on every tick. Natural language can compile a rule and ask for missing information once; deterministic code observes evidence, checks the rule and executes the approved action. Existing send/swap/bridge/earn validation and receipt tracking are valuable parts to reuse.

### Replace broad completion labels with traceable coverage

Create one current ledger with: feature/flow id → exact promised behavior → supported network/assets/modes → implementation path → UI/chat/voice/platform coverage → verification evidence → remaining task → blocker. Record intentional exclusions with the owner decision that authorizes them. Stage completion should require every scoped row accounted for, not merely one demonstration request.

Prioritize the correction in this order, without dropping the remaining deliverables:

1. Align agent/tool copy with actual execution, and preserve automation requests through sign-in/setup.
2. Make occurrence recovery durable and correctly link every run, intent and transaction before broadening unattended execution.
3. Establish the trigger/action/authority contract; complete auto-save as one implementation of it and explicitly add threshold bridge, event-filtered savings and price-triggered swaps to coverage.
4. Give Stage 6 a concrete completion path for token access/rules, executable routing, inbound/recipient bridge and recovery; give 5c a concrete limits/business path.
5. Continue voice, notifications and marketplace through the same resume, policy, authority and audit contracts, then close reporting, platform, docs and showcase deliverables with current evidence.

### Reviewable handoff to the builder

> Please reconcile the current implementation against D1–D35, MASTER-PLAN, FEATURE-INVENTORY and the flow index, applying superseded decisions correctly. Treat every example as a demonstration of a capability, not its full definition. Preserve the functioning wallet, policy and transaction code. Make automation support independent triggers, conditions, amount rules and supported actions, including a balance threshold that bridges to Base; do not finish at scheduled send plus auto-save presets. First fix the prompt/execution contradiction, automation sign-in continuation and occurrence recovery. Produce a single current coverage ledger with concrete completion tasks for all remaining Stage 5/6/8 behavior and the later deliverables. Update status by exact slice and network, and never call an entire feature complete because one happy path passed.

This handoff has not been sent to another chat. It is included for Abu to review and use.

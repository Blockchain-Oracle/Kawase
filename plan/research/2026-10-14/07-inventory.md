# Tamion (Kawase) mechanical inventory, 2026-10-14

Read-only. No git state changed, no APIs called, nothing bought or signed up. Cost: none. Every fact is VERIFIED (seen in the repo at the commit on main, 6249496e, or in the worktrees listed).

## 1. App routes (apps/mobile/src/app)

Expo Router. Root: `_layout.tsx`, `+html.tsx`, `welcome.tsx`, `terms.tsx`, `r/[token].tsx`, `spike-wallet.tsx`, `dev/*`. Authenticated group: `(app)/`.

| Group | Route file | Purpose |
|---|---|---|
| Tabs | `(app)/(tabs)/index.tsx` | Home |
| Tabs | `(app)/(tabs)/chat.tsx` | Agent chat |
| Tabs | `(app)/(tabs)/markets.tsx` | Markets |
| Tabs | `(app)/(tabs)/activity.tsx` | Activity |
| Tabs | `(app)/(tabs)/settings.tsx` | Settings |
| Money | `send.tsx`, `request.tsx`, `withdraw.tsx`, `scan.tsx` | Send, request, withdraw, scan a pay code |
| Money | `swap.tsx`, `bridge.tsx`, `move.tsx` | Swap; old CCTP-only bridge; new multi-provider Move |
| Money | `earn.tsx`, `borrow.tsx`, `margin.tsx`, `lend`-linked `yield-options` | Earn, borrow, long/short |
| Money | `token/[chainId]/[address].tsx`, `position/[id].tsx` | Token page; position |
| Wallet | `wallet/index.tsx`, `wallet/receive.tsx`, `agent-wallet.tsx`, `limits.tsx`, `token-rules.tsx` | Wallet, receive, agent wallet, limits, token rules |
| Agent | `automations.tsx`, `memory.tsx`, `voice-settings.tsx`, `why/[tx].tsx`, `why/run/[id].tsx`, `needs-you/[id].tsx`, `i/[id].tsx`, `inbox.tsx`, `notifications.tsx` | Automations, memory, voice, explanations, approvals, inbox |
| Social | `contacts/index.tsx`, `contacts/[id].tsx`, `contacts/import.tsx`, `handle.tsx`, `split/index.tsx`, `split/[id].tsx` | Contacts, handles, bill split |
| Business | `business/index.tsx`, `business/invoice/new.tsx`, `business/invoice/[id].tsx`, `business/payouts.tsx`, `business/payroll.tsx` | Business profile, invoices, payouts, payroll (see section 2) |
| Account | `account/index.tsx`, `account/devices.tsx`, `account/export.tsx`, `account/delete.tsx`, `privacy.tsx`, `help.tsx` | Account, devices, export, delete, privacy, help |
| Dev | `dev/art.tsx`, `dev/gallery.tsx`, `dev/board/[frame].tsx` | Internal design galleries (not for users) |
| Other | `sign-in.tsx`, `(app)/_layout.tsx` | Sign-in, authed layout |

Sources: `find apps/mobile/src/app -type f`. The `(app)/_layout.tsx` is at line 94 where `DesktopSidebar` mounts when `wide`.

## 2. Business blast radius

### 2a. Files that belong to business (VERIFIED by name)

- API: `apps/api/src/business/invoices.ts`, `payouts.ts`, `routes.ts`, `tokens.ts`. Routes (`apps/api/src/business/routes.ts:52-75`): GET/PUT `/profile`, GET/POST `/invoices`, GET `/invoices/:id`, POST `/invoices/:id/cancel`, GET/POST `/payouts`, POST `/payouts/:id/sign`, `/payouts/:id/submit`, public `/:token` and `/:token/document`.
- API wiring: `apps/api/src/app.ts:90-93` (imports), `:367` (practice guard regex includes `business`), `:379-381` (practice-mode allow list for business writes), `:417` (`InvoiceService` construction). Reminder ticks in `packages/config`.
- API agent context: `apps/api/src/agent/business-context.ts`.
- API tests: `apps/api/test/business-testnet.test.ts`, `business-tokens-testnet.test.ts`, `chat-business-testnet.test.ts`, `security-payouts.test.ts`.
- Mobile screens: `apps/mobile/src/app/(app)/business/*` (5 files, above). Legacy: `apps/mobile/src/screens/business-screen.tsx`, `invoice-screen.tsx`, `new-invoice-screen.tsx`, `payouts-screen.tsx`, `payroll-screen.tsx`.
- Mobile helpers: `apps/mobile/src/business/` (`browser-wallet.ts`, `browser-wallet.native.ts`, `invoice-link-page.tsx`, `invoice-panel.tsx`, `lines.ts`, `share-invoice.ts`, `sign-payout.ts`, `token-choice.tsx`).
- Mobile chat cards: `apps/mobile/src/chat/business-cards.tsx`, `chat/invoice-card.tsx`.
- Agent tools: `packages/agent/src/business-tools.ts` (`propose_payout` line 37, `list_invoices` line 50, and `create_invoice` referenced in `quarantine.ts:151`). Note `export_history`, `weekly_report`, `explain_transaction`, `sign_out_device`, `get_fee_reserve`, `delete_account` are in the same file but are not business-only. Check before deleting the file.
- Shared packages: `packages/config/src/business.ts` (invoice and payout limits, payroll days, reminder tick), `packages/api-client/src/business.ts`, `packages/db/src/schema/business.ts` (tables `business_profiles` line 10, `invoices` line 28, `payout_batches` line 73), `packages/agent/src/context.ts`, `packages/agent/src/prompt.ts`, `packages/agent/src/intelligence.ts` (business references, need manual review).
- Config copy: `packages/config/src/capability-scope.ts:25-26` (business mode text).
- Notifications: `apps/api/src/notify/render.ts:109-110` (payroll reminder), `:174-186` (`invoice_due`, `invoice_overdue`, path `/business/invoice/...`).
- i18n: `packages/i18n/src/catalog/{en,ar,bn,es,fr,hi,pt,ru,ur,zh}/business.ts` (101 keys in en). Registered at `packages/i18n/src/catalog/en/index.ts:66,153`. Also `contacts.ts:53` (`business: "Business"`, a contact type label, probably keep).
- Entry point: Settings row at `apps/mobile/src/screens/settings-screen.tsx:232-235` (`business.title`, opens `/business`). Home: no direct Business button found in `home-screen.tsx`. Home's proactive cards (`apps/mobile/src/home/for-you.tsx`) mention business.
- Docs (not app code): `apps/docs/content/docs/*/features/business.mdx` (10 languages), `apps/docs/messages/scope/*.json`. Landing: `apps/landing/src/app/demo/page.tsx`, `components/home/capabilities.tsx`, `data/evidence.ts`, `lib/capabilities.ts`.
- Plan and context docs: `plan/product/cards/agent-business.md`, `plan/stages/05-money-movement-contacts-business-basics.md`, `context/06-ledgers-and-prior-art/oss/invoice-ninja.md`, `invoice2data.md`, `solidinvoice.md`.

### 2b. Migrations (VERIFIED by filename or content)

- `packages/db/migrations/0042_business.sql` (creates business tables)
- `0046_invoice_assets.sql`
- `0047_drop_payrolls.sql` (already dropped an old payroll table)
- `0080_payout_spend.sql`

Do not edit old migrations. Drop the tables with a new migration. Check `0005_contacts_intents.sql`, `0061_automations_8c.sql` for payroll-as-automation references. The payroll day is also an automation kind (`notify/render.ts:109`).

### 2c. Shared with non-business features (must stay)

- Contacts (`apps/api/src/contacts/*`, `apps/mobile/src/app/(app)/contacts/*`): business uses contacts for payees. Keep contacts; remove only business-specific labels.
- Requests/pay links: `apps/mobile/src/screens/pay-request-screen.tsx`, `request.tsx`, `payment_links` capability. Invoice payment link page (`invoice-link-page.tsx`) may overlap; check before removal.
- Send and payout signing: `apps/api/src/send/*` and the gas relayer (`apps/api/src/intents/*`). Payout signing (`apps/mobile/src/business/sign-payout.ts`) is business-only.
- Automations: payroll is an automation kind; `automations.tsx` and `apps/api/src/automations/*` stay.
- Activity/history: `apps/api/src/history/service.ts`, `activity/service.ts`, `search/service.ts`, `wallet/service.ts` mention business; they need a check for invoice/payout event types.
- Security: `apps/api/src/audit/middleware.ts`, `security-payouts.test.ts` (test tied to business).

## 3. Unmerged work (worktree-agent-* and lane-*)

`git log main..<branch> --oneline` and `git status --porcelain` inside `/Users/abu/dev/hackathon/tamion/.claude/worktrees/`. No state changed.

| Branch | Path | Commits ahead of main | Uncommitted | Business? |
|---|---|---|---|---|
| worktree-agent-a08ed5d5d962d7df2 | agent-a08ed5d5d962d7df2 | 3: `8fb1acc3` lint; `4ad8a5d6` M6 payouts/gas-free sends/marketplace grant; `563af5d8` M12 device proof | clean | Yes: `apps/mobile/src/business/sign-payout.ts`, `chat/business-cards.tsx`, `screens/payouts-screen.tsx` |
| worktree-agent-a276d14506760285b | agent-a276d14506760285b | 4: automations (new-address pause, create from templates, DCA/payroll in chat), practice-mode refusal | many staged (`M `/`A `): `apps/api/src/business/payouts.ts`, `agent/*`, `auth/device-proof.ts`, `contacts/*`, `marketplace/*`, `main.ts`, `http/problem.ts` | Yes: `business/payouts.ts`, `chat/business-cards.tsx`, `payouts-screen.tsx`, and payroll-in-chat |
| worktree-agent-a48b8f6b20fca45a2 | agent-a48b8f6b20fca45a2 | 5: Bring to Arc two-step, Aero LP + Merkl, manual close protection; a merge commit `b55d032d` | modified `packages/policy/src/{bridge,crosschain,earn,lend,margin,swap}.ts`; untracked `apps/api/src/intents/relayed-gas.ts` | No |
| worktree-agent-a6f76db8752585b16 | agent-a6f76db8752585b16 | 8: landing app scaffold, Dockerfile, showcase, evidence data, public stats | clean | No |
| worktree-agent-a835bcf05822907ef | agent-a835bcf05822907ef | 14: receive network chooser, markets sparklines, buy any token with Apple Pay/card, send to other chains, token page Earn/Borrow/Long-Short/Bridge, price alerts | untracked `apps/mobile/src/token/dca-sheet.tsx` | No |
| worktree-agent-a8e5b269a4701183c | agent-a8e5b269a4701183c | 0 | clean | No |
| worktree-agent-affd3480ec0812252 | agent-affd3480ec0812252 | 2: For-you cards; contacts block | modified `apps/api/src/agent/rails-context.ts`, `contacts/*`, `crosschain/service.ts`, `send/recipients.ts`, `packages/api-client/src/{index,types}.ts`, `packages/policy/src/crosschain.ts` | Yes, lightly: `apps/api/src/business/payouts.ts` (in the commit) |
| lane-a/chat (folder `.claude/worktrees/lane-a-chat`) | lane-a-chat | 0 | clean | No |
| lane-c/voice (folder `.claude/worktrees/lane-c`) | lane-c | 0 | clean | No |
| lane-c/docs-landing | (no worktree folder) | 0 | n/a | No |

Notes: The conflicts the context file mentions (two business files) were not checked here. The worktree-agent-a276 entry is the likely candidate. Check `git -C <folder> status` for `UU` lines before merging.

## 4. Web and desktop wide layout

`useWide()` (`packages/ui-native/src/lib/wide.ts:14`) decides the wide layout (desktop-width web). `WIDE_NARROW_PX`, `WIDE_COLUMN_PX`, `WIDE_PAGE_PX` are the breakpoints.

| Screen or component | Uses wide | File |
|---|---|---|
| Root layout | yes | `apps/mobile/src/app/_layout.tsx:33` |
| Authed layout (sidebar mount) | yes | `apps/mobile/src/app/(app)/_layout.tsx:37,89,94` |
| Tabs layout | yes | `apps/mobile/src/app/(app)/(tabs)/_layout.tsx:17` |
| Home | yes | `screens/home-screen.tsx:101` |
| Chat | yes | `screens/chat-screen.tsx:58` |
| Activity | yes | `screens/activity-screen.tsx:91` |
| Markets | yes | `screens/markets-screen.tsx:82` |
| Settings | yes | `screens/settings-screen.tsx:86` |
| Token page | yes | `screens/token-screen.tsx:102` |
| Dock clearance | yes | `dock/use-dock-clearance.ts:16` |
| Overlay host (fan) | yes | `overlay/overlay-host.tsx:41` |
| Sheet (centred dialog on wide) | yes | `packages/ui-native/src/components/sheet.tsx:65` |

Screens with NO wide check (phone layout, centred on desktop per the context report): send, request, swap, bridge, move, earn, borrow, margin, withdraw, scan, contacts, business, automations, memory, inbox, notifications, and the other routes in section 1. Note: `DesktopSidebar` (`apps/mobile/src/dock/desktop-sidebar.tsx:47`) is mounted for all authed screens when wide.

## 5. Capability flags (Soon, Coming, hidden)

- `packages/config/src/capabilities.ts`: type `CapabilityState = "available" | "coming" | "unavailable"` (line 8). `TARGET` (lines 28-51) and `SHIPPED_CAPABILITIES` (line 58). Every capability is in the shipped set, so `shippedState` (line 60-61) turns no "available" into "coming" today. Target "unavailable" still hides:
  - `faucet`: mainnet unavailable (line 41)
  - `margin`: testnet unavailable (line 44)
  - `lend`: testnet unavailable (line 50)
- `apps/mobile/src/overlay/overlay-host.tsx:45-53`: `requestReady` and `swapReady` (via `useCapability("swap")`) add a "Soon" label to the plus fan (`home.soon`). Shows "Soon" for swap and request if not available.
- `apps/mobile/src/dock/desktop-sidebar.tsx:107-108`: same "Soon" for swap and request on the desktop sidebar.
- `packages/config/src/capability-scope.ts:25-26`: business copy listed as a capability.
- `apps/mobile/src/chat/tool-cards.tsx:291`: renders "coming" state in chat cards.
- Runtime override: `capability_overrides` table (per network, no deploy), read by the agent (per the doc comment in `capabilities.ts:4`).

## Ideas (IDEA, not verified)

- IDEA: Remove business in one commit by deleting section 2a files, then drop tables with a new migration after `0080`. Keep `contacts`, `requests` and `automations` untouched.
- IDEA: Before merging worktree-agent-a276 and a08ed, drop the business commits from them, since the owner is removing business.
- IDEA: Use `capability_overrides` to hide `buy` or `marketplace` per network without a deploy while the new design lands.

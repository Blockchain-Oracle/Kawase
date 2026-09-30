# keeperhub-copilot-v2 review: features and lessons (not a template)

Purpose: what Abu's second reference repo is, a checklist of its features, its stack, and what looks wrong or fragile in it. Abu warns "a lot of stuff might be done wrong in there". Treat it as a feature reference and a lessons source, never as an architecture to copy.

Sources:
- Shallow clone at `/Users/abu/dev/hackathon/tamion/refs/abu/keeperhub-copilot-v2` (HEAD `32fcfaef`, 2026-09-18), from https://github.com/Blockchain-Oracle/keeperhub-copilot-v2
- `gh api repos/Blockchain-Oracle/keeperhub-copilot-v2` and `/commits` (run 2026-09-29); `gh api repos/Blockchain-Oracle/keeperhub-copilot` (v1)
- `curl` of https://keeperhub-copilot-v2.vercel.app and `/docs` (both HTTP 200 on 2026-09-29)
- File paths below are relative to the clone.

Verified: 2026-09-29

---

## What it is [VERIFIED]

- "KeeperHub Copilot v2: chat, cards, voice and automations over KeeperHub" (repo description). A consumer chat front end for **KeeperHub**, a third-party onchain automation platform that holds an organisation's Turnkey wallet and executes actions (`README.md:36-46`).
- It exposes KeeperHub's "442 actions across 34 integrations" through chat (`README.md:40-43`). Sign-in is KeeperHub OAuth; "There is no browser wallet"; the org's Turnkey wallet signs (`README.md:45-46`).
- **Deployed and public**: live app and docs answer HTTP 200; a 4:51 demo video is linked (`README.md:15-17,57`). This is the opposite of arc-agent, which was never deployed.
- **No Arc support.** `lib/chains.ts:51-231` lists Ethereum, Base, Arbitrum, Optimism, Polygon, Gnosis, BNB, Avalanche, Tempo, their testnets, and Solana. No chain 5042 or 5042002 [VERIFIED by grep].
- Execution evidence is two Ethereum Sepolia transactions (WETH `deposit`, `approve` to Aave v3) (`README.md:168-173`); "Mainnet is untested at scale" (`README.md:237-239`).
- History: repo created 2026-09-17; 17 commits over 2026-09-17 and 09-18. The first commit adds **300 files, 157,214 lines** in one go; a later commit is "chore: keep AI-assist and planning material out of the public repo" [VERIFIED: `gh api .../commits`]. A private v1 (`Blockchain-Oracle/keeperhub-copilot`, created 2026-08-08) exists. What event, if any, either was built for is [UNKNOWN].

## Feature checklist (as a reference list for the new product)

Chat and cards
- [ ] Plain-language questions answered immediately, moving nothing (`README.md:95`)
- [ ] "Every write stops on a card": amount, recipient, network, token and action parameters prefilled and editable; an edit re-runs the check and re-arms the button (`README.md:96,142-143`)
- [ ] Dry run / simulate before any write; a predicted revert is shown with the reason (`README.md:97`; `app/api/chat/simulate/route.ts`)
- [ ] Receipt read back off-chain: `EXECUTED` needs a tx hash and on-chain status, failures stamped `VOID` (`README.md:98`; `lib/execution/index.ts:1445-1510`)
- [ ] Card kinds: read, holdings, capabilities, input-request (form), needs-credential, write-proposed, write-executing, write-declined, receipt, automation(s), error, skeleton, degraded stub (`components/cards/card-renderer.tsx:150-260`)
- [ ] Price card with sparkline and feed history (`components/cards/price-card.tsx`, `sparkline.tsx`, `app/api/cards/price-history/route.ts`)
- [ ] Tool timeline in the message list (`components/chat/tool-timeline.tsx`)
- [ ] Home screen with a fan of starter cards by category (`components/chat/home/*`)
- [ ] Command palette (`components/shell/command/*`)

Voice and language
- [ ] OpenAI Realtime voice session with the same cards; voice "can read, propose and preview — it can never authorize" (`README.md:99`; `lib/voice/policy.ts:1-23`)
- [ ] Voice gate derived per call from the effect classifier, three outcomes: run / confirm / block (`lib/voice/policy.ts:32-38`)
- [ ] 13 locales, chosen by the user, "never guessed from your accent" (`README.md:95`; `messages/*` has 13 folders); machine-translated, not native-reviewed (`README.md:230-232`)
- [ ] Language dialog in the header (`components/shell/header/language-dialog.tsx`)

Automations
- [ ] Automation composed from one sentence, all six KeeperHub trigger types, saved **off**, a second click turns it on (`README.md:100,157`)
- [ ] Automation list, detail, enable, run, simulate, check, run history (`app/api/automations/**`, `components/pages/automation-*.tsx`)

Record and sharing
- [ ] Ledger of executions separate from the transcript; deleting a chat never deletes evidence (`README.md:101`; `lib/ledger/index.ts`; `lib/db/schema.ts:119`)
- [ ] Shareable public receipts with OG image, revocable (`README.md:102`; `app/(app)/r/[token]/*`; `lib/db/schema.ts:190`)
- [ ] History and Activity pages (`app/(app)/app/{history,activity}/page.tsx`)
- [ ] Write recovery after reload (`components/shell/write-recovery.tsx`; `app/api/ledger/recover/route.ts`)

Wallet, account, shell
- [ ] Org wallet address and holdings known to the assistant, so it never asks for your own address (`README.md:160`)
- [ ] Add-funds sheet with address QR (`components/shell/funding/add-funds.tsx`; `components/data/address-qr.tsx`)
- [ ] Daily spend cap shown in the account menu, read from KeeperHub (`lib/session/spend-cap.ts:5-15`)
- [ ] Money pill, network pill, account pill; mobile bottom nav (`components/shell/header/*`)
- [ ] First-run onboarding tutorial (`components/shell/onboarding/*`)
- [ ] Interface sound cues on the write ceremony and voice; reads silent (`README.md:235-236`; `lib/sound/*`)
- [ ] In-app user docs: connect, first answer, first action, cards, voice, automations, record, language, architecture, glossary, troubleshooting (`app/(app)/docs/**`)
- [ ] Landing page (`components/landing/*`)

## Architecture and stack [VERIFIED]

- Single Next.js 16.3.0 app (App Router), React 19.2, TypeScript 5.9.3, Tailwind v4, Base UI, shadcn, AI SDK `ai` ~7.0.59 with `@ai-sdk/openai`, `@openai/agents`, Drizzle + Neon serverless Postgres, next-intl, zod 4, Vitest (`package.json`). Default chat model `gpt-5.6`, realtime `gpt-realtime-2.1` (`lib/config.ts:62,114`).
- **"One door"**: every tool call goes through `routeToolCall` (`lib/execution/index.ts:252-292`; `README.md:136-139`).
- The model gets a small tool surface (`search_actions` plus execution and automation verbs), **not** 442 tools; `search_actions` runs locally over a vendored registry (`lib/registry/surface-tools.ts:1-44`).
- Hand-rolled MCP client to KeeperHub, "deliberately not `@ai-sdk/mcp`, whose `.tools()` would auto-execute around the gate" (`README.md:153`; `lib/mcp/index.ts`, `lib/mcp/wire.ts`).
- Registry generated from KeeperHub's own source, pinned to snapshot `sha256:a53bf5a5…` of source commit `9d510a1`; CI rejects hand edits (`lib/registry/generated/meta.ts:8-9`; `package.json` `registry:check`).
- Effects classified from the registry; unclassified actions are quarantined (`README.md:140-141`; `lib/registry/effect-class.ts`).
- Four DB tables: `session` (OAuth tokens AES-256-GCM encrypted), `conversation` (jsonb transcript with a CAS revision), `ledger_entry`, `receipt_share` (`lib/db/schema.ts:20-27,55-66,119,190`).
- 83 test files; "975 tests"; no end-to-end browser test (`README.md:216,240`; `find tests -name '*.test.ts*'`).

## What looks wrong or fragile

| # | Issue | Evidence | Status |
|---|---|---|---|
| 1 | **Thin client over one vendor.** Custody, execution, spend caps, simulation and automations all belong to KeeperHub; the app cannot work without KeeperHub's OAuth client, which is "registered against one exact callback address" | `README.md:45-46,212-213`; `.env.example` | [VERIFIED] |
| 2 | **Registry pinned to a vendor commit snapshot.** When KeeperHub changes an action, the copy drifts until regenerated; drifted ops degrade to a stub card | `lib/registry/generated/meta.ts:8-9`; `components/cards/select-renderer.ts:154-160` | [VERIFIED]; impact [INFERENCE] |
| 3 | **Reimplements a private AI SDK signing scheme.** Edited approvals are re-signed by copying `ai@7.0.59`'s internal HMAC format "VERIFIED against the installed dist"; a new SDK version breaks edited confirms (fails closed) | `app/api/chat/approval-signature.ts:3-25` | [VERIFIED] |
| 4 | **God files.** `lib/execution/index.ts` is 2,192 lines; `app/api/chat/route.ts` is 1,255 lines; `lib/execution/automations.ts` 853 | `wc -l` | [VERIFIED] |
| 5 | **Stale comments about the core tool surface.** The chat route says "the four surface tools" (`app/api/chat/route.ts:42,646`); the voice gate says "the model is given twelve tools" (`lib/voice/policy.ts:16`); the actual list has 14 names (`lib/registry/surface-tools.ts:30-44`) | as cited | [VERIFIED] |
| 6 | **Code cites design docs that are not in the repo.** About 248 lines reference decision ids such as `AD-2`, `AD-6`, `D25`, `NFR2`, plus `EXPERIENCE.md:140`, but the repo contains only `README.md`; planning material was removed | `grep -rEc` over `lib app components`; `app/api/chat/approval-signature.ts:9`; commit "keep AI-assist and planning material out of the public repo" | [VERIFIED] |
| 7 | **Receipt polling inside a serverless request.** 20 polls × 1.5 s = 30 s inside a route with `maxDuration = 60`; a slow chain leaves the write unsettled in the request | `lib/execution/index.ts:1453-1457`; `app/api/chat/route.ts:52` | [VERIFIED]; the recovery route exists (`app/api/ledger/recover/route.ts`) |
| 8 | **No interactive DB transactions.** neon-http has none, so transcript writes rely on single-statement compare-and-set | `lib/db/schema.ts:55-62` | [VERIFIED] |
| 9 | **Known UI bug shipped.** The sign-in title is "Insert your credentials." although nothing is inserted | `messages/en/shell.json:160`; `README.md:233-234` | [VERIFIED] |
| 10 | **Docs screenshots missing**: nine "capture pending" placeholders | `README.md:228-229`; `components/docs/guide-shot.tsx:132` | [VERIFIED] |
| 11 | **Testnet inconsistency.** Evidence is on Ethereum Sepolia; the same README says development runs on Base Sepolia; mainnet untested at scale | `README.md:168,237-239` | [VERIFIED] |
| 12 | **Unreviewed translations** for 12 of 13 locales | `README.md:230-232` | [VERIFIED] |
| 13 | **One giant import commit** hides the history, the same pattern that makes a Tameion "delta" hard to prove | `gh api .../commits` (first commit 300 files, +157,214) | [VERIFIED]; delta risk [INFERENCE] |
| 14 | **Model default is floating**: `gpt-5.6` unless `OPENAI_CHAT_MODEL` is set; arc-agent's lesson was to pin the snapshot | `lib/config.ts:59-62`; `context/07-prior-work/arc-agent-lessons.md` #40 | [VERIFIED] |

## What it did right that arc-agent did not [VERIFIED facts; comparison is INFERENCE]

- Deployed, public, with a demo video and user docs (arc-agent: localhost, private repo).
- A small model tool surface plus local search over a large action catalogue, instead of building a 94-action handler matrix.
- Voice gate derived from the same effect classifier as chat, so a new action is covered automatically (`lib/voice/policy.ts:7-13`).
- Execution evidence separated from the chat transcript.

## Relevance to the new Arc product [INFERENCE]

- Feature ideas worth checking against Abu's wishlist: starter-card home, editable write cards with dry-run, verified receipts, shareable receipts, one-sentence automations saved off, language chosen by the user, sound cues, command palette, add-funds QR, spend-cap display.
- It gives no Arc, Circle, USDC-specific or multi-chain bridge-comparison code, and no business features (invoices, payroll, vendors).

## Gaps

- I did not sign in or use the live app (rule 8: no accounts or sign-ins).
- I did not run its tests.
- The v1 repo is private; I read only its metadata.

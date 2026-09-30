# What went wrong with arc-agent ("Arc Copilot"), and why

Purpose: the evidence-backed post-mortem of Abu's prior Arc agent, so the new product does not repeat it. Abu's verdict (2026-09-29): it failed, "a lot of stuff was done wrong, the wrong architecture was used". This file records what the repo itself shows. It is not a template for anything.

Sources (paths relative to `/Users/abu/dev/hackathon/arc-agent/` unless absolute):
- `docs/brief.md:1-115`, `docs/state.json`, `CLAUDE.md:69-99`, `AGENTS.md:115-194`
- `docs/decisions/*` (18 files), `docs/decisions/2026-08-05-a05-legacy-disposition.md:8-11`, `docs/decisions/2026-08-09-authenticated-experience-a06.md:150-160`, `docs/decisions/2026-07-29-voice-modality-and-language-scope.md:25-35`
- `docs/wiki/hackathon-brief-and-track-context.md:9-20,48-62`
- `docs/handoffs/2026-08-06-phase7-money-activity-explore.md`
- `packages/domain/src/catalogue-register.ts:19-34`, `packages/ui/src/read-renderer-registry.ts:10-28`
- `git log`, `git status --porcelain`, `find`/`wc` counts, all run 2026-09-29
- `gh api repos/Blockchain-Oracle/arc-agent` (run 2026-09-29)
- `/Users/abu/dev/hackathon/tamion/context/07-prior-work/arc-agent-lessons.md` (52 Arc/Circle gotchas; not repeated here)

Verified: 2026-09-29

---

## 0. The event, the outcome, and what is not known

- **Event:** Arc "Programmable Money" hackathon. Final submission 2026-08-09, Demo Day 2026-08-20 [VERIFIED: `docs/wiki/hackathon-brief-and-track-context.md:48-55`].
- **What the event asked for:** "a working prototype deployed on Arc", "clear use of relevant Circle developer tools", "a real use case with a path to production", and "quality of execution over complexity". The final checkpoint needed "a functional MVP deployed on Arc, public code repository, three-minute video pitch/demo, and deck" [VERIFIED: `hackathon-brief-and-track-context.md:13-20,58-60`].
- **Judge feedback, placement, or results:** [UNKNOWN]. I searched `docs/` for "demo day", "judge", "winner", "feedback", "results", "submitted". The hits are all schedule mentions or internal notes. No record of what was submitted, any judge comment, or any result exists in the repo. Why it did not win is therefore **not known from evidence**; the sections below list what the repo shows went wrong, and the link to the outcome is [INFERENCE].
- **Repo visibility today:** `private: true`, `pushed_at: 2026-08-04T23:05:06Z` [VERIFIED: `gh api repos/Blockchain-Oracle/arc-agent`, 2026-09-29]. Whether it was public on submission day is [UNKNOWN].

## 1. It was never shipped

| Fact | Evidence |
|---|---|
| Never deployed. No hosting target, deployment config, or decision exists | [VERIFIED] `docs/brief.md:88-90` |
| Passkeys bind to `AUTH_RP_ID`, so "Demo Day cannot run on localhost-issued passkeys" | [VERIFIED] `docs/brief.md:88-89` |
| Zero users; nothing on mainnet (mainnet did not exist publicly then) | [VERIFIED] `context/07-prior-work/arc-agent-overview.md:76` |
| On 2026-08-09 (submission day) the state file says A-07 "implementation is active" and "deployment, publication, push … remain explicit future gates" | [VERIFIED] `docs/state.json` |
| 207 uncommitted paths today (134 modified, 53 untracked, 20 deleted), including the chat and History routes | [VERIFIED] `git status --porcelain`; `apps/web/src/app/chat/*`, `app/history/page.tsx` are `??` |
| 167 local commits; the burst is 51 on 08-08 and 21 on 08-09 | [VERIFIED] `git log --format=%ad` |

[INFERENCE] Against an event whose first criterion was "a working prototype deployed on Arc", a localhost-only build with an unpushed working tree is the most likely single reason it did not place. This is inference; there is no judge record.

## 2. Scope: a 94-action "full product" with no MVP boundary

- The corpus had a deliberate **"no MVP boundary" rule**, which made every pillar (even multilingual) read "as equally core as payments" [VERIFIED: `docs/decisions/2026-07-29-voice-modality-and-language-scope.md:33-35`].
- The build goal was to build a proof "**without reducing the complete A-P product to that proof**" [VERIFIED: `docs/goals/2026-07-29-plan-and-build-goal.md:10-12`].
- Result on 2026-08-09: of 94 actions, **5 have a money-moving adapter**, **2 of those (C01 pay, H02 swap) were ever run with funds**, and **57 have no handler at all** [VERIFIED: `packages/domain/src/catalogue-register.ts:34`; `AGENTS.md:181-182`; counts in `capability-catalogue.md`].
- 38 screens (S00–S37) were specified with per-screen state matrices; about 17 have no code (`reference-ux-inventory.md` §1).

[INFERENCE] The breadth was designed before any of it was proven, and the event's own criterion was "quality of execution over complexity".

## 3. Architecture churn: eight architecture decisions in eleven days

| Date | Decision | What it did | Evidence |
|---|---|---|---|
| 07-30 | A-01, A-02 | Spine and integration scope | `docs/decisions/2026-07-30-*.md` |
| 08-03 | A-03 | "Productize": new package layer, lint layering, raw `pg`, passkeys, **delete spike code** | `docs/decisions/2026-08-03-productization-architecture-a03.md` |
| 08-04 | A-04 | Per-owner server-derived keys | `docs/decisions/2026-08-04-per-owner-accounts-a04.md` |
| 08-05 | **A-05** | **Clean rebuild.** "Preserving two product architectures would be more dangerous than replacing the old one" | `docs/decisions/2026-08-05-a05-legacy-disposition.md:8-11` |
| 08-06 | (Phase 7) | Money, Activity, Explore pages built | `docs/handoffs/2026-08-06-phase7-money-activity-explore.md` |
| 08-09 | **A-06** | Deletes Agent, Money, Activity, Explore, Send/Swap/Bridge pages, Voice panel, Quick Actions, dark theme | `docs/decisions/2026-08-09-authenticated-experience-a06.md:152-156` |
| 08-09 | **A-07** | Replaces clarification-first writes with editable cards; "implementation active" on submission day | `docs/decisions/2026-08-09-editable-write-tools-a07.md`; `docs/state.json` |
| 08-09 | A-08 | Typed read results plus a "premium component system"; accepted, barely built | `docs/decisions/2026-08-09-typed-tool-results-a08.md` |

Pages built on 08-06 were deleted three days later on submission day. Empty `apps/web/src/app/actions/{send,swap,bridge}` directories remain [VERIFIED: `find`].

## 4. Documentation and process outweighed the product

| Measure (run 2026-09-29) | Value |
|---|---|
| Markdown files under `docs/` | 191 files, 23,447 lines |
| Decision records / handoffs / plans / research briefs | 18 / 22 / 7 / 24 |
| Design docs (`docs/design/*.md`) | 2,676 lines, plus a designer commission, designer-agent prompt, round-2 reference dossier and three competing visual "living samples" (`fable-lab/`) before the product worked |
| TS/TSX/SQL source (apps, packages, scripts, database) | ~65,600 lines, 565 TS files, 149 test files |
| Repo gates | 300-line file cap, generated-registry drift check, `eslint-plugin-boundaries` default-disallow, secret scan (`docs/brief.md:101-102`) |

Docs also drifted from reality even while being written: `docs/brief.md:114` says "the repository has no remote" while `origin` exists; `docs/state.json` conflicted with A-03 on whether the testnet envelope was authorized (`docs/brief.md:84-87`); A-03's `globalThis` pool rule was not implemented (`docs/brief.md:96-98`) [VERIFIED].

[INFERENCE] The ratio of process to shipped product is the clearest pattern: decisions, handoffs and taste gates consumed the window that deployment and users needed.

## 5. Architectural mistakes (what the code shows)

1. **Custodial, server-held keys.** Each owner's spending key is derived by HKDF from a server secret and the owner id; "this product holds what moves an owner's money" [VERIFIED: `CLAUDE.md:81-85`]. That is custody, with none of the controls a custodian needs.
2. **The smart account that carried the limits was not in the spending path.** A per-owner Biconomy Nexus address is computed, but "spending from a Nexus account needs a UserOp … and no bundler path is built", so the owner "executes from a derived root EOA" [VERIFIED: `CLAUDE.md:69-73`]. The smart-session limits proven in the Phase 2 trials therefore did not guard product spending. The protected balance floor is app logic that "no Arc or Circle control enforces … onchain" [VERIFIED: `CLAUDE.md:97-98`].
3. **Circle Wallets were ruled out by fiat.** "MetaMask, WalletConnect, 'connect your wallet' and Circle programmable wallets were all considered and are all NOT the decision. Do not offer them as options" [VERIFIED: `CLAUDE.md:76-79`]. The event listed Circle Wallets among the tools it wanted to see (`hackathon-brief-and-track-context.md:15-16`).
4. **Passkeys could not sign.** RIP-7212 is absent on Arc, so the passkey was login only, and it binds to the RP domain, which blocked any non-localhost demo (`context/07-prior-work/arc-agent-lessons.md` #9; `docs/brief.md:88-89`).
5. **Generative UI registry with no renderers.** `packages/ui`'s registry has two keys, both mapped to a `Placeholder` that returns `null` [VERIFIED: `packages/ui/src/read-renderer-registry.ts:10-28`]. Earlier the brief noted "`packages/ui` has no components" (`docs/brief.md:80-81`).
6. **Automations could not act.** F04 (trigger → money) was never implemented; "a matched monitor cannot move money". There is no unattended crosschain authority (`AGENTS.md:148-149,176`) [VERIFIED].
7. **Crosschain adapters never ran with funds**: "No funded I02/I04/I05 or live I03 proof has been claimed" (`AGENTS.md:181-182`) [VERIFIED].
8. **Missing basics, declared and deferred:** no rate limiting, no session sliding, no expired-row cleanup on auth; no read surface for the screens at one point; worker DB role unresolved (`docs/brief.md:75-83,103-104`) [VERIFIED].

## 6. What was genuinely proven (for honesty, not reuse)

Real Arc Testnet transactions exist for: Biconomy smart-session enforcement (in simulation), a Gateway Base Sepolia → Arc mint, an App Kit USDC → EURC swap, a session-scoped payment and a recurring-mandate occurrence, and live browser voice with OpenAI Realtime [VERIFIED via `context/07-prior-work/arc-agent-overview.md:58-69`, which cites `docs/raw/*`]. The Arc/Circle gotchas are in `context/07-prior-work/arc-agent-lessons.md`; they are about the platform and remain useful, subject to re-probing (App Kit is now 1.15.3, not 1.11.0: `context/01-arc/README.md:70`).

## 7. Lessons for the new product [INFERENCE, each tied to evidence above]

1. **Deploy on day 1–2 and keep it deployed.** Pick auth that works on a real domain from the start (§1).
2. **Ship a narrow, working vertical before breadth.** A checklist of 94 actions is a backlog, not a scope (§2).
3. **Freeze the architecture early.** One rebuild in two weeks is already expensive; A-05 plus A-06 plus A-07 was fatal to the schedule (§3).
4. **Cap process docs.** Decisions and handoffs should be short and few; code and a live URL are what judges read (§4; Tameion: "Judges read the repo directly and work hands-on with your live product", `.firecrawl/tameion.md:632`).
5. **Do not hold user keys on a server by derivation.** Use a wallet model where the limit sits "somewhere the agent cannot reach" (Tameion FAQ Q4, `.firecrawl/tameion.md:711`), and make sure the limited account is the one that actually spends (§5.1–5.2).
6. **Use Circle's wallets and tools on purpose**; for Tameion they are 20% of the score (§5.3; `hackathon-fit.md`).
7. **No placeholder registries.** If a card type exists in the model's vocabulary, it renders something real (§5.5).
8. **Push daily, never leave the judged artifact in an uncommitted tree** (§1).
9. **Automations must be able to do the thing** (move money within limits), or they are just reminders (§5.6).

The second reference repo, keeperhub-copilot-v2, shows some of the same patterns (a huge single import commit, code comments citing design docs that are not in the repo). See `keeperhub-copilot-v2-review.md`.

## Gaps

- No judge feedback or results were found; I did not search Discord, email, or the Arc community site.
- I did not run the app or its tests.
- I did not read all 18 decision records in full; the churn table uses titles, dates and the cited lines.

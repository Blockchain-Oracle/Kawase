# Stage 0: Bootstrap

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: done (2026-09-30)

## Scope (from the master plan)
- Create the `plan/` folder, the memory pointer and `plan/STATUS.md` (resume protocol).
- **Transcribe the Tameion kickoff repeat** (https://youtube.com/live/DE0hqGa0CuY): download the audio with `uvx yt-dlp -x`, transcribe locally, save to `context/05-canteen-ecosystem/transcripts/kickoff-repeat-2026-09-29.md`, and check anything new about on-chain limits against this plan.
- Scaffold the monorepo:
  - `git init`, pnpm workspace + `catalog:`, turbo, tsconfig, ESLint boundaries + no-magic-numbers, `.env.example`, `.gitignore`.
  - Empty apps and packages with their `package.json` exports.
- Start `deploy/coolify.md`. Create the Coolify project "kawase" (read the Coolify skill first), install the GitHub App, and create Postgres 17.
- **Exit:** `pnpm install && turbo typecheck` passes on the empty skeleton; `plan/STATUS.md` exists; the transcript is saved.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- 2026-09-29: resume protocol done (`plan/` folder with MASTER-PLAN, ARCHITECTURE, STATUS, stages/, spikes/; memory points to `plan/STATUS.md`).
- 2026-09-29: monorepo scaffold done (pnpm 11.28.2 + catalog, turbo 2.11.5, TS 5.9.3, ESLint no-magic-numbers + client/server import boundaries, 12 packages + 4 server apps). `pnpm install && pnpm typecheck`: 16/16 green. Expo/Next/Tauri apps come from their official generators in their own stages.
- 2026-09-29: Coolify project `kawase` (m7tksyqasdrevs7ogfxn5ppd) + Postgres 17 (diktlvlq6c0mdltviajx05hq), running:healthy. Runbook: `deploy/coolify.md`.
- 2026-09-29: kickoff transcript saved: `context/05-canteen-ecosystem/transcripts/kickoff-repeat-2026-09-29.md`. Line 221 confirms on-chain enforcement ("use code to enforce specific rules, and not just trust the agents"), which is our delegation-caveat design. Nothing contradicts the plan.
- Waiting on Abu: GitHub repo (name, visibility) + GitHub App install in Coolify.
- 2026-09-30: audit. Still open: a git source in Coolify (GitHub App per D27, or a deploy key like Abu's other projects) and the first commit + push (the GitHub repo is empty). `deploy/coolify.md` rewritten from the Coolify skill, the live server's existing apps and the Coolify source.
- 2026-09-30: first commit pushed to `Blockchain-Oracle/kawase` (`main`); Coolify deploy key `kawase-deploy-key` created and added read-only to the repo (used instead of the GitHub App, on Abu's go-ahead). Stage 0 closed.

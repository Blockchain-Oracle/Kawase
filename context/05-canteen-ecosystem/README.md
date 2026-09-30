# 05 · Canteen ecosystem

Purpose: an index of everything around the hackathon host. It covers Canteen's ARC CLI and hosted Arc RPC, the friends-of-Canteen tools (aomi, TestMint), Canteen's prior events and winners, research posts, people, the schedule, community links, and video transcripts.

Sources: see each file. The main ones are github.com/the-canteen-dev (cloned to `refs/canteen/`), arc-node / agora / lepton / arc-showcase / arc-oss .thecanteenapp.com, thecanteenapp.com posts, aomi.dev, testmint.myproceeds.xyz, and YouTube.
Verified: 2026-09-29

---

## Files

| File | What's in it |
|---|---|
| [arc-cli.md](arc-cli.md) | `arc-canteen` CLI: every command, Canteen-hosted Arc testnet RPC (chain 5042002, per-developer key, 90-day rotation, method allowlist), $5 funded testnet wallet, `context sync` agent bundle, wiring into Claude Code/Codex, Showcase submission, and the other `the-canteen-dev` repos |
| [aomi.md](aomi.md) | aomi "execution harness": CLI, skills, widget, REST, Rust plugin SDK; simulate-before-sign; **Arc not in its supported chains yet**; how to use it for RFB 1/4/5 |
| [testmint.md](testmint.md) | Buy 1k/5k/10k testnet USDC on `arc-testnet` for 1/5/10 **mainnet** USDC via x402 (Base) or MPP (Tempo); Circle CLI and AgentCash commands; failure handling |
| [canteen-and-prior-events.md](canteen-and-prior-events.md) | Who Canteen is; Agora vs Lepton vs Tameion side by side; **every award winner and why they won** |
| [canteen-research-index.md](canteen-research-index.md) | All 8 Canteen posts, summarised (Agents & Ledgers, Distribution Bootstrap, Prediction Market Stack, Multi-Agent, AI Agent landscape, x402 v2, Tempo, LLM serving) |
| [people.md](people.md) | Aljoša Makević, @kdrohan, fireside speakers (Blais, Tang Minh Vu, and others), Circle presenters |
| [schedule-and-community.md](schedule-and-community.md) | Programming calendar (ET), Luma passphrase, Discord invites (**all Canteen invites point to the same server**), Arc Discord onboarding |
| [videos-index.md](videos-index.md) | Recordings found, and which were transcribed |
| [transcripts/](transcripts/) | 10 cleaned transcripts, each with a 10-bullet summary |

## Where to look

| Question | Go to |
|---|---|
| How do I get an Arc RPC URL, a funded wallet, or docs for my coding agent? | `arc-cli.md` → TL;DR |
| My x402 payment fails with `insufficient_balance` | `arc-cli.md` (circle-agent row): deposit into GatewayWallet first |
| I need thousands of testnet USDC | `testmint.md` |
| What did past winners build, and what do judges reward? | `canteen-and-prior-events.md` → "Why these won" |
| What should I read before building a treasury, AP or compliance agent? | `canteen-research-index.md` → Agents and Ledgers |
| How do Circle Agent Wallet spending policies work? | `transcripts/circle-mastra-agents-that-can-pay.md` |
| How do I move treasury funds across chains in a few lines? | `transcripts/stabledash-circle-app-kits-agents.md`, `transcripts/ethglobal-app-kit-corey-cooper.md` |
| Can aomi simulate transactions on Arc? | `aomi.md` → "Arc support" (unconfirmed; ask at office hours) |
| When is the next office hours or fireside? | `schedule-and-community.md` |
| Who should I ping about Arc Discord access? | @kdrohan in the Canteen Discord |

## Key takeaways

1. **Install and log in to `arc-canteen` on day one, and log progress with it.** It is how Canteen, Circle and Arc track builders (traction and product updates, profile, wallet). Consider setting `event_name: tameion` in `~/.arc-canteen/settings.yaml`, which defaults to `lepton` (confirm in Discord).
2. **Winners share a shape.** An agent makes costed economic decisions with a logged rationale, spends under limits it cannot change, stakes or anchors verifiable records on Arc, and uses x402, Gateway nanopayments and the Circle CLI or wallets heavily. Most winners were solo builders and built directly off Canteen's research posts.
3. **Tang Minh Vu** (Lepton 1st, Agora standout) and **Martin Blais** (beancount; see Agents & Ledgers) are the two firesides most relevant to Tameion.
4. No public recordings of Tameion sessions exist yet; check the Discord.

## Local artifacts
- `refs/canteen/ARC-cli`, `refs/canteen/context-arc` (submodules not initialised), `refs/canteen/circle-agent`
- `.firecrawl/canteen/`: agora.md, lepton.md, arc-oss.md, showcase-data.js, showcase-awards.json, posts/*.md, aomi-agents.md, aomi-llms(-full).txt, testmint.md, testmint-SKILL.md, arc-house-tameion.md, vtt2txt.py

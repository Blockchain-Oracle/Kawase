# Kawase product definition (the how-tree)

Purpose: the single, end-to-end definition of what a Kawase user can do, how, and what every screen shows as a result. Every build slice implements a capability card from here; nothing is built from a feature name alone. Method: the `product-how-tree` skill (Abu, 2026-10-02, D36).

Sources at creation: Abu's brief and decisions, the feature inventory and research, a design reference study, Senryo's trading design, and live API checks recorded in the capability cards. The working notes and agent plan remain local; this directory is the public product definition. For current availability, see [the docs](https://docs.getkawase.xyz/docs/availability) and the [repository README](../../README.md#what-is-verified).
Verified: 2026-10-02 (each file carries its own date per fact)

## Files
| File | What it holds |
|---|---|
| `README.md` | promise, personas, authority, how to use these files |
| `objects.md` | every object a user sees or acts on, every instance, its identity |
| `capability-matrix.md` | object × verb, with the symmetry rule and named reasons |
| `rules.md` | cross-cutting rules, numbered and binding |
| `cards/*.md` | one capability card per verb family: the 11-lens how-ladder, with evidence |
| `routes.md` | route tables where routes vary by instance (asset × destination × chain) |
| `surfaces.md` | every screen, sheet, picker, empty state and sign-in step: before → after → why |
| `trace.md` | capability ↔ entry point, both ways |
| `decisions.md` | product-internal decisions with rationale |

## Promise
**One AI money app for everything on Arc, by voice or tap, in your language.** You can hold, buy, send, trade (spot, meme coins, long/short), earn, borrow, bridge and withdraw any asset, automate any of it, and buy services for your agent. Everything runs inside limits you set, which the chain enforces.

## Authority order
1. Abu's latest words (verbatim brief).
2. Decisions D1–D36.
3. Arc's real capabilities, from live checks and docs.
4. The reference study: design grammar only; it never shows a money flow completing (FT115).
5. Shijima, Agari and Senryo for flow patterns.
6. Older plans.

Implementation sequencing is never a scope cut. "Blocked" means "find another provider or route"; the working gap list stays local while current public availability is documented above.

## Personas and their end-to-end journeys
| Persona | First launch → value → return |
|---|---|
| **Newcomer** (has a card, no crypto) | Story in their language → Try first (guest, real market data) → buys $20 of USDC with Apple Pay → sends $5 to a friend by voice → returns when the friend pays them back (push) |
| **Trader** (meme coins and perps) | Signs in with Google → Markets → a trending meme coin's page (safety, liquidity, copycat warning) → buys with Apple Pay, converted in one flow → opens a 3× long on BTC with TP/SL → a liquidation-risk push → closes half by slide |
| **Saver** | Has USDC → "where should my USDC earn?" → yield options card (Aave V4 vs Morpho vs LP, withdrawable now) → deposits → an auto-save rule keeps $100 liquid → weekly report |
| **Sender / remitter** | Receives EURC from family in Europe → sends USDC to a contact on Base (cross-chain, same flow) → withdraws the rest to Kraken, then to the bank |
| **Freelancer / business** | Business profile → invoices a client in USDC with an on-chain reference → client pays via `/r/` from any wallet → payroll automation pays two contractors monthly → CSV export |
| **Judge** (web) | Landing → `/demo` evidence → web app as a guest → chat "what can you do?" → testnet send in 60 seconds → docs |

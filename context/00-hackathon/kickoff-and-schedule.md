# Kickoff deck digest and programming schedule

Purpose: what the kickoff slides said beyond the website, and the two-week event calendar.
Sources: `.firecrawl/kickoff-slides.txt` (export of https://docs.google.com/presentation/d/1pGPUt4IMqQ3wANYn14L9vc2fKrOKnIp68poihBJaMig), `.firecrawl/tameion.md`
Verified: 2026-09-29

## Narrative arc of the deck

1. "A business's money is never one balance." → "Who decides all of that today?" → "A person reading a spreadsheet on a Tuesday."
2. **Arc changes that:** ~$0.01 per transaction paid in USDC, settlement in under half a second, one balance across chains via CCTP and Gateway.
3. *Wtf is "Tameion"*: prior art, the Athenian official who had to explain the books. The audit was annual because reading accounts was slow. **"The hack: make it continuous."**
4. Five briefs plus "6. Surprise us" (→ `rfbs.md`).
5. "Where do I actually start?": read *Agents and Ledgers in 2026* ("It's 2026 man. Give it a read, but for real"). Key slide content:
   - **Six errors the trial balance cannot see:** omission (nobody recorded it); commission (right amount, wrong vendor); principle (asset booked as expense); original entry (wrong amount on both sides, or **paid twice after a retry**); compensating (two mistakes cancel); complete reversal (debit and credit swapped).
   - **Where a model can write today:** Odoo (community MCP server that blocks direct create/write/delete); ERPNext (frappe/mcp, tools inside the framework's own validation); SolidInvoice (most complete write path, "no way to disprove a phantom payment"); Ghostfolio (one write tool, dry run, IS_DUPLICATE per row); Firefly III (refused outright); GnuCash, Invoice Ninja, Kill Bill (none).
   - **What this means for builders:** start from a ledger where the entry points at a document; turn on the controls that already exist; put a witness in front of every write path; make repair loud, or make it refuse; route agent writes through the code the UI already uses; **the model's output is an input, never the release condition.**
   - "A system that trusts the trial balance ships a first serious error that balances perfectly."
6. **The rail:** Circle's developer platform on Arc. Primitives: Wallets, Paymaster, CCTP, Gateway, USYC, Contracts, USDC & EURC. Sample apps. App Kits (Send, Bridge, Swap, Unified Balance).
7. Judging 30/30/20/20, then traction (see `judging-and-submission.md`).
8. $40k breakdown and submission rules. "*Existing projects allowed."
9. Setup: `uv tool install arc-canteen`, `npm install -g @circle-fin/cli`.

## Programming (all times ET; firesides are 20 min; "more being added, follow Discord")

| Date | Time | Session |
|---|---|---|
| Sun Sep 27 | 10:00 | Kickoff |
| Sun Sep 27 | 11:00 | Arc 101 |
| Mon Sep 28 | 9:00 | Fireside: Earljoe Kadima |
| Mon Sep 28 | 10:00 | Arc office hours |
| Tue Sep 29 | 9:00 | Kickoff repeat |
| Tue Sep 29 | 10:30 | aomi session |
| Tue Sep 29 | 11:00 | aomi office hours |
| Wed Sep 30 | 9:30 | Fireside: Martin Blais (Beancount author) |
| Thu Oct 1 | 9:30 | Fireside: Ahmet Erdoğan |
| Fri Oct 2 | 9:00 | Fireside: Tang Minh Vu |
| Fri Oct 2 | 10:00 | Fireside: Ivan Barcia |
| Sat Oct 3 | 10:00 | **Mid-point check-in** |
| Mon Oct 5 | 10:00 | Arc office hours |
| Tue Oct 6 | 11:00 | aomi office hours |
| Sat Oct 10 | 23:59 | **Submissions due** |

Speaker bios, videos, and transcripts: `../05-canteen-ecosystem/`.

## Links slide

tameion.thecanteenapp.com · developers.circle.com/agent-stack · docs.arc.network · thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html

The deck's Canteen Discord link (`discord.gg/bDaEfsSqc8`) matches Luma. The website shows `discord.gg/rsVfYutFZg`.

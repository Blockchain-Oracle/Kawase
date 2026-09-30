# 08 · Reference projects: features and lessons (not templates)

Purpose: what Abu's two earlier agent projects can teach the new Arc agent app: a checklist of features, what went wrong, how the new wishlist compares, and how the idea fits Tameion's rules. **Neither project is a template.** Abu says arc-agent failed and used the wrong architecture, and warns that keeperhub-copilot-v2 may have done things wrong too. Nothing here recommends reusing their architecture, stack, tools or code.

Sources: the files in this folder; `/Users/abu/dev/hackathon/arc-agent/` (read-only); `/Users/abu/dev/hackathon/tamion/refs/abu/keeperhub-copilot-v2/` (shallow clone of https://github.com/Blockchain-Oracle/keeperhub-copilot-v2); `context/00-hackathon/*`; `.firecrawl/tameion.md`; `context/01-arc/*`; `context/02-circle-agent-stack/*`; `context/07-prior-work/*`.
Verified: 2026-09-29

## Files

| File | Read it for |
|---|---|
| [what-was-learned.md](what-was-learned.md) | **Start here.** Why arc-agent failed: never deployed, 94-action scope, eight architecture decisions in 11 days, server-held keys, docs outweighing product |
| [capability-catalogue.md](capability-catalogue.md) | The 94 Arc actions as a feature checklist, what arc-agent got working (5 money-moving, 2 ever funded, 57 with no code), and what became possible after Arc mainnet (2026-09-16) |
| [reference-ux-inventory.md](reference-ux-inventory.md) | Checklist of the 38 screens, flows, overlays, voice rules and cards arc-agent designed, marked built or designed-only |
| [keeperhub-copilot-v2-review.md](keeperhub-copilot-v2-review.md) | The second reference: features checklist, stack, and 14 fragile spots with file:line |
| [gap-vs-new-vision.md](gap-vs-new-vision.md) | Abu's 16 wishlist items against both projects, plus 14 further items the new product likely needs |
| [hackathon-fit.md](hackathon-fit.md) | The Tameion rules quoted, whether a consumer super app fits, the RFB 4 business framing, Circle-tools and re-run risks |

## Headline findings

**arc-agent ("Arc Copilot", Jul 28 – Aug 11 2026)**
- It was **never deployed** and has zero users. The repo is **private** today, with 207 uncommitted paths. The event asked for "a working prototype deployed on Arc" [VERIFIED: `what-was-learned.md` §0–1].
- **No judge feedback or result is recorded anywhere in the repo** [UNKNOWN]. The likely reasons it did not place (not deployed; breadth over execution) are [INFERENCE].
- Of 94 catalogued actions, 5 had a money-moving adapter, 2 (pay, USDC↔EURC swap) ran with funds on Arc Testnet, and 57 had no code [VERIFIED: `capability-catalogue.md`].
- There was heavy churn: a clean rebuild on 08-05, pages built on 08-06 were deleted on 08-09 (submission day), and a new write-card architecture started that same day [VERIFIED: `what-was-learned.md` §3].
- The architecture was wrong in specific ways. Keys were server-derived and custodial. The smart account that carried the limits was not in the spending path. Circle Wallets were banned by rule. The generative UI registry held only null placeholders [VERIFIED: `what-was-learned.md` §5].

**keeperhub-copilot-v2 (Sep 17–18 2026)**
- It is a deployed, public chat front end for KeeperHub, with 13 languages, voice, editable write cards, dry-runs, verified receipts and one-sentence automations. It has **no Arc support** [VERIFIED].
- Fragile spots include a vendor-locked thin client and a copy of a private AI SDK signing scheme. It has 2,192-line and 1,255-line god files, and its comments disagree about the tool count. About 248 code lines cite design docs that are not in the repo, and the whole history sits in one 157k-line import commit [VERIFIED: `keeperhub-copilot-v2-review.md`].

**Against Abu's wishlist**
- Neither project had bridge-aggregator comparison, Arc yield, marketplace purchases, token or meme features, Telegram/Discord delivery, the "add unknown contact" pop-up, or native iOS, Android or desktop apps [VERIFIED by code search; see `gap-vs-new-vision.md`].
- Some of the wishlist is newly buildable on Arc: mainnet, Agent Wallets on mainnet, App Kit Earn and Onramp, and an x402 marketplace with 687 listings payable on Arc mainnet and none on testnet [VERIFIED via `context/01-arc`, `context/02-circle-agent-stack`].

**Tameion fit** [INFERENCE, tied to quoted rules in `hackathon-fit.md`]
- The rules allow a consumer super app ("Build whatever you want", and RFBs "aren't tracks"). But the theme is "a business's money", and 60% of the score (agency plus traction) rewards agents that *decide* and real businesses that *use* them.
- A better fit is RFB 4, **Autonomous Business Operator**, for freelancers and very small businesses, built on the same core. Transfers and contacts become vendor and contractor payouts, automations become payroll, yield becomes idle-cash sweeps, and notifications become escalation. Invoices would be added. Meme coins stay out of the demo.
- Use Circle Wallets or Agent Wallets and App Kit on purpose. Circle tools are 20% of the score, and arc-agent had banned them.
- Delta rule: start fresh, disclose arc-agent as prior work, and import nothing. Innovation has to come from the agent's decisions, not the chat UI.
- 12 days remain (deadline 2026-10-10 11:59 PM ET). A 16-item super app plus native apps repeats arc-agent's failure pattern.

## Gaps across this folder

- No judge feedback for arc-agent was found. I did not search Discord, email or the Arc community site.
- Neither app was run, and I did not sign in to the live keeperhub app.
- Arc-mainnet support by bridge aggregators, DEXs and meme launchpads is not covered here [UNKNOWN]. It needs its own research file.

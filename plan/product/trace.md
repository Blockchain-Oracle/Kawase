# Two-way trace

Purpose: every capability has at least one entry point on a surface; every surface element maps to a capability. An orphan in either direction is a gap.
Sources: `capability-matrix.md`, `surfaces.md`, `cards/*`.
Verified: 2026-10-02

## Capability → entry points
| Capability | Screen | Home | Token page | Fan | Chat / voice | Notification / deep link | Automation |
|---|---|---|---|---|---|---|---|
| Buy with Apple Pay / card | Add money sheet | action row, empty states, guest hero | "Buy" when short | Add money | `start_buy` | — | — |
| Receive any token | Receive | via Add money | More → Receive | Receive | `show_receive` | — | — |
| Bring to Arc | Add money → From another chain | "On other chains" group | holding across chains | — | `bring_to_arc` | "found on Base" push | auto-bring rule |
| Send any asset | Send | action row, contacts row | More → Send | Send | `propose_send` | request inbox card | scheduled send |
| Request / split | Request | — | — | Request | `create_payment_request` | reminders | reminder rule |
| Withdraw (any assets, anywhere) | Withdraw | action row | More → Withdraw | — | `propose_withdraw` | — | sweep rule |
| Swap / buy / sell any pair | Swap ticket | action row | Buy · Sell | Swap | `propose_trade` | price alert → ticket | DCA / limit |
| Meme discovery + safety | Markets (Meme) | For you | Safety section | — | `search_tokens`, `get_token_safety` | trending alert | — |
| Long / short | Perp ticket | Positions → page | Short · Long | — | `propose_perp_order` | TP/SL / liquidation push | TP/SL |
| Earn | Earn (options card) | For you, Positions | More → Earn | — | `compare_yield`, `propose_earn` | APY / liquidity alert | auto-save |
| Borrow | Borrow | Positions | More → Borrow | — | `propose_borrow` | health push | — |
| Bridge | Bridge | — | More → Bridge | — | `propose_bridge` | stuck / done push | bridge rule |
| Automations | Automations | Automations section | More → Automate | — | `draft_*`, `edit_automation` | Needs you | — |
| Marketplace | Marketplace (from For you / Settings) | For you | — | — | marketplace tools | purchase receipt | — |
| Limits / pause / risk | Wallet & limits | header chip when paused | — | — | `pause_all`, `propose_limit_change`, `set_risk_mode` | security email | — |
| Account (methods, devices, export, delete) | Settings → Account | avatar | — | — | (read-only answers) | new-device email | — |
| Activity / why / export | Activity | Recent | my activity in this asset | — | `get_activity`, `search_history` | every push opens its row | weekly report |
| Language / network / display currency | Settings, pills | header pills | — | — | `set_language`, `propose_network_switch` | — | — |

## Surface element → capability (no orphans)
- Every Home section maps to a row above (balance hero → portfolio; action row → Add money / Send / Swap / Withdraw; For you → proactive; Positions → earn / borrow / perps / LP).
- **Dock:** Home, Markets (trading and meme discovery), orb (voice), Chat (agent), Activity (history and Needs you).
- **Settings rows:** each "Coming" row is retired by its slice: Voice (C14), Memory (A5), Display currency (A1), Devices and Privacy (B8/B10), Trust and help (A3).
- **Removed orphans:** the Fund sheet's inert "Coming" bridge rows (replaced by working Bring to Arc); the Swap/Bridge toggle screen (Bridge gets its own route; Swap is the ticket).

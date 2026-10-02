# Card: The agent (chat, voice, memory) and business mode

Purpose: the how-ladder for talking to Kawase and for business users. Rules: R4, R5 (voice tap), R8, R12, R14.
Sources: `packages/agent/src/*` (19 tools today), `apps/mobile/src/chat/*`, `apps/voice-agent/src/main.ts`, GPT-Live docs (LiveKit plugin, OpenAI delegation guide), plan §1.2–1.4.
Verified: 2026-10-02

## Chat
| Lens | Answer |
|---|---|
| Entry | Chat tab · starter tiles on Home · "Ask Kawase" from any token page or card · notifications ("reply") · the voice overlay's "Type instead" |
| Which | Every verb in `capability-matrix.md` has a tool. New tools: `get_portfolio`, `get_price`, `search_tokens`, `get_token_safety`, `get_markets`, `propose_trade`, `propose_perp_order`, `get_positions`, `close_position`, `propose_withdraw`, `start_buy`, `propose_borrow`/`propose_repay`, `compare_yield`, `propose_bridge` (any recipient), `bring_to_arc`, `propose_batch_send`, `pause_all`, `propose_limit_change`, `set_risk_mode`, `remember_fact`/`forget_fact`, `search_history`, marketplace tools, `arc_knowledge` |
| How | The model proposes → **the card is the review** → approval per tier (R5). Cards per plan §C (25 kinds), streamed into the thread with tool-step chips that morph into cards |
| What if | A precondition is missing (sign-in, contact, limit, network, token rule) → explain in one line + an inline fix card → resume the same intent (D13). Ambiguity (two Aminas, two ARGUS) → a picker, never a guess |
| After | One history for chat and voice; every money card links to its receipt and why; search across all threads |
| Consistency | Same numbers, marks and tiers as screens; the agent never invents a capability (it reads the registry, R2) |
| Copy | Short replies; facts on cards, not paragraphs |

## Voice
| Lens | Answer |
|---|---|
| Entry | The orb (dock centre), long-press anywhere for push-to-talk (later), Siri shortcut (later) |
| How | **GPT-Live** full-duplex (natural turn-taking and barge-in) with **client delegation** to the same Kawase agent turn. Cards rise over the orb; captions show both sides; "Type instead" is always there |
| Safety | Voice money always needs the card tap (X1). A readback guard compares spoken numbers, assets and recipients with the canonical card facts and corrects on a mismatch |
| What if | GPT-Live unavailable → the cascaded fallback (Scribe → agent → TTS); mic denied → Settings path; app backgrounded → the session ends with a toast; network drop → reconnect with the turn identity kept |
| Languages | All ten; reply in the language spoken |

## Memory
Settings → Memory lists facts (e.g. "Mum = @adaeze", "prefers EURC"). Each can be edited or forgotten; memory can be turned off. The agent says when it uses a fact.

## Proactive suggestions ("For you")
Computed from holdings, positions and events: idle cash with a liquid yield option, a better route, a big move in a held token, an expiring request, a stuck bridge, health dropping. Each is a card with one action. Dismissible, with "don't show this kind".

## Business mode
| Lens | Answer |
|---|---|
| Entry | Settings → Business (turn on) · chat ("invoice Acme 500 USDC") |
| Which | Business profile (name, logo, address, tax id optional) → **Invoices** (any asset, line items, due date, on-chain Memo reference, PDF/share link) · **Payouts** (batch, from a CSV or contacts) · **Payroll** (a scheduled batch automation with its own grant) |
| What if | Partial/late payment → status + reminders; a payee's address change → payroll pauses that line until reviewed |
| After | Invoice paid → receipt to both sides; accounting export (CSV/beancount) per month |

## Acceptance
- [ ] Chat "long BTC 3x with $10, stop at −10%" → the perp ticket card is prefilled → slide → position card.
- [ ] Voice "send twenty euros to Mum" → card (EURC, @adaeze, network) → tap → sent; the spoken readback matches the card.
- [ ] "What can you do?" → the capabilities grid with real marks; unavailable items show their reason.
- [ ] Business: invoice 50 USDC → the payer uses `/r/` from a web wallet → marked paid by its Memo reference.

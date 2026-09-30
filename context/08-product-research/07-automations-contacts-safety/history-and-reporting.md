# History and reporting: activity feed, decision log ("why did the agent do this"), exports (CSV, beancount), receipts

Purpose: what the user-facing money history must contain, how to explain every agent action or non-action, and how to export records for taxes, accountants and reproducible books.

Sources:
- Essay and checklist: `context/06-ledgers-and-prior-art/agents-and-ledgers.md` §2, §4, §5, §7; `design-principles-for-agent-writes.md` §1, §5, §8
- beancount syntax: https://beancount.github.io/docs/beancount_language_syntax/ (fetched 2026-09-29)
- Arc: `context/01-arc/gotchas.md:19-26` (decimals), `context/01-arc/gas-and-fees.md:84` (gas as an expense line), `context/01-arc/network-config.md` (explorers), `context/01-arc/transactions-memo-batching.md` (Memo, EIP-7708 indexing)
- Circle: `context/03-circle-platform/other-apis.md:16-24` (webhooks)
- Sibling: `05-voice-language-genui/memory-and-history.md` (conversation history is out of scope here)

Verified: 2026-09-29

---

## 1. Three different histories (don't merge them) [INFERENCE]

| History | Content | Mutable? | Source of truth |
|---|---|---|---|
| **Conversation** | Chat and voice turns | The user can delete it | App DB (see sibling `memory-and-history.md`) |
| **Activity feed** | Money events: in, out, swap, bridge, earn, automation runs, requests | No. Corrections are new entries. | Chain + Circle witness, joined to our intents |
| **Decision log** | Every proposal, check, approval, block and execution, with reasons | Append-only, hash-chained | App DB, periodically anchored |

Deleting a chat must not delete the decision log. Otherwise the answer to "why did it pay X" disappears [INFERENCE].

## 2. Activity feed

Each row: time (user TZ), direction, counterparty (**contact name if the address matches a saved version, otherwise the full address with an "unknown" badge**), amount with its asset, fiat value at the time (label the source), fee and gas, status (pending, final, failed), origin (you, automation #id, agent proposal approved by you), memo/reference, and an explorer link.

Arc-specific rules:
- Show **one USDC balance and one amount**. Native (18 dp) and ERC-20 (6 dp) are the same money [VERIFIED gotcha #1–2]. Index EIP-7708 native `Transfer` logs and ERC-20 events, then dedupe the pair [VERIFIED `transactions-memo-batching.md`].
- Gas is paid in USDC, so show it as a separate line. "Emitter-based transfer indexing will not catch it" [VERIFIED `gas-and-fees.md:84`].
- Explorer links go to `https://explorer.arc.io/tx/<hash>` for mainnet and `https://explorer.testnet.arc.io/tx/<hash>` for testnet [VERIFIED hosts in `network-config.md`; path is standard Blockscout, INFERENCE].
- Hide dust and zero-value inbound transfers from unknown senders by default, with a "show hidden (possible poisoning)" toggle [INFERENCE, see `contacts-and-names.md` §7].
- A transaction is either pending or final on Arc, so "final" is shown quickly. Still, mark "paid" only on a witness (receipt `status == 1` or Circle `COMPLETE`) [VERIFIED principles §1].
- Filters: by contact, asset, type, automation, date. Search by natural language via the agent ("how much did I send Alex in August?"), answered from the feed with the rows cited.

## 3. Decision log: "why did the agent do this?"

The schema follows `design-principles-for-agent-writes.md` §8 [VERIFIED as a checklist item]: `{ts, trigger, balances_seen, rule_applied, model_proposal, checks[], decision, intentId, idempotencyKey, txHash, approver?}`, plus for this product [INFERENCE]:
- `utterance_ref` (the turn that caused it) or `automation_id@version` plus `occurrence_id`
- `resolution`: `"Alex" → contact c_12 v3 → 0x3F2a…7D4e (preferred on Arc since 2026-09-01)`
- `checks[]`: each `{name, input, result, layer: server|circle|onchain}`, e.g. `{weekly_cap, used 1420/1500, pass, server}`
- `quote` (for swaps and bridges): route, fee, min-out, expiry
- `approval`: method (biometric, passkey, Telegram deny), device, time
- `outcome`: `succeeded | skipped(reason) | blocked(reason) | failed(reason)`

UX [INFERENCE]: every feed row and every "I didn't do X" answer has a **"Why?"** that renders the chain above in plain language. For example: "Skipped Tuesday's $10 to Alex: balance $6.20 was below $10 + $0.01 gas. Your setting is *skip, don't retry*." Blocks matter as much as sends. The essay's RFB-4 metric counts "decisions made vs escalated, and how often the human agreed" [VERIFIED principles §4].

Integrity [VERIFIED as a principle, INFERENCE for scope]: hash-chain entries `h_n = H(h_{n-1} || entry)`, and optionally anchor the head hash on Arc on a schedule (a cheap transaction). The user can export the log with its hashes.

## 4. Exports

### CSV (tax tools and spreadsheets)
Columns [INFERENCE]: `timestamp_utc, local_time, type, direction, asset, amount (decimal string, 6 dp for USDC/EURC), fee_asset, fee_amount, gas_usdc, counterparty_name, counterparty_address, chain_id, tx_hash, log_index, memo_id, automation_id, intent_id, fiat_ccy, fiat_value, fiat_rate_source`.
- Amounts are exact decimal strings from integer base units, never floats. The essay's hazard is 6-dp USDC read as 2 dp [VERIFIED `agents-and-ledgers.md` §5].
- A swap is exported as two legs (disposal and acquisition) that share `tx_hash`.

### beancount (reproducible books)
Syntax [VERIFIED docs]: links `^link`, tags `#tag`, `key: value` metadata, and `balance` assertions. `commodity` declarations are optional.

```
2026-09-01 open Assets:Arc:Wallet            USDC,EURC
2026-09-01 open Expenses:Fees:ArcGas         USDC
2026-09-01 open Expenses:Gifts:Alex          USDC
2026-09-01 commodity USDC
  name: "USD Coin (6 decimals)"

2026-10-06 * "Alex Martin" "Weekly allowance (automation a_7 run 5)" ^intent-9f1c #automation
  tx_hash: "0xabc…"
  chain_id: "5042"
  contact_version: "c_12@v3"
  Expenses:Gifts:Alex          10.000000 USDC
  Expenses:Fees:ArcGas          0.004210 USDC
  Assets:Arc:Wallet           -10.004210 USDC

2026-10-07 balance Assets:Arc:Wallet   1234.567890 USDC
```
- Write amounts at full 6-dp precision. A `balance` assertion per day, taken from the chain, turns any gap into a loud failure instead of a silent rounding entry, which is the essay's "make repair loud" [VERIFIED §5, §7.4].
- `^intent-…` links every entry to its decision-log record.
- [INFERENCE] beancount is also a good judge-facing artifact: `bean-check` passes, and Fava gives a free UI (named in principles §8).

### Receipts
Per payment, a shareable receipt (PDF/PNG or link) with: payer and payee names *as the payer labelled them*, full addresses, amount, asset, chain, UTC time, tx hash with an explorer link, memo/request id, and "final on Arc" status [INFERENCE]. The chain proves "consistency, not independence". A receipt shows you paid *that address*, not that it was the right person [VERIFIED `agents-and-ledgers.md` §4].

## 5. Reconciliation (background, surfaced as health)

A scheduled job compares feed and ledger vs chain balance per asset. Any mismatch goes to a visible **Suspense** row plus an alert, never an auto-fix. Show "Books reconciled ✓ as of 09:00" in settings [VERIFIED principle §5, INFERENCE UX].

## Gaps

- Tax-tool CSV schemas (Koinly, CoinTracker) were not checked for exact column names.
- The fiat price source for historical valuation is not chosen. The Chainlink Arc feeds (see `automations.md`) are onchain but have a 24 h heartbeat.
- The receipt legal format (invoice vs payment receipt) per jurisdiction was not researched.

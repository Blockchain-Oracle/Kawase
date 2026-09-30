# Contacts and name resolution: address book, "send to Alex", ENS/Basenames/Arc names, email/phone, QR, poisoning defenses

Purpose: the contact data model, the unknown-recipient flow, which naming systems can resolve an Arc address today, and the controls that stop address poisoning and payee substitution.

Sources:
- ENS: https://docs.ens.domains/ensip/19 (fetched 2026-09-29); ENSIP-11 is referenced there
- Basenames: https://github.com/base/basenames README (`gh api repos/base/basenames/readme`, 2026-09-29)
- Arc names: https://github.com/cekuu35/arcns; live `eth_getCode` on Arc mainnet (`.firecrawl/product/07/arcns-mainnet-getcode-2026-09-29.txt`); web search results listing arcnames.co, dotarc.org, arcname.services, arcnames.xyz, arcname.io, unicname.xyz (2026-09-29)
- PayX: arc-agent `docs/research/2026-07-28-arc-protocol-action-surface.md:80-82`, re-checked live (`.firecrawl/product/07/arc-rpc-simulation-methods-2026-09-29.txt`, last line)
- Email/phone wallets: https://docs.privy.io/recipes/pregenerate-wallets
- QR: https://eips.ethereum.org/EIPS/eip-681
- Poisoning incident: https://www.coindesk.com/web3/2025/12/20/crypto-user-loses-usd50-million-in-address-poisoning-scam; sibling `04-analogs-and-competitors/failures-and-incidents.md:88,99`
- Change control: `context/06-ledgers-and-prior-art/agents-and-ledgers.md` §2, §4; `design-principles-for-agent-writes.md` §3; Circle Managed Payments address book (`.firecrawl/docs/circle-llms-full.txt:51408-51440`); Circle Agent Wallet allowlist (`:1369-1440`); Circle Address Book MSCA module (`03-wallets-custody-limits/circle-wallet-options.md:84`)
- Analogs: https://help.coinbase.com/en/coinbase/managing-my-account/other/address-book-allowlist (403 to fetch; summarized by search); sibling `telegram-and-chat-bots.md:56-59`, `ai-crypto-agents.md:38`
- Lessons only: arc-agent `packages/application/src/contact-resolution.ts:1-40`, `docs/wiki/memory-contacts-and-preferences.md`

Verified: 2026-09-29

---

## 1. Data model [INFERENCE unless tagged]

```
Contact {
  id, owner_id,
  display_name        "Alex Martin"
  aliases[]           ["Alex", "Al", "my brother"]   // normalized (NFKC, casefold), unique per owner
  addresses[] {
    chain_id          5042 | 5042002 | 8453 ...       // CAIP-2 "eip155:5042"
    address           EIP-55 checksummed
    label             "main", "Coinbase deposit"
    source            typed | pasted | qr | ens:<name> | basename:<name> | arcns:<name> | received_from_tx | invite_link
    is_preferred      one per chain
    status            pending_cooldown | active | retired | blocked
    added_at, activates_at, verified_at, verified_method   // "test payment acknowledged", "QR in person", "name resolved + user confirmed"
    last_paid_at, last_paid_amount, times_paid
    version           // an address change = new row + retire old; never UPDATE in place
  }
  notes, avatar, tags
  verified            bool derived from ≥1 address with verified_method
  first_paid_at
  created_by          user | agent_suggestion (needs user confirm)
}
AddressChangeEvent { contact_id, old_address, new_address, requested_by, approved_by, approved_at, cooldown_ends_at, reason }
```

Why these fields:
- **Multiple addresses per chain, with a preferred one.** A friend may have a Coinbase deposit address on Base and a self-custody address on Arc. "Friendly name must resolve to an explicit chain/address" was arc-agent's rule, and it holds up as a lesson [VERIFIED `memory-contacts-and-preferences.md`].
- **Versioned addresses and change events.** This is the essay's point: the controls that catch paying the wrong party are "change control on vendor bank details" and comparing with "the last account paid". Reconciliation cannot catch it, because "A payment to the wrong vendor's account reconciles perfectly" [VERIFIED `agents-and-ledgers.md` §2, §4, §7].
- **`last_paid_*`** drives the "you've paid this address 12 times" reassurance and the first-time-recipient warning.
- **Contacts live in a typed store the user edits, not in free-form model memory.** Stored memory is an injection surface [VERIFIED sibling `failures-and-incidents.md:74`].

## 2. Resolution order for "send $10 to X" (deterministic code, not the model)

The model extracts `recipientName: "Alex"`. Code then does the rest [pattern from arc-agent `contact-resolution.ts:10-20`: "a model that never sees a contact id cannot emit a wrong one"; used here as a lesson, not a design import]:

1. **Exact alias match** in the owner's contacts gives one contact, then its preferred address on the target chain.
2. **Several matches** ("Alex M." and "Alex K.") mean a *refusal to guess*. Show a picker with avatar, name and short address.
3. **Fuzzy match** (edit distance ≤1, or a phonetic match for voice): *suggest* "Did you mean Alyx?" and never auto-select [INFERENCE; voice mishearing is the main risk, see sibling `voice-safety-confirmation.md`].
4. **Looks like a name** (`alex.eth`, `alex.base.eth`, `alex.arc`): resolve it (§4), then run the unknown-recipient flow with the resolved address prefilled.
5. **Looks like an address** (`0x…`, 40 hex): validate the EIP-55 checksum, then run the unknown-recipient flow.
6. **Nothing found**: run the unknown-recipient flow.

The recipient is **never** taken from transaction history, from a webpage or email the agent read, or from a memo [INFERENCE; address-poisoning rule in sibling `failures-and-incidents.md:99`].

## 3. "Send to Alex" when Alex is unknown

1. The agent says: "I don't have an address for Alex. Add Alex?" It shows a card with buttons **[Scan QR] [Paste address] [Enter a name like alex.eth] [Send a request link instead]**.
2. A form pops up with name (prefilled "Alex"), network (default Arc), and address or name. The address field shows a live checksum check and resolution result.
3. If the user typed a name, the form shows the resolved address **in full**, the naming system it came from, and a warning for third-party namespaces (§4).
4. On save, the contact is created with `status = pending_cooldown` if the user's policy has a new-recipient cooldown (`limits-and-safety.md`), otherwise `active`.
5. The agent returns to the original intent with a **first-time-recipient** confirmation: "First payment to this address. Send a small test ($1) first?" The full address is shown in chunks (`0x3F2a 91Bc … 7D4e`).
6. After success, `verified_method = "first payment"` is *not* set automatically. Only an out-of-band acknowledgement ("Alex confirmed receipt") or an in-person QR sets `verified`.

"Send a request link instead" is the safest path: Alex opens a link and supplies their own address, so the sender never types one [INFERENCE]. The link format is in §6.

## 4. Naming systems that can yield an Arc address (checked 2026-09-29)

| System | Resolves to an Arc address? | How | Status |
|---|---|---|---|
| **ENS** (`.eth`) | **Yes, indirectly.** Resolution happens on Ethereum L1. An address for any EVM chain can be stored under an ENSIP-11 coinType derived from the chainId (Arc 5042 gives `0x80000000 | 5042`). If no chain-specific record exists, ENSIP-19 says `addr(node, coinType)` "should always match the value returned by `addr(node, 0x8000_0000)`", the default EVM address. | L1 RPC (or CCIP-read) | [VERIFIED spec]. [INFERENCE] Falling back to the default EVM address is only safe if the holder controls the same address on Arc (true for EOAs, not always for smart wallets or exchange deposit addresses), so show "default EVM address, not Arc-specific" when the fallback is used. ENSIP-19 primary-name registrars exist only for chains "that post state to L1", which excludes Arc, so reverse (address → name) display for Arc is limited [INFERENCE from the quoted rule]. |
| **Basenames** (`*.base.eth`) | Same as ENS: an ENS subname with an L1 resolver doing "cross-chain, wildcard resolution from L1" via a CCIP gateway; records live on Base's L2 resolver. | ENS resolution path | [VERIFIED README]. The Arc address is only present if the owner set the coinType or the default record [INFERENCE]. |
| **ArcNS** (`.arc`, `.circle`) | **Yes, natively on Arc mainnet.** Registry `0xcA4d…b8Fb`, Resolver proxy `0x68Bb…7023`, Reverse Registrar `0x3731…252a`, and others. | Arc RPC | [VERIFIED] bytecode present on mainnet at block `0x1636fa9`. The project says it is "not operated by, affiliated with, sponsored by, or endorsed by Circle or the Arc team". Audit status is unclear (an audit folder is referenced but no completion statement). Contracts are MIT; the frontend is BSL-1.1. |
| **Other ".arc" services** | Unknown | — | [REPORTED] Search on 2026-09-29 returned **at least six other sites** claiming ".arc" names (arcnames.co, dotarc.org, arcname.services, arcnames.xyz, arcname.io, unicname.xyz). **There is no official Arc naming service**, and the same "alex.arc" could resolve differently in each. [INFERENCE] Pick at most one, label it as third-party, and never auto-trust it. |
| **PayX** (X-handle escrow) | Escrows USDC against an X handle, claimed after X verification | Contract | [VERIFIED] `PayXTipping` `0xA312…5913` has code on **testnet only**, and `eth_getCode` on mainnet returns `0x`. |
| **Social/handle resolution in other agents** | Bankr accepts ENS, Basenames, X, Farcaster and Telegram handles | Offchain lookups | [VERIFIED sibling `ai-crypto-agents.md:38`] |

## 5. Email or phone to wallet

- **Circle:** no "send USDC to an email or phone number" API was found. The Circle dump's only email hits are the user-controlled wallet login ("Use the same email address to show the same wallet") [VERIFIED grep of the dump, lines 119101 and 120045]. A user-controlled wallet is keyed to *your app's* user, so you can pay another user of the same app by email. That is an app-level directory, not a global one [INFERENCE].
- **Privy:** can pregenerate a wallet for "an email address or phone number, without requiring the user to login", and "You can even send assets to the wallet before the user logs in" [VERIFIED docs]. The listed chains do not mention Arc. Its EVM wallets are EOAs, which would have the same address on Arc [INFERENCE].
- **Recommended pattern [INFERENCE]:** "Send to an email" becomes (a) an existing app user found by verified email gives their wallet, or (b) otherwise a **claim link**. Funds sit in an escrow you control (or you send nothing and create a request), and the recipient claims after signing up. PayX's handle escrow is the same shape. Never auto-create a contact from an email you parsed out of an inbox.

## 6. QR codes and links

- **EIP-681** is Final: `request = schema_prefix target_address [ "@" chain_id ] [ "/" function_name ] [ "?" parameters ]`. Its ERC-20 example is `ethereum:0x8920…/transfer?address=0x8e23…&uint256=1` [VERIFIED].
- For Arc: `ethereum:0x3600000000000000000000000000000000000000@5042/transfer?address=<recipient>&uint256=<amount in 6-dp units>`. Amounts are 6 dp on the ERC-20 interface [VERIFIED gotcha #1; URI composition is INFERENCE].
- "My QR" in the app should encode an EIP-681 URI **with the chain id**, so scanning on another wallet doesn't send on the wrong chain. A request QR adds the amount, and we add a request id that we put in the Memo [INFERENCE].
- On scan, the app shows the decoded chain, token, amount and full address, then runs the unknown-recipient flow. A QR does not bypass the first-time warning.

## 7. Address poisoning and lookalike defenses

The canonical incident: on 20 Dec 2025 a user test-sent 50 USDT, the attacker dusted a lookalike address matching the first and last characters, and the user copied it from history and sent 49,999,950 USDT [REPORTED CoinDesk, also in sibling `failures-and-incidents.md:88`].

Controls [INFERENCE unless tagged]:
1. **Never offer "recent addresses from chain history" as recipients.** Only saved contacts, resolved names, QR, or paste.
2. **Hide or flag dust and zero-value inbound transfers** in the activity feed, and never auto-create contacts from inbound transfers.
3. **Lookalike check on every new or pasted address:** compare the first 4 and last 4 hex characters (and a longer prefix+suffix window) against all saved addresses. On a near-match that isn't an exact match, show a **hard stop**: "This looks like Alex's address but is different in the middle."
4. **Show addresses in full, in chunked groups**, on the confirmation for any first-time or changed address, not the `0x12…abcd` abbreviation the attack exploits.
5. **Checksum (EIP-55) validation** for pasted input. A wrong case is an error, not a warning.
6. **Clipboard mismatch:** if the pasted value differs from what the user copied inside the app, warn. This is best-effort, since OS clipboard access varies.

## 8. First-time-recipient warning and address change control

The essay's "vendor master change control", mapped to consumer P2P:

| Event | Control | Evidence / precedent |
|---|---|---|
| New address on a contact | `pending_cooldown` for N hours (user setting; default 24 h). Notification on **all channels**: "A new address was added to Alex". Any device can cancel it during the cooldown. | Coinbase allowlist: 48 h before a new address can be used, with an email on add [REPORTED]. Bankr: new allowlist entries wait a cooldown, default 24 h [VERIFIED sibling `telegram-and-chat-bots.md:59`]. Circle Managed Payments: the recipient must become "active" before a payout [VERIFIED dump :51412]. |
| Change of an existing contact's address | **Never an in-place edit.** Create a new version and retire the old one. Re-run the cooldown and require biometric confirmation. The payment screen then says "Address changed 2 days ago". | `design-principles-for-agent-writes.md` §3: "Any new or changed address requires a human approval and a cool-off period, and never comes from an address read off a PDF" |
| Address change **proposed by the agent** (e.g. read from an email "my new wallet is …") | Allowed only as a *suggestion* card. It never auto-applies, and it is flagged as coming from external content. | Anti-pattern: OCA/edi creating bank accounts from a PDF [VERIFIED `agents-and-ledgers.md` §3] |
| First payment to an address | Warning card, optional test amount, full address display, and it counts against the "new recipient" limit | `limits-and-safety.md` |
| Payment to an address ≠ last paid address for that contact | Hard confirmation: "Last time you paid Alex at …7D4e; this is …91Bc" | Essay: compare to "the last account paid" [VERIFIED §7] |

Onchain enforcement, when available: the Circle Agent Wallet `recipient-allowlist` on Arc mainnet needs a human email OTP to change, which is a natural "human signs the change" control [VERIFIED `.firecrawl/docs/circle-llms-full.txt:1369-1440`]. Circle's Address Book MSCA module restricts ERC-20/721/1155 transfers to allowlisted addresses. Whether it covers Arc **native-value** USDC is untested [UNKNOWN, sibling `circle-wallet-options.md:84` and its Gaps section].

## Gaps

- I did not test ENS resolution of an Arc coinType end-to-end (no live L1 lookup was run).
- I did not verify ArcNS's audits, admin keys or upgradeability (the resolver is a proxy).
- The status of the other ".arc" name sites (live, mainnet or testnet) is [UNKNOWN].
- I found no global email/phone-to-address directory for Arc.

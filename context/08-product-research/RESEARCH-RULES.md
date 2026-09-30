# Research rules for 08-product-research

Purpose: shared rules every research agent in this folder follows. The user (Abu) has asked explicitly: **do not make anything up.**
Verified: 2026-09-29

## The product being researched (Abu's words, summarized)

An AI agent for the **whole Arc ecosystem** (Arc = Circle's stablecoin-native L1), on **iOS + Android mobile and desktop**. It should be able to do "everything Arc can do": transfers, trades/swaps, bridging (comparing bridge aggregators for the cheapest fee), yield, marketplace actions (x402/agent marketplace), and even meme coins/tokens. It also needs wallets and limits. Add-ons Abu named:
- **Automations**, e.g. "every Tuesday send $10 to this friend"; users manage them.
- **Voice interface**: two-way natural conversation ("Hello, how's it going?" / "What do you want me to do today?").
- **Multilingual**: speak French etc., and change the app language.
- **Contacts**, e.g. "send to Alex" → "I don't have Alex's address" → a pop-up to add it; saved contacts the agent knows about.
- **Notifications**: connect Telegram, Discord, etc. in settings, and get notified when X happens.
- **Generative UI components**: rich cards for bridges, swaps, etc.
- **Conversation history.**
- Everything else that good UX implies. Abu expects us to find what's missing.

Context: this is for the Tameion Agents Hackathon (`context/00-hackathon/`). **Reference projects are NOT templates.** Abu's prior projects `/Users/abu/dev/hackathon/arc-agent` ("Arc Copilot") and https://github.com/Blockchain-Oracle/keeperhub-copilot-v2 are similar agents. Abu says both got a lot wrong, "the wrong architecture was used", and Arc Copilot failed. Use them only as a feature checklist and a source of lessons (what broke). Never default to their architecture, stack, libraries or custody model; choose everything fresh on current evidence. Existing library: `context/01-arc` … `context/06-*`, plus full docs dumps at `.firecrawl/docs/arc-llms-full.txt` and `.firecrawl/docs/circle-llms-full.txt` (grep them; never cat them whole).

## Evidence rules (mandatory)

1. **Every factual claim carries a source**: a URL, an API response saved under `.firecrawl/`, or a `path:line`. No source means you don't write it.
2. Tag each claim's status:
   - **[VERIFIED]**: you checked the primary source today (official docs, repo code, live API or RPC call).
   - **[REPORTED]**: a secondary source (news, blog, third-party list).
   - **[INFERENCE]**: your reasoning, labelled as such.
   - **[UNKNOWN]**: you looked and could not confirm. Say where you looked.
3. **"Supports Arc" claims need proof**: a chain list API that returns chain 5042 (mainnet) or 5042002 (testnet), a docs page, or a deployed contract (`eth_getCode` on `https://rpc.mainnet.arc.io` or the testnet RPC in `context/01-arc/network-config.md`). Marketing or a partner-logo wall is only [REPORTED].
4. Separate **mainnet** from **testnet** everywhere. Separate **live** from **announced**.
5. Quote sparingly and exactly; do not "fix" quotes.
6. Do not pad. A short, true file beats a long, speculative one. List gaps explicitly.
7. Tools: WebSearch/WebFetch (load with ToolSearch `select:WebSearch,WebFetch`), curl, `gh api`, and Context7 (`select:mcp__plugin_context7_context7__resolve-library-id,mcp__plugin_context7_context7__query-docs`; its quota may be exhausted, so fall back gracefully). The Firecrawl CLI works but credits are shared and scarce: ≤60 credits per agent (`firecrawl search "q" --limit 5 --json -o .firecrawl/<name>.json`, `firecrawl scrape "<url>" -o .firecrawl/<name>.md`). Save raw evidence under `.firecrawl/product/`.
8. No credentials in any file. Don't create accounts, sign in, or send transactions.
9. Each file starts with a one-line purpose, a `Sources:` list, and `Verified: 2026-09-29`.

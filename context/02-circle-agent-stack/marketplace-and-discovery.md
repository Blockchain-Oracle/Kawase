# Agent Marketplace and Discovery API

Purpose: how agents find paid x402 services (catalog, API, CLI), what is actually listed on Arc today, and how to become a listed seller (a traction lever).
Sources: /agent-stack/agent-marketplace (+ become-a-seller, get-listed, discovery-api), agents.circle.com/skills/discover-services.md, `https://agents.circle.com/.well-known/openapi.json`, `/.well-known/a2a.json`, live Discovery API queries 2026-09-29 (raw: `.firecrawl/circle-agent-stack/arc-all.jsonl`), prior snapshot `arc-agent/docs/raw/marketplace-snapshot-2026-07-28.md`.
Verified: 2026-09-29

## What it is

Curated, "compliance-first" catalog of x402 services priced in USDC (launched 2026-07-31). Each seller's payout wallet is continuously sanctions-screened; endpoints continuously health-checked (unreachable ones auto-excluded). Listings carry structured payment requirements + input/output JSON Schema so an agent can pay and call without reading docs. Standards: CAIP-2 networks, x402, x402 Bazaar discovery schema, OpenAPI and A2A discovery surfaces.

Surfaces:
- UI: https://agents.circle.com/services (per chain: https://agents.circle.com/services/network/arc)
- API: `GET https://api.circle.com/v2/x402/discovery/resources` — public, **no key, no account**, gzip (`curl --compressed`). A `/v1/…` variant also exists in the OpenAPI.
- CLI: `circle services search|inspect|pay`
- OpenAPI: https://agents.circle.com/.well-known/openapi.json · A2A card ("x402 Discovery API"): https://agents.circle.com/.well-known/a2a.json · skills index: https://agents.circle.com/llms.txt

## Discovery API parameters (all optional)

| Param | Notes |
|---|---|
| `query` | fuzzy over resource URL, provider, description, tags/categories (don't use for chain filtering) |
| `category` | `SOCIAL_INTELLIGENCE`, `FINANCIAL_ANALYSIS`, `WEB_SEARCH_RESEARCH`, `PREDICTION_MARKETS`, `CREATIVE`, `INFRASTRUCTURE` (live data also shows `DATA_ENRICHMENT`, undocumented) |
| `type` | `http` or `mcp` |
| `network` | CAIP-2 (`eip155:5042`) or legacy name (`base`) |
| `asset`, `scheme`, `payTo` | token address, `exact`, merchant address |
| `maxUsdPrice` | e.g. `0.01` |
| `supportsVanillax402`, `supportsCircleGateway` | booleans |
| `siwx` | set `false` for CLI/agent flows (SIWX needs browser auth) |
| `fields` | comma-separated projection |
| `limit` (default 50, max 200), `offset` | pagination; response `pagination.{limit,offset,total}` |

Item shape (v2):
```json
{"resource":"https://…","type":"http","x402Version":2,"lastUpdated":"…",
 "accepts":[{"scheme":"exact","network":"eip155:8453","asset":"0x8335…","amount":"18000","payTo":"0x…",
             "extra":{"name":"GatewayWalletBatched","version":"1","verifyingContract":"0x7777…"}}],
 "metadata":{"provider":{"name":"AIsa API","description":"…","category":"…","tags":[…],"website":"…","docsUrl":"…","openApiUrl":"…"},
   "path":"/apis/v2/…","method":"GET","description":"…","mimeType":"application/json",
   "input":{…JSON Schema…},"output":{…},"siwx":false,"supportsVanillax402":false,"supportsCircleGateway":true}}
```

Useful queries:
```bash
curl -s --compressed "https://api.circle.com/v2/x402/discovery/resources?network=eip155:5042&supportsCircleGateway=true&siwx=false&limit=200"
curl -s --compressed "https://api.circle.com/v2/x402/discovery/resources?maxUsdPrice=0.01&category=FINANCIAL_ANALYSIS&siwx=false"
circle services search "company enrich" --category FINANCIAL_ANALYSIS --output json
```

## Live catalog snapshot (2026-09-29)

| Metric | Value |
|---|---|
| Total listings | 1,337 (was 636 on 2026-07-28) |
| Payable on **Arc mainnet** (`eip155:5042`) | 687 (614 via Circle Gateway) |
| Payable on **Arc Testnet** (`eip155:5042002`) | **0** |
| Circle-Gateway-capable (all chains) | 638 |
| Arc providers | Orthogonal 293 (nanopayment proxy for Apollo, Aviato, …), AIsa API 135 (Apollo, CoinGecko, …), QuickNode 132, BlockRun.AI 114, Goldsky 11, Exa 2 |
| Arc categories | FINANCIAL_ANALYSIS 181, DATA_ENRICHMENT 170, WEB_SEARCH_RESEARCH 133, INFRASTRUCTURE 94, PREDICTION_MARKETS 62, SOCIAL_INTELLIGENCE 29, CREATIVE 18 |
| Arc price (first Arc accept) | min $0, median $0.01, max ~$5.00 |
| Finance-relevant examples | company/org enrichment (Orthogonal→Apollo/Aviato: `np.orthogonal.com/aviato/company/enrich`), crypto prices (`api.aisa.one/apis/v2/coingecko/simple/price`), phone fraud/SIM-swap lookup (`arc.blockrun.ai/api/v1/phone/lookup/fraud`), email outreach (Apollo sequences), prediction-market odds |
| Not found on Arc | sanctions/KYC screening, invoice OCR/PDF parsing, FX rates — **gap = seller opportunity** |

Implication: a testnet-only build cannot buy from the marketplace; either (a) run your own x402 seller on Arc Testnet (invoice parser, risk score, vendor lookup…) and have your agent buy from it, or (b) spend small real USDC on Arc mainnet for the "real traction" bonus.

## Become a seller (Circle how-to)

Prereqs: payout EVM address (an agent wallet works), an HTTP API, Node 22.6+, a price.
```bash
npm install @circle-fin/x402-batching @x402/core @x402/evm viem express
```
```ts
const gateway = createGatewayMiddleware({ sellerAddress: "0xPAYOUT", facilitatorUrl: "https://gateway-api-testnet.circle.com" });
app.get("/premium-data", gateway.require("$0.01"), (req, res) => res.json({ data: "…" }));
```
Add vanilla rail with `x402ResourceServer([new HTTPFacilitatorClient({url}), new BatchFacilitatorClient()])` + `GatewayEvmScheme` (x402.md); accept >1 chain. Test `curl -i` → 402 + `PAYMENT-REQUIRED`. Check/withdraw earnings with `GatewayClient`. Shortcut: `circle skill install --tool claude-code --name accept-agent-payments` then ask your coding agent to add agent payments.

## Get listed

Manual review today (self-serve "coming"). Need: payable endpoint (402 when unpaid), a published **OpenAPI spec**, payout wallet (sanctions-screened during review). Submit via intake form https://forms.gle/7YFzvdmMcn1JH5tF6 (endpoint URL, payout wallet, description). Once approved: appears in catalog + Discovery API; stays listed only while healthy. Write metadata so category/network/price filters find you. Lead time unknown — submit early in the event window.

## Agent-to-agent commerce ideas enabled

- Agent B exposes its capability (e.g. "vendor risk score", "invoice extraction") as an x402 endpoint; Agent A discovers it via Discovery API and pays per call — pure machine-to-machine AP.
- Price in sub-cents with Gateway (usage-based billing, per-second streaming value, per-call metering).
- Use `type=mcp` listings to find paid MCP tools.
- Discovery results carry JSON Schemas → an LLM can construct the request body automatically (`circle services inspect` does this with json-schema-faker).

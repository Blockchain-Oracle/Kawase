# ARC CLI (`arc-canteen`)

Purpose: everything a Tameion builder needs to know about Canteen's `arc-canteen` CLI: the Canteen-hosted Arc testnet RPC, the $5 funded testnet wallet, bundled agent context, progress updates, and the Showcase submission.

Sources: github.com/the-canteen-dev/ARC-cli (cloned to `refs/canteen/ARC-cli`, v0.1.17, source read: `arc_canteen/*.py`); https://arc-node.thecanteenapp.com/ (`.firecrawl/arc-node-canteen.html`, a single page with no subpages; `/robots.txt` and `/sitemap.xml` return 404); github.com/the-canteen-dev/context-arc (cloned to `refs/canteen/context-arc`); https://arc-oss.thecanteenapp.com/; PyPI `arc-canteen` (latest 0.1.17); `gh repo list the-canteen-dev`.
Verified: 2026-09-29

---

## TL;DR

```bash
uv tool install arc-canteen          # PyPI (slides). Same as: uv tool install git+https://github.com/the-canteen-dev/ARC-cli
arc-canteen login                    # GitHub device flow, then asks for Discord (required), Telegram and email (use your Luma email)
                                     # -> mints an RPC token and a server-generated testnet wallet funded with $5 USDC
source ~/.arc-canteen/env            # sets $RPC for this shell
arc-canteen shell-init >> ~/.zshrc   # sets $RPC in every new shell
arc-canteen context sync             # clones Arc + Circle docs and 8 sample apps into ~/.arc-canteen/context/
arc-canteen context | claude         # pipes AGENTS.md and a path manifest into your coding agent
cast block-number --rpc-url $RPC     # smoke test (foundry)
```

Why it matters for judging: `update-traction` and `update-product` send your progress straight to Canteen/Circle, and the login ties your GitHub handle to Discord and email. The README says the CLI is how "Canteen, Arc and Circle ... provide you prizes, support and (maybe even) investment". Traction is 30% of the score, so log updates as you go.

## Network details (Canteen-hosted Arc testnet)

| Field | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` (hex `0x4cef52`) |
| Currency / gas token | USDC (native, 18 decimals at the gas layer; the ERC-20 view uses 6) |
| RPC URL | `https://rpc.testnet.arc-node.thecanteenapp.com/v1/<key>` (key issued per developer) |
| Explorer | https://testnet.arcscan.app |
| CLI backend | `https://arc-cli-server.thecanteenapp.com` (returns 401 without a token) |
| Mainnet | not provisioned in the CLI (`CHAIN_RPC_URLS` has only `testnet`) |

- The `<key>` is a `swrm_…` session token minted at login. The CLI server and the RPC proxy share one sessions table. The token sits in the URL path, so it works in viem, ethers, cast and web3.py without extra headers.
- Tokens last **90 days**. The dashboard nudges you as that approaches. `arc-canteen rotate-rpc-key` mints a new token and kills the old one on the server, so update any `.env` or CI secrets afterwards. `logout` also invalidates the token.
- The proxy enforces a **method allowlist**. A blocked method returns `method '<x>' not allowed by the proxy`. For heavy indexing or unusual methods, fall back to the public Arc RPC listed in `docs.arc.network` (`arc/references/rpc-endpoints.md` in context-arc).
- Code snippets the CLI prints: `http(process.env.RPC)` (viem), `new JsonRpcProvider(process.env.RPC)` (ethers v6), `Web3(Web3.HTTPProvider(os.environ['RPC']))` (web3.py).

## Every command (v0.1.17)

| Command | What it does |
|---|---|
| `arc-canteen` / `arc-canteen status` | Dashboard: profile, RPC URL and key age, wallet address, last 5 updates, and nudges (complete profile, create wallet, submit showcase, sync context, log traction/product) |
| `arc-canteen login` | GitHub Device Flow OAuth (client `Ov23liTpDFXKEw56hVH1`, no scopes). Registers with the server, prompts for Discord (required), Telegram and email (stored as `luma_email`, used for grants and awards), provisions the funded wallet, writes `~/.arc-canteen/env` and prints the RPC quickstart |
| `arc-canteen logout` | Clears local creds and invalidates the token on the server |
| `arc-canteen profile` / `profile edit` / `profile-edit` | View or edit Discord, Telegram and email (`-` clears) |
| `arc-canteen wallet` | Shows (or creates) your **testnet wallet funded with $5 USDC**. The server runs `cast wallet new`, funds it from the faucet and returns the private key once. The key is stored only in `~/.arc-canteen/wallet.yaml` (mode 0600) and the server keeps only the address. Lose the file and you lose the wallet; re-running creates a new one |
| `arc-canteen rpc <method> [params_json] [--raw]` | Authenticated JSON-RPC call, e.g. `arc-canteen rpc eth_getBalance '["0xabc…","latest"]'`. `--raw` prints the full envelope |
| `arc-canteen rpc-url [--export]` | Prints the URL with your key, or `export RPC=…` for `eval` |
| `arc-canteen shell-init` | Prints an rc snippet that sources `~/.arc-canteen/env` |
| `arc-canteen rotate-rpc-key` | New token, rewrites `config.yaml` and `env`, revokes the old token |
| `arc-canteen context [--paths] [--full]` | Prints `AGENTS.md` plus a path manifest of the synced context. `--full` inlines every .md/.yaml (large; for stateless agents) |
| `arc-canteen context sync` | Clones or pulls `the-canteen-dev/context-arc` (with submodules) into `~/.arc-canteen/context/` |
| `arc-canteen update` / `update traction` / `update-traction` | Multi-line prompt: "How many users have expressed interest? Who is using it currently?" Sends an `update_traction` event |
| `arc-canteen update product` / `update-product` | "What have you shipped since your last update? Paste a Loom link…" Sends an `update_product` event |
| `arc-canteen ls [traction\|product\|all]` / `history` | Lists your past updates |
| `arc-canteen push` | Flushes queued events (offline-safe; the server is idempotent) |
| `arc-canteen submit-puzzle` | Submits an answer to the current Discord or easter-egg puzzle |
| `arc-canteen submit-showcase` | Guided submission to the **Arc Open Source Showcase** (see below) |
| `arc-canteen --version` | Version; the CLI also checks GitHub tags hourly and prompts `uv tool upgrade arc-canteen` |

### Local state (`~/.arc-canteen/`)
`config.yaml` (auth, profile, cached updates), `settings.yaml` (`chain: testnet`, `event_name`), `queue.yaml` (append-only event queue), `env` (`export RPC=…`), `wallet.yaml` (private key, 0600), `showcase.yaml`, `error.log`, `context/`.

> **Gotcha:** `settings.yaml` defaults to `event_name: lepton`, left over from the previous hackathon. Every event is tagged with this label. Setting `event_name: tameion` in `~/.arc-canteen/settings.yaml` probably makes your updates attribute to Tameion. This is unconfirmed, so ask in the Canteen Discord. The value is free-form, up to 64 chars, and must be a flat scalar.

## Agent context bundle (`context-arc`)

`arc-canteen context sync` puts the following in `~/.arc-canteen/context/`. A shallow copy is at `refs/canteen/context-arc`; its submodules are not initialised there, but most of the samples are cloned under `refs/circlefin/`.

- `docs/docs.arc.network/`: a Markdown mirror of docs.arc.io (formerly docs.arc.network). Covers the chain, App Kit (bridge, swap, send, unified-balance), `arc/references/evm-differences.md` (18-dec native USDC, 20 Gwei fee floor, SELFDESTRUCT, EIP-7708 logs), `contract-addresses`, `rpc-endpoints`, tutorials (porting contracts, ERC-8004/8183), `build/agentic-economy.md`, and sample-app pages.
- `docs/developers.circle.com/`: Circle docs, including `agent-stack/**` (Circle CLI, Agent Wallets, x402), CCTP, Gateway (nanopayments), Paymaster, Wallets, Contracts, StableFX, xReserve, CPN, and `openapi/*.yaml`.
- `docs/circlefin-skills/`: LLM-optimised SKILL.md files: `use-arc`, `use-usdc`, `use-circle-wallets`, `use-developer-controlled-wallets`, `use-user-controlled-wallets`, `use-modular-wallets`, `use-gateway`, `use-smart-contract-platform`, `bridge-stablecoin`.
- `samples/` (git submodules → circlefin): arc-commerce, arc-multichain-wallet, arc-escrow, arc-fintech, arc-p2p-payments, arc-nanopayments, arc-prediction-markets, arc-stablecoin-fx.
- `AGENTS.md` includes a "task → start with" routing table, for example: agent that holds and spends USDC → `developers.circle.com/agent-stack.md`; onchain agent identity or jobs → `build/agentic-economy.md` (ERC-8004/8183); unified balance or nanopayments → `use-gateway.md`.

## Wiring it into Claude Code / Codex

1. **One-shot prompt context:** `arc-canteen context | claude` (or `| codex`). `--full` inlines every doc and suits a stateless runtime.
2. **Persistent project context (recommended):** add a line like this to the project `CLAUDE.md` / `AGENTS.md`:
   `Arc + Circle reference docs and sample apps live in ~/.arc-canteen/context/ — read ~/.arc-canteen/context/AGENTS.md first and prefer docs/circlefin-skills/*.md as entry points.`
   Claude Code can read outside the repo if you grant the directory (for example `claude --add-dir ~/.arc-canteen/context`). Codex can be pointed at the same path.
3. **Circle Skills and MCP:** the same docs are in Circle's own skills repo (`circlefin/skills`) and the Circle MCP server (`docs/developers.circle.com/ai/mcp.md`). Circle CLI (`npm i -g @circle-fin/cli`) covers agent wallets and x402 payments. See the Circle agent-stack section of this library.
4. **Env:** put `RPC=$RPC` (from `arc-canteen rpc-url`) in `.env.local` and never commit it, because the token is in the URL.

## Arc Open Source Showcase (`submit-showcase`)

- Criteria page: https://arc-oss.thecanteenapp.com/ · Gallery: https://arc-showcase.thecanteenapp.com/ (361 projects from Agora and Lepton, 25 award winners; data at `/data.js`, saved in `.firecrawl/canteen/showcase-data.js`).
- Requirements: the code **stays open source**, it **exposes reusable primitives** (shaped like arc-commerce or arc-p2p-payments), and it is **documented clearly**. A bonus is a separate standalone, forkable infra repo (example: `Bagwork-fun/Bagwork` plus `Bagwork-fun/arc-plugins`).
- The CLI asks for: main repo (must be a GitHub URL), live site, optional standalone repo, and a pitch answering "What primitives are you exposing … compared to circlefin/arc-* what tools and flows do you add?" You must also affirm that the site stays live and the repos stay open. You can resubmit any time; the latest submission wins.
- Past award write-ups in `showcase-data.js` read like primitive inventories ("exposes X at path/file.ts"). Structure your README the same way.

## Other repos in `the-canteen-dev` (18 public, as of 2026-09-29)

| Repo | Relevance |
|---|---|
| **ARC-cli** | This CLI (Python/typer). |
| **context-arc** | The agent context bundle (docs, skills, 8 sample submodules). |
| **circle-agent** | Canteen's Arc 101 companion to `arc-nanopayments`. It has a `/hello-world` x402 paywall ($0.01), `decode-batch.ts` (decodes Gateway `submitBatch` calldata into per-buyer deltas) and `public/buyer.html` (a step-by-step trace of EIP-712 sign → facilitator → batch → onchain). **Key gotcha it documents:** x402 or Gateway payments spend your *Gateway deposited balance*, not your wallet balance. First `approve` and then `deposit` into `GatewayWallet` `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` (Arc testnet, Gateway domain 26), or you get `402 insufficient_balance`. Cloned to `refs/canteen/circle-agent`. |
| arc-node | Fork of Circle's Arc node ("The Economic OS for the internet"), which backs the Canteen RPC. |
| arc-foundry | Fork of Foundry with Arc support. |
| arc-remote-signer | Remote signing service for Arc using AWS Nitro Enclaves. Relevant if an agent needs a key it cannot exfiltrate (RFB 4/5 control story). |
| arc-fintech, arc-escrow, arc-x402-circle-wallets, arc-nanopayments, arc-multichain-wallet, arc-stablecoin-fx, arc-p2p-payments, arc-commerce, arc-ecommerce-payments, arc-defi-lend-borrow, arc-defi-lending-and-borrowing, arc-prediction-markets | Mirrors of `circlefin/arc-*` sample apps (see `context/04-sample-apps`). |

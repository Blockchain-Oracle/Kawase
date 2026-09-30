# Ghostfolio

An open-source wealth and portfolio tracker. The essay singles it out as **"the only write path that returns an idempotency signal"** (per-row `IS_DUPLICATE` plus dry run, through the same service the UI uses).

Sources: GitHub API + README; `apps/api/src/app/import/import.controller.ts`, `apps/api/src/app/endpoints/mcp/mcp.controller.ts` (main); essay landscape table.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [ghostfolio/ghostfolio](https://github.com/ghostfolio/ghostfolio) (9.4k★) |
| License | AGPL-3.0 |
| Language | TypeScript (Angular + NestJS + Prisma + Nx), Postgres + Redis |

## What it is
It tracks holdings across accounts as **activities** (`BUY`, `SELL`, `DIVIDEND`, `FEE`, `INTEREST`, `LIABILITY`) valued at market (Yahoo, CoinGecko, or manual data sources). Performance, allocation, and FIRE calculators. Quantity, unit price, and fee are **stored as floats** (essay).

## API surface an agent would call
- **Auth:** `POST /api/v1/auth/anonymous {accessToken: <security token>}` returns a JWT. Then send `Authorization: Bearer <jwt>`.
- **Import:** `POST /api/v1/import?dryRun=true|false` with body `{activities:[{currency, dataSource, date, fee, quantity, symbol, type, unitPrice, accountId?, comment?}]}`. Returns `201`, or `400 {"message":["activities.1 is a duplicate activity"]}`. Internally the import service marks each row `IS_DUPLICATE`.
- `GET /api/v1/export`, `GET /api/v1/health`, `GET /api/v1/public/<accessId>/portfolio`, admin `PATCH /api/v1/asset-profiles/<ds>/<symbol>`.
- **MCP (experimental):** set `ENABLE_FEATURE_MCP=true`, then `POST /mcp` with `Authorization: Bearer <MCP access token>` (grant an "MCP" access in *My Ghostfolio → Access*; it **never reads monetary values**, and it needs "Restricted view and manage" to import). Tools: `get-accounts`, `get-activities`, `get-portfolio`, `get-watchlist`, `search-asset-profiles`, **`import-activities`**.

## Self-host quickly
```bash
git clone https://github.com/ghostfolio/ghostfolio && cd ghostfolio
cp .env.example .env   # set ACCESS_TOKEN_SALT, JWT_SECRET_KEY, POSTGRES_*, REDIS_*; ENABLE_FEATURE_MCP=true
docker compose -f docker/docker-compose.yml up -d     # :3333
```

## Ties
- RFB 1 (treasury view: USDC, USYC, and EURC holdings with valuation). An essay exemplar for **per-row idempotency** and **dry run** (builder recommendation 5).

## Integration sketch (Arc/Circle)
- Treat the treasury as a portfolio. USYC subscriptions become `BUY` (unitPrice from the USYC Oracle), redemptions become `SELL`, and yield shows as unrealized gain or `INTEREST`. Put the txHash in `comment`.
- The agent always calls `import-activities` with a **dry run first**, shows the duplicate or new split, then imports. This makes a good demo of recommendation 5.
- Copy the design into your own tools: every write tool returns `{row, status: created|duplicate|rejected, reason}`.

## Gotchas (read the MCP tool description)
- *"An activity is skipped if an equal activity is in the portfolio already ... **two equal activities of the same call are both imported**."* Dedupe within your batch.
- *"An error does not remove the activities of the same call which are imported already, hence get the activities after an error before you import them again."* Partial success means you must read back before retrying.
- Floats for money: fine for a portfolio view, not a book of record.
- MCP is experimental, and `ROOT_URL` must match the origin for browser clients.
- AGPL-3.0.

# Firefly III (+ data-importer)

A self-hosted personal-finance manager with a full REST API, a **rules engine**, and webhooks. It is named in Euthyna as "already has the rules engine" and is also the project that **refuses LLMs outright**.

Sources: GitHub API + README (firefly-iii/firefly-iii, firefly-iii/data-importer); OpenAPI spec `firefly-iii/api-docs/dist/firefly-iii-v6.7.6-v1.yaml`; essay landscape table and "Where the Model Sits".
Verified: 2026-09-29

| | |
|---|---|
| Repo | [firefly-iii/firefly-iii](https://github.com/firefly-iii/firefly-iii) (24.8k★), [firefly-iii/data-importer](https://github.com/firefly-iii/data-importer) (839★) |
| License | AGPL-3.0 |
| Language | PHP (Laravel) |
| Tagline | "No AI, no cloud and privacy-friendly" |

## What it is
- Accounts (asset, expense, revenue, liability), transactions as journals (one negative plus one positive split), budgets, categories, tags, piggy banks, recurring transactions, and **rules** (trigger, then actions).
- Essay findings: there is no real chart of accounts, and **a rule can delete a journal** (`DeleteTransaction` action). "Calls itself double entry and lets a rule delete an entry." Bank feeds live in the separate data-importer. The FAQ says LLM categorization is *"absolutely impossible to get this to work reliably and accurately."*

## API surface an agent would call (v1, OAuth2 / Personal Access Token)
- Auth: `Authorization: Bearer <Personal Access Token>` (Profile → OAuth → Personal Access Tokens). Also `Accept: application/vnd.api+json`.
- `POST /api/v1/transactions` with body `{error_if_duplicate_hash: true, apply_rules: true, transactions: [{type: "withdrawal", date, amount, description, source_id, destination_name, external_id, external_url, notes, tags}]}`. **`error_if_duplicate_hash` means "Break if the submitted transaction exists already"**, which gives you idempotency at the ledger layer.
- `GET /api/v1/transactions`, `GET /api/v1/accounts`, `GET /api/v1/about`.
- Rules: `GET/POST /api/v1/rules`, `/api/v1/rule-groups`, `POST /api/v1/rules/{id}/test` (dry run), `POST /api/v1/rules/{id}/trigger`.
- Webhooks: `POST /api/v1/webhooks` (triggers like `STORE_TRANSACTION`), `GET /api/v1/webhooks/{id}/messages`, `POST /api/v1/webhooks/{id}/submit`.

## Self-host quickly
```bash
# docs: https://docs.firefly-iii.org/how-to/firefly-iii/installation/docker/
# download docker-compose.yml + .env + .db.env from the docs, then:
docker compose up -d        # image fireflyiii/core, plus mariadb; UI on :80 (map as needed)
# optional importer: fireflyiii/data-importer (needs a PAT + FIREFLY_III_URL)
```
There is also a public demo at demo.firefly-iii.org.

## Ties
- **Prior art 01 · Euthyna**: rules are the policy layer. RFB 1 (budgets, departmental warnings), RFB 5 (audit trail).
- The essay's recommendation "put a witness in front of every write path" is the data-importer's job.

## Integration sketch (Arc/Circle)
1. Create an asset account "Arc Operating (USDC)" with currency USDC (Firefly supports custom currencies; set decimal places to 6).
2. A chain indexer or Circle webhook handler posts each confirmed transfer with `external_id = txHash`, `external_url = https://explorer.testnet.arc.io/tx/<hash>`, and `error_if_duplicate_hash: true`, so replayed webhooks can't double-book.
3. Firefly rules tag and categorize the entry. A Firefly webhook (`STORE_TRANSACTION`) notifies the agent, which checks budgets (`/api/v1/budgets/.../limits`) and decides the next payment via Circle, with an idempotency key and the Agent Wallet spending policy as the hard cap.
4. Keep the model **outside** Firefly: it proposes categories and payments, and rules plus code apply them.

## Gotchas
- A personal-finance model, not company accounting: no chart of accounts, AR/AP, or invoices. Use it for treasury tracking and budgets, not the books of record.
- Rules can delete transactions, so avoid giving the agent write access to rules, or audit rule changes.
- USDC needs 6-decimal currency config, because the default currencies are 2 dp.
- The author is explicitly anti-AI. Don't expect upstream AI features, and keep AI in your layer.
- AGPL-3.0 applies if you modify and host it.

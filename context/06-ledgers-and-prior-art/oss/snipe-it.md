# Snipe-IT

A FOSS IT asset and **software-license** management system (who holds which laptop and which license seat). Named in Agoranomoi: "knows who holds which license."

Sources: GitHub API + README (grokability/snipe-it); API reference https://snipe-it.readme.io/reference; Tameion prior art 06.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [grokability/snipe-it](https://github.com/grokability/snipe-it) (15.0k★) |
| License | AGPL-3.0 |
| Language | PHP (Laravel), MySQL/MariaDB |
| Docker | `snipe/snipe-it` |

## What it is
Assets (hardware), **licenses** with seats (checkout to user or asset), accessories, consumables, components, users, departments, suppliers, and purchase cost, order number, and expiration and depreciation. Full audit history of checkouts. A JSON REST API with many community clients (PowerShell, Python, Perl...).

## API surface an agent would call
- Auth: **`Authorization: Bearer <personal access token>`** (Laravel Passport, created in the user menu → Manage API Keys), `Accept: application/json`.
- `GET /api/v1/licenses` (fields include `seats`, `free_seats_count`, `purchase_cost`, `expiration_date`, `supplier`, `order_number`), `GET /api/v1/licenses/{id}/seats` (who holds each seat), `PATCH /api/v1/licenses/{id}/seats/{seat_id}` (check in or out).
- `GET /api/v1/users`, `/api/v1/hardware`, `/api/v1/suppliers`, `/api/v1/reports/activity` (checkout and checkin history).

## Self-host quickly
```bash
# https://snipe-it.readme.io/docs/docker  - docker compose with snipe/snipe-it + mariadb; set APP_KEY, APP_URL, DB_*
docker compose up -d     # then web installer
```

## Ties
- **Prior art 06 · Agoranomoi** (independent metering vs the vendor's count), RFB 4 (operator buys services and should know what it consumed).

## Integration sketch (Arc/Circle)
1. The seat inventory from Snipe-IT gives *assigned* seats. Combine it with usage signals (SSO last-login, or OpenMeter events per user per tool) to get *used* seats.
2. When a vendor invoice arrives (paperless + invoice2data), the agent compares billed seats with assigned seats and used seats. It **pays the verified amount** in USDC via Circle and opens a dispute or cancellation for the delta. Unused seats past N days get proposed for check-in (human approves), and the next renewal is reduced.
3. The decision log records `{billed, assigned, used, paid, txHash}` per renewal. Expose "savings found" as a traction metric.

## Gotchas
- Snipe-IT knows **assignment, not usage**. You need a second signal (SSO logs, vendor admin APIs, OpenMeter).
- License data quality depends on humans keeping it current. The agent should flag stale records rather than trust them.
- API rate limits are configurable (`API_THROTTLE_PER_MINUTE`, default 120).
- AGPL-3.0.

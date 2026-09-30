# Kimai

An open-source, multi-user time-tracking app with a JSON API, rates, budgets, and invoicing. Named in Misthos as a source of truth for work done, which drives per-day or per-milestone contractor pay.

Sources: GitHub API + README (kimai/kimai); `src/API/TimesheetController.php`, `src/API/Authentication/ApiRequestMatcher.php` (main).
Verified: 2026-09-29

| | |
|---|---|
| Repo | [kimai/kimai](https://github.com/kimai/kimai) (5.0k★) |
| License | AGPL-3.0 |
| Language | PHP 8.2+ (Symfony), MariaDB/MySQL |
| Cloud | kimai.cloud |

## What it is
Timesheets (timer or punch-in/out), customers, projects, and activities, user/customer/project-specific **rates**, money and time **budgets**, invoicing templates, exports, teams and permissions, SAML/LDAP, 2FA, and a plugin marketplace.

## API surface an agent would call
- Auth: **`Authorization: Bearer <API token>`** (create in user profile → API access). Docs at `/api/doc` (Nelmio/OpenAPI).
- `GET /api/timesheets` filters: `user` (id or `all`), `customers[]`, `projects[]`, `activities[]`, `begin`, `end` (`YYYY-MM-DDThh:mm:ss`), **`exported=0|1`**, `active=0|1`, `billable`, `tags`, `full=true`.
- `PATCH /api/timesheets/{id}/export`: toggles the **exported** flag, the natural "paid or settled" marker.
- `PATCH /api/timesheets/{id}/meta`: set custom meta fields (store `tx_hash`, `intent_id`).
- `GET /api/projects`, `/api/customers`, `/api/activities`, `/api/users`, `/api/invoices`, `POST /api/timesheets`, `PATCH /api/timesheets/{id}/stop`.

## Self-host quickly
```bash
# Docker Hub image: kimai/kimai2 (tags :apache or :fpm)
docker run -d --name kimai-db -e MYSQL_DATABASE=kimai -e MYSQL_USER=kimai -e MYSQL_PASSWORD=kimai -e MYSQL_ROOT_PASSWORD=root mariadb:11
docker run -d --name kimai -p 8001:8001 --link kimai-db \
  -e DATABASE_URL="mysql://kimai:kimai@kimai-db/kimai?charset=utf8mb4&serverVersion=11.0.0-MariaDB" \
  -e ADMINMAIL=admin@example.com -e ADMINPASS=changeme123 kimai/kimai2:apache
```
Requires a subdomain in production (subdirectory is not supported).

## Ties
- **Prior art 05 · Misthos** ("A contractor waiting thirty days is lending the business money at zero interest"), RFB 3 (on-time payment rate, contractor network), RFB 4 (payroll as obligation).

## Integration sketch (Arc/Circle)
1. Contractor ↔ Kimai user. The approved Arc address is stored in the user's preference or meta field (change requires admin, and the agent checks history).
2. **Daily payout job:** `GET /api/timesheets?user=all&exported=0&end=<yesterday 23:59>` gives entries. Group by user, compute pay from the Kimai `rate` field (USDC minor units), and create one PaymentIntent per (user, day) with a stored idempotency key. Send via Circle Wallets (or batch through a payout contract).
3. On webhook `COMPLETE`: `PATCH /api/timesheets/{id}/meta` with `tx_hash`, then `PATCH /api/timesheets/{id}/export`. The export flag now means "paid," and re-runs skip them.
4. Budgets (money or time per project) cap payouts, and the agent escalates when a project's budget is exceeded.

## Gotchas
- Kimai's "exported" flag is also used by its invoice/export features. Use a dedicated meta field (e.g. `paid_tx`) if the team exports for other reasons.
- Timesheets can be edited after the fact, so lock them (Kimai lockdown periods) or hash the entry at payout time and store the hash.
- Rates are stored as floats in the DB. Round deterministically to 6 dp and log the rounding.
- AGPL-3.0.

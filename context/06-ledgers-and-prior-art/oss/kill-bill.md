# Kill Bill

An open-source subscription billing and payments engine (Java). The essay's model of **immutability by construction**: committed invoices can't change, and every correction is a typed adjustment.

Sources: GitHub API + README (killbill/killbill); killbill-docs repo tree; `jaxrs/.../JaxrsResource.java` (`externalPayment` query param); essay landscape table.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [killbill/killbill](https://github.com/killbill/killbill) (5.8k★), UI: killbill/killbill-admin-ui (Kaui) |
| License | Apache-2.0 |
| Language | Java (JAX-RS), MySQL/MariaDB or Postgres, OSGi plugins (Java/Ruby) |
| Docs | https://docs.killbill.io |

## What it is
Catalog (plans, phases, usage), subscriptions and entitlements, invoicing, payments via **payment plugins** (Stripe, Braintree, Adyen, ...), overdue (dunning) state machine, and push notifications. Essay: a `COMMITTED` invoice throws `INVOICE_ALREADY_COMMITTED` on change. Corrections are items of kind `ITEM_ADJ`, `CREDIT_ADJ`, `REPAIR_ADJ`. Payment state comes from gateway plugins, and there is nothing behind the invoice to match.

## API surface an agent would call
- Base `http://<host>:8080/1.0/kb/`. Auth: **Basic** (`admin:password` by default) plus tenant headers **`X-Killbill-ApiKey`**, **`X-Killbill-ApiSecret`**. Writes need **`X-Killbill-CreatedBy`** (and optional `X-Killbill-Reason`, `X-Killbill-Comment`), which gives you a free audit trail per write.
- `POST /accounts`, `GET /accounts/{id}/invoices`, `GET /invoices/{id}`, `POST /invoices/{id}/payments?externalPayment=true` (records a payment made **outside** Kill Bill, which is how you'd book an Arc settlement), `POST /accounts/{id}/payments` with `paymentExternalKey` / `transactionExternalKey` (**idempotency keys**), `POST /invoices/{id}/{itemId}/adjustment`, `POST /usages` (usage records for consumable-in-arrear).
- Push notifications: `POST /tenants/registerNotificationCallback?cb=<url>` (events like `INVOICE_CREATION`, `PAYMENT_SUCCESS`).
- Swagger at `/api.html`. Official clients exist for Java, Ruby, Python, Go, and JS.

## Self-host quickly
```bash
# docs.killbill.io -> Getting Started: docker compose with killbill/killbill, killbill/kaui, killbill/mariadb
docker compose up -d   # Kill Bill :8080, Kaui :9090 (admin/password); create tenant (api key/secret) in Kaui
```
Free hosted sandboxes are available at cloud.killbill.io.

## Ties
- RFB 4 (operator: subscriptions and usage billing), RFB 2 (AR). Prior art 06 Agoranomoi (usage records, but as the *seller's* meter). Essay: typed, immutable corrections are the pattern to copy for "make repair loud."

## Integration sketch (Arc/Circle)
- Write an **Arc USDC payment plugin**, or use `externalPayment=true`. When the customer pays USDC to your Circle wallet, the webhook handler posts the invoice payment with `transactionExternalKey = txHash`. Kill Bill rejects a duplicate external key, which gives idempotency for free.
- Outbound refunds go through Circle with an idempotency key, then a Kill Bill refund with the same external key.
- The agent reads the overdue state to drive collections (RFB 2), and uses the `X-Killbill-Reason`/`Comment` headers to carry the decision rationale into Kill Bill's audit logs.

## Gotchas
- A heavy stack (JVM plus DB plus Kaui). Allow about 2 GB RAM and some setup time. The catalog XML has a learning curve.
- No bank or chain reconciliation: the payment plugin *is* the truth, so your plugin must only report success on a witnessed `COMPLETE`.
- Multi-tenant headers are required on every call. Missing `X-Killbill-CreatedBy` on writes gives a 4xx.

# paperless-ngx

A self-hosted document management system (scan, OCR, index, archive) with a full REST API. It is the "holds the document" half of Symbolon, and the essay's positive model: **predictions stay suggestions a person confirms**.

Sources: GitHub API + README; `docs/api.md` (paperless-ngx/paperless-ngx main); essay builder recommendation 6.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) (46.1k★) |
| License | GPL-3.0 |
| Language | Python (Django) + Angular; Postgres/MariaDB/sqlite, Redis, optional Tika/Gotenberg |
| Demo | demo.paperless-ngx.com (demo/demo) |

## What it is
It ingests documents (consume folder, email, API upload), OCRs them, auto-assigns **correspondent, document type, tags, storage path** via matching algorithms or an ML classifier, and stores original plus archived PDF. It adds custom fields, workflows (triggers and actions), permissions, document versions, and full-text search. Consumption **rejects duplicates by checksum**.

## API surface an agent would call
- Auth: `Authorization: Token <token>` (get it via `POST /api/token/` with username and password, or from Django admin or the profile). Session and Basic auth also work. OpenAPI schema at `/api/schema/view/`.
- `POST /api/documents/post_document/` (multipart `document`, optional `title`, `correspondent`, `document_type`, `tags`, `created`, `custom_fields`) returns a task UUID. Poll with `GET /api/tasks/?task_id=<uuid>`.
- `GET /api/documents/?query=...` (full text), `?more_like_id=`, custom-field filtering, `GET /api/documents/{id}/` (content = OCR text), `/download/`, `/metadata/` (checksums), `/suggestions/` (the classifier's suggested correspondent, type, tags, and dates).
- `PATCH /api/documents/{id}/` (set fields after confirmation), `POST /api/documents/bulk_edit/`, `/api/correspondents/`, `/api/custom_fields/`, `/api/workflows/`.
- Document versions: `POST /api/documents/{id}/update_version/` (API v10+).

## Self-host quickly
```bash
bash -c "$(curl -L https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/install-paperless-ngx.sh)"
# or: docker compose files in /docker/compose (image ghcr.io/paperless-ngx/paperless-ngx), UI on :8000
```

## Ties
- **Prior art 03 · Symbolon** (document store), RFB 2 (invoice ingestion from email or PDF). The essay's design to copy: **"keeps the correspondent its model predicts as a suggestion that a person confirms."**

## Integration sketch (Arc/Circle)
1. Mail rule: AP inbox, then paperless consume. A workflow tags `inbox-ap` and triggers your agent (workflow webhook action, or poll `?tags__id=`).
2. The agent reads OCR content, runs invoice2data or an LLM extraction, and writes results to **custom fields in a "proposed" state** (`amount_proposed`, `invoice_no_proposed`, `vendor_proposed`). A rule or human confirms and flips them to `confirmed`.
3. On confirmation plus three-way match, pay via Circle. Write `tx_hash`, `paid_at`, and `intent_id` custom fields back to the document, so the document is the audit root. Use `GET /metadata/` checksum as `docHash`.
4. The checksum-based duplicate rejection gives a first dedupe line for "same PDF twice." A different PDF of the same invoice still needs business-key dedupe.

## Gotchas
- Its classifier is tuned for correspondents and tags, not amounts. Field extraction is your job.
- Uploads are async (task-based): wait for the task to succeed to get the document id.
- Heavy-ish stack (Redis, OCR, optional Tika/Gotenberg for Office and email). Allocate about 2 GB.
- GPL-3.0.

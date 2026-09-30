# invoice2data

A Python CLI and library that extracts structured fields from PDF invoices using regex templates (YAML or JSON), with pluggable text and OCR backends and an optional AI fallback. It is the "extract" half of the Symbolon three-way match.

Sources: GitHub API + README (invoice-x/invoice2data); docs https://invoice2data.readthedocs.io/; Tameion prior art 03.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [invoice-x/invoice2data](https://github.com/invoice-x/invoice2data) (2.2k★) |
| License | MIT |
| Language | Python |

## What it is
The pipeline: text extraction (`pdfium` by default, no system deps; also `pdftotext`, `pdfminer`, `pdfplumber`, OCR via `tesseract`, `ocrmypdf`, `docTR`, `paddleocr`, `gvision`), then **template matching** (keywords identify the issuer, and regex extracts fields) with plugins for `lines` (line items) and tables (Camelot), then output as CSV, JSON, or XML. `--new-template SAMPLE` guesses a template deterministically, and `--ai` or `--ai-fallback` use an LLM for template creation or runtime fallback.

Typical output: `{'issuer','amount','date','invoice_number','currency','desc', lines...}`.

## API surface an agent would call
- Library: `from invoice2data import extract_data; result = extract_data("invoice.pdf", templates=read_templates("tpl/"))`.
- CLI: `invoice2data --output-format json --template-folder tpl/ invoice.pdf`.
- There is no HTTP server. Wrap it in your own endpoint or MCP tool (`extract_invoice(doc_id)`).
- Odoo integration via OCA/edi (`account_invoice_import_invoice2data*`).

## Self-host quickly
```bash
pip install invoice2data            # optional extras: [ocr], [ai], [camelot]
invoice2data --output-format json invoice.pdf
```

## Ties
- **Prior art 03 · Symbolon** (extraction), RFB 2 (invoice ingestion; "Duplicate invoices caught" metric).

## Integration sketch (Arc/Circle)
1. paperless-ngx consumes the email or PDF (document store plus checksum). A webhook or workflow calls your extractor, and invoice2data produces JSON.
2. **Deterministic template first, LLM second:** a template hit gives high trust, while AI fallback results are marked `source=model` and need a match or human confirmation (essay: model output is an input).
3. The extracted `{issuer, invoice_number, amount, currency}` is matched to the PO (ERP) and receipt, checked for duplicates on `(issuer, invoice_number)`, and the payee address comes **from the vendor master, never from the PDF**. Then it pays via Circle.
4. Store `sha256(pdf)` as `docHash` in the ledger and the onchain event.

## Gotchas
- Regex templates need per-vendor authoring, and layouts drift. Monitor "no template matched" rates.
- `amount` parsing and locale (`1.234,56`) and currency detection can go wrong. Validate against line totals and tax. Convert to integer minor units before any payment.
- The AI fallback reintroduces model errors, so gate it with the match.
- Only handles invoice-shaped documents. PO and delivery-note schemas are "deferred" upstream.

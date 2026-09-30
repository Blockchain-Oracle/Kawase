# beancount (+ fava, beanquery, smart_importer, beangulp)

A plain-text double-entry ledger with balance assertions. It is the best "books an agent writes and a human reads" backend for the euthyna (continuous audit) idea.

Sources: GitHub API + READMEs for beancount/beancount, beancount/fava, beancount/beanquery, beancount/smart_importer; `fava/src/fava/json_api.py` (main); essay section "A Claim with a Tolerance".
Verified: 2026-09-29

| | |
|---|---|
| Repos | [beancount/beancount](https://github.com/beancount/beancount) (6.0k★, GPL-2.0-only), [beancount/fava](https://github.com/beancount/fava) (2.6k★, MIT), [beancount/beanquery](https://github.com/beancount/beanquery) (GPL-2.0), [beancount/smart_importer](https://github.com/beancount/smart_importer) (MIT), [beancount/beangulp](https://github.com/beancount/beangulp) (GPL-2.0) |
| Language | Python (v3 core has C++ parts) |
| Status | **v3 is current stable (since June 2024)**. v2 is frozen. Tools moved into separate repos (beanquery, beangulp, fava). |
| Author | Martin Blais, who gives the **Tameion fireside on Sep 30, 9:30 ET** |

## What it is
- A ledger is a text file of directives: `open`, `txn` (`*`), `balance`, `pad`, `note`, `document`, `price`, plus arbitrary `key: "value"` metadata on entries and postings.
- The file is **validated on load** (`bean-check ledger.beancount`). The `Balance` directive asserts an account balance with an inferred or declared **tolerance**. Precision is a property of the *claim* (essay: "A ledger written to the cent tolerates half a cent. A ledger written to six places tolerates half a millionth.").
- **fava**: web UI plus a JSON API. **beanquery**: SQL-like query language (`bean-query`). **beangulp**: importer framework. **smart_importer**: ML hooks (`PredictPostings`, `PredictPayees`) that fill in missing postings at import, trained on existing entries.

## API surface an agent would call
- **Library (best):** `from beancount import loader; entries, errors, options = loader.load_file("ledger.beancount")`. Check `errors` after every write. Append text entries, then reload.
- **CLI:** `bean-check`, `bean-query ledger.beancount "SELECT account, sum(position) GROUP BY account"`, `bean-format`.
- **Fava JSON API** (routes are `/<ledger-slug>/api/<name>`, with the HTTP method from the function prefix):
  - `PUT api/add_entries` takes a list of Transaction, Balance, or Note entries.
  - `GET api/source` returns `{file_path, sha256sum, source}`. `PUT api/source` takes `{file_path, source, sha256sum}` and uses **optimistic concurrency via sha256sum**.
  - `GET/PUT/DELETE api/source_slice` (per-entry edits by entry hash, sha256-guarded), `GET api/query?query_string=...`, `GET api/changed`, `PUT api/attach_document`, `PUT api/upload_import_file`, `GET api/extract`.
- **Auth:** Fava has **none built in**. Put it behind a reverse proxy with auth, or bind to localhost.

## Self-host quickly
```bash
pip install beancount fava beanquery beangulp smart_importer
bean-check books.beancount && fava books.beancount   # http://localhost:5000
# Docker: community image, e.g. `docker run -p 5000:5000 -v $PWD:/bean -e BEANCOUNT_FILE=/bean/books.beancount yegle/fava`
```

## Ties
- **Prior art 01 · Euthyna** ("a ledger an agent can write to and a human can read ... never connected to money that actually moves"), RFB 1 and RFB 5.
- Essay: the positive model for **declared tolerance** and **loud failure**. smart_importer is the model of "ML at the edge, assertion catches mistakes."

## Integration sketch (Arc/Circle)
```beancount
2026-10-01 open Assets:Arc:Operating  USDC
2026-10-01 open Assets:Arc:Reserve    USYC
2026-10-01 open Liabilities:AP:AcmeDesign USDC
2026-10-01 commodity USDC
  precision: 6

2026-10-03 * "Acme Design" "Invoice INV-104 milestone 2"
  intent: "pi_01J..."   idem: "f47ac10b-..."   txhash: "0xabc..."
  document: "paperless:812"   dochash: "sha256:9e1..."
  Liabilities:AP:AcmeDesign   1250.000000 USDC
  Assets:Arc:Operating       -1250.000000 USDC

2026-10-04 balance Assets:Arc:Operating  48750.000000 USDC   ; from chain balanceOf at block N
```
- An indexer reads USDC `Transfer` logs and Circle webhooks for your wallets, then appends entries. A cron writes a `balance` assertion from `balanceOf` every day or block range. `bean-check` failing is your **loud repair** alarm.
- The agent proposes entries. Code writes them only after the witness (webhook `COMPLETE` + txHash). Use the Fava sha256 guard to avoid concurrent writers clobbering each other.
- Hash the file after each append and anchor the hash on Arc for a tamper-evident audit.

## Gotchas
- v3 removed many v2 tools (bean-web, bean-report, and the ingest framework moved to beangulp). Tutorials older than 2024 may be wrong.
- The file is the database, so concurrent writers need a lock or the Fava sha256 guard. Git-commit each change for history.
- Precision is inferred from the numbers you write. Always write USDC with 6 decimals, or declare the tolerance via `inferred_tolerance_default` or the `precision` metadata.
- Fava has no auth, and GPL-2.0 applies to beancount itself (fine for a hosted service).
- smart_importer only fills **single-legged** incomplete postings. It won't fix `Expenses:TODO`.

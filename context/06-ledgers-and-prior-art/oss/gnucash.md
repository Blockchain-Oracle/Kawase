# GnuCash

A desktop double-entry accounting app (C/C++), the oldest in the essay's set. It matters for one design lesson: **the only repair a person is guaranteed to see**, the visible `Imbalance-CUR` account.

Sources: GitHub API + README (Gnucash/gnucash); essay sections "Two Numbers per Split" and "Repair".
Verified: 2026-09-29

| | |
|---|---|
| Repo | [Gnucash/gnucash](https://github.com/Gnucash/gnucash) (4.4k★) |
| License | GPL-2.0-or-later (GitHub shows NOASSERTION) |
| Language | C, C++ (Scheme for reports; optional Python bindings) |
| Stable | 5.x |

## What it is
A personal and small-business double-entry app: accounts, transactions and splits, AR/AP (customers, vendors, invoices, bills), scheduled transactions, and reports. Each split carries **`value`** (transaction currency) and **`amount`** (account commodity), so a multicurrency transaction is two ledgers at once. Commodity fraction is capped at **10^9**, so USDC's 6 decimals fit. When values don't balance, `xaccTransScrubImbalance` posts the difference to **`Imbalance-USD`** (visible in the account tree) instead of refusing.

## API surface an agent would call
- **No server, no REST, no MCP** in the codebase (essay: "None").
- Options:
  - **Python bindings** (`import gnucash`, built with `-DWITH_PYTHON=ON`): `Session`, `Book`, `Account`, `Transaction`, `Split`. Distro support varies.
  - **SQL backend** (sqlite3, MySQL, or Postgres): save the book as sqlite and read with SQL. Write via **piecash** (third-party Python library for GnuCash SQL books). Check maintenance status before relying on it.
  - **CLI:** `gnucash-cli --report run` for reports, `--quotes get` for price quotes.
  - Import formats: QIF, OFX, CSV (the import matcher is a GUI flow).

## Self-host quickly
```bash
brew install --cask gnucash       # macOS; or apt install gnucash / flatpak org.gnucash.GnuCash
# for an agent: create book, File > Save As > sqlite3; then read/write via piecash or python bindings
```

## Ties
- Essay recommendation 4, **"Make repair loud, or make it refuse"**. RFB 1 and 5 (auditable books). A design reference more than an integration target.

## Integration sketch (Arc/Circle)
- Borrow the pattern, not necessarily the app: in whatever ledger you write, create a visible **`Imbalance-USDC`** or **`Suspense`** account, and post any ledger vs chain difference there with an alert. Never post it to an expense account.
- If a user already runs GnuCash: export Arc transfers as OFX or CSV (with txHash as FITID for de-duplication on import), or write to the sqlite book via piecash after witness. The OFX FITID is the importer's native duplicate key.

## Gotchas
- Desktop-first: the file or DB lock means that writing while the GUI has the book open risks corruption.
- Python bindings are not packaged everywhere (Homebrew cask lacks them), and piecash lags GnuCash versions.
- Expect GUI-centric workflows (import matcher, reconciliation). A poor fit for a headless agent. Beancount is the easier "human-readable books" target.

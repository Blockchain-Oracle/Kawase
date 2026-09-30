# nomenklatura

OpenSanctions' entity-resolution and de-duplication framework for FollowTheMoney (FtM) data. It links entities across datasets and records human match judgements in a resolver graph. Named in Megarian Decree to "check one hop further out, to the vendor's vendor."

Sources: GitHub API + README (opensanctions/nomenklatura); http://nomenklatura.followthemoney.tech/.
Verified: 2026-09-29

| | |
|---|---|
| Repo | [opensanctions/nomenklatura](https://github.com/opensanctions/nomenklatura) (267★) |
| License | MIT |
| Language | Python |

## What it is
- **Workflow:** accept FtM entities from sources, build a blocking index, generate merge candidates (FtM compare), then have a human or rule judge them (a TUI is provided), then export merged entities.
- **`Resolver`:** a graph of **Judgements** (same, not-same, undecided) between entity ids, with connected components giving canonical ids. Transitive judgements (A≠B, B=C ⇒ A≠C) avoid redundant questions. Persisted in SQL (`NOMENKLATURA_DB_URL`).
- **Enrichment framework** (`nomenklatura/enrich`): link your entities to external sources (e.g. a yente or OpenSanctions API, company registries) and pull in their data.
- Python API: `Dataset`, `Store`, `blocker.Index`, `Resolver`.

## API surface an agent would call
It is a library and CLI (no HTTP server):
```bash
pip install nomenklatura
nomenklatura xref entities.ijson      # candidates -> nomenklatura.db
nomenklatura dedupe entities.ijson    # interactive TUI judgements
nomenklatura apply entities.ijson -o merged.ijson
```
In Python: load your vendor master as FtM `Company` and `Person` entities, `Index` them together with OpenSanctions data, score pairs, and store judgements in the `Resolver`. The agent can propose judgements, and humans confirm the uncertain ones.

## Self-host quickly
`pip install nomenklatura` (plus `followthemoney`). Use sqlite for the resolver DB, and no services are needed.

## Ties
- **Prior art 07 · Megarian Decree**, **RFB 5 ExposureMap** ("second-degree sanctions exposure across your vendor and customer network").

## Integration sketch (Arc/Circle)
1. Convert ERP data (Odoo or ERPNext suppliers, their directors or UBOs from KYB, and *their* suppliers when known, e.g. from invoices or shipping docs) into FtM entities. Include `CryptoWallet` entities for the Arc payout addresses.
2. Run `xref` against OpenSanctions data (or enrich via yente) to resolve "is this our vendor's director the sanctioned person?" The resolver keeps these decisions durable across re-runs.
3. Build the graph `your company → vendor → vendor's vendor/owner` and compute an exposure score per payee. Feed it into risk tiers (see `yente.md`) and the payment policy.
4. Model output (the name-similarity score) is an **input**. Uncertain merges go to a human queue, and confirmed judgements are logged with the reviewer.

## Gotchas
- Aimed at data engineers. The CLI is designed for small datasets, and bigger ones need the Python API and blocking tuning.
- Requires FtM-shaped data, so write the mapping from your ERP schema.
- Second-degree data (vendor's vendors) is the hard part. Where does it come from? Plan a source (invoices, KYB registries, self-declaration at onboarding).

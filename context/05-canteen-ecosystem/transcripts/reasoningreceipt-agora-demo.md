# ReasoningReceipt — on-chain reasoning oracle (Agora Agents hackathon demo)

Purpose: transcript and summary of a video relevant to Tameion builders.
Sources: https://www.youtube.com/watch?v=LjuwQcyboYc (auto-captions via yt-dlp, cleaned of VTT timing and rolling duplicates; may contain ASR errors such as "X42"/"XFOO2" = x402, "Malikite" = Malachite).
Verified: 2026-09-29

| Field | Value |
|---|---|
| Title | ReasoningReceipt — on-chain reasoning oracle (Agora Agents hackathon demo) |
| URL | https://www.youtube.com/watch?v=LjuwQcyboYc |
| Channel | VanG (Tang Minh Vu) |
| Date | 2026-05-16 |
| Duration | 1:36 |

## Summary (10 bullets)

1. Agora hackathon demo by **Tang Minh Vu**: Agora **standout** award, later **Lepton 1st place** (Keryx), and a Tameion fireside speaker on Oct 2.
2. An onchain oracle for prediction markets where every probability ships with a hashed, byte-verifiable reasoning trace.
3. Traction claimed in the demo: 4,500 receipts settled on Arc testnet, 215 distinct markets, 17 consumer wallets ("real volume, not synthetic ticks").
4. A five-agent ensemble: bull, bear and edge in parallel; a supervisor doing weighted Bayesian synthesis; a critic auditing six rigor dimensions.
5. Self-calibration: resolved markets feed a per-category Brier score back into the supervisor prompt.
6. Payment: connect a wallet, sign a Circle x402 payment, and the receipt lands on Arc under your address in under 1s for about 680 microcents of gas.
7. Verification: each node of the reasoning DAG is SHA-256 hashed and a Merkle root is anchored on Arc. A single piece of evidence can be challenged with a ~200-byte inclusion proof, and the dashboard re-hashes client-side.
8. Primitives exposed (per the showcase): ReceiptRegistryV2 Merkle audit registry, x402 v2 FastAPI/MCP paywall middleware, headless Circle wallet provisioning, and a canonical-JSON verifier.
9. Direct pattern for Tameion: a signed, append-only, Merkle-anchored **decision log** is exactly what RFB 1/4/5 and the "continuous euthyna audit" prior-art idea ask for.
10. Live at rrtrace.xyz; repo github.com/tang-vu/reasoning-receipt.

## Transcript (cleaned, auto-generated)

Reasoning receipt is an on-chain oracle for prediction markets. Every probability ships with a hashed byte verifiable trace of the reasoning behind it. 4,500 receipts settled on Arc testnet so far. 215 distinct markets. 17 consumer wallets. Real volume, not synthetic ticks. Each receipt is the output of a five-agent ensemble. Bull, bear, and edge run in parallel. A supervisor weighs them with weighted Bayesian synthesis. A critic audits six rigor dimensions. Click verify, and the dashboard re-canonicalizes and re-hashes the trace client-side. Resolved markets backfeed a per-category Brier score into the supervisor's prompt. The oracle calibrates itself against its own track record. Connect a wallet. Sign a Circle x402 payment. The receipt lands on Arc under your address in under a second for 680 microcents of gas. The structural wedge. Every node of the reasoning DAG gets its own SHA-256. A Merkle root over all of them lands on Arc inside the receipt. Challenge a single piece of evidence with a 200-byte inclusion proof. You don't have to trust the publisher. You verify the part you care about. Live

at rrtrace.xyz.

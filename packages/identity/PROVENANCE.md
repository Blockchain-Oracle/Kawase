# Provenance of the marks in `svg/`

Every file here is a first-party brand asset, unchanged. One row per file. Recording crops from the reference study are never used as production marks. Add a row before adding a file; `build.mjs` turns each file into a component for native and web.

| File | Entity | Canonical id | Source page | Direct asset | Retrieved | Usage note from the kit | sha256 |
|---|---|---|---|---|---|---|---|
| `ethereum.svg` | Ethereum | `chain:eip155:1` | https://ethereum.org/en/assets/ | https://ethereum.org/images/assets/svgs/eth-diamond-purple.svg | 2026-09-30 | ethereum.org assets page: the ETH diamond may be used to indicate Ethereum; do not alter the shape | `7320e64e211db747…` |
| `ethereum-mono.svg` | Ethereum (mono) | `chain:eip155:1` | https://ethereum.org/en/assets/ | https://ethereum.org/images/assets/svgs/eth-diamond-black.svg | 2026-09-30 | same; the kit's single-colour diamond (black) — recoloured only via currentColor at build time | `4611f65a00cff2e6…` |
| `base.svg` | Base | `chain:eip155:8453` | https://github.com/base/brand-kit | https://raw.githubusercontent.com/base/brand-kit/HEAD/logo/TheSquare/Digital/Base_square_blue.svg | 2026-09-30 | Base brand kit: The Square is the network mark; the Basemark (four squares) is the wordmark | `b4f2b487011713f9…` |
| `base-mono.svg` | Base (mono) | `chain:eip155:8453` | https://github.com/base/brand-kit | https://raw.githubusercontent.com/base/brand-kit/HEAD/logo/TheSquare/Digital/Base_square_white.svg | 2026-09-30 | same; the kit's white square | `2b29d9c645da49a7…` |
| `solana.svg` | Solana | `chain:solana:mainnet` | https://solana.com/branding | https://raw.githubusercontent.com/solana-foundation/solana-com/main/apps/web/public/src/img/branding/solanaLogoMark.svg | 2026-09-30 | Solana Foundation branding: the gradient logomark; no mono file taken (the kit's black/white marks are in its zip) | `3d3401109aa061de…` |

## Not delivered yet

| Entity | Wanted files | Tried | Note |
|---|---|---|---|
| USDC, EURC | usdc, usdc-mono, eurc, eurc-mono | — | Codex collects from Circle's brand assets (`plan/prompts/codex-brand-kits.txt`) |
| Arc | arc, arc-mono, arc-wordmark | — | Arc brand page |
| Arbitrum, Polygon, Avalanche, OP Mainnet, Unichain | `<chain>`, `<chain>-mono` | GitHub org repos (none public for these) | Foundation/company brand kits — Codex |
| Solana (mono) | solana-mono | — | inside the branding zip |
| Apple, Google | apple, apple-mono, google | — | Sign-in branding guidelines |
| Circle | circle, circle-mono | — | Circle brand page |
| Kawase | kawase, kawase-mono, kawase-wordmark | — | Original artwork, drawn in-repo (`plan/design/artwork/brand-mark.md`) |

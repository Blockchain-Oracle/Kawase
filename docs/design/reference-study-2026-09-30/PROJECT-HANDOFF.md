# Kawase / Tamion — mobile reference handoff

[Full study](README.md) · [Identity contract](08-logos-and-identity.md) · [Feature inventory](09-feature-inventory.md) · [Package context](PACKAGE-CONTEXT.json)

This is a complete local reference library derived from three user-supplied Solflare, Phantom and Fomo recordings. Read the app guides for behavior, replay the clips for motion, inspect full-size frames for small copy/logos and use the structured indexes for evidence IDs.

## Authority for this project

The destination is `/Users/abu/dev/hackathon/tamion`, whose product is **Kawase**. The approved direction is **C, Koe (声)**. Read [DESIGN.md](../../../DESIGN.md), [Abu's decisions](../../../context/08-product-research/DECISIONS-FROM-ABU.md), [the master plan](../../../plan/MASTER-PLAN.md) and [component sourcing](../../../plan/stages/02-design-system-component-sourcing.md) before translating a reference into UI work.

This copy adds a reference resource. It does not change those files, the selected direction, components, tokens, application behavior or existing developer work. References to Senryo/D2 and `senryo_treatment` in the preserved study are historical assessments of another product.

Koe's current design uses the voice orb on a dark stage, amber emphasis, low density, real tokens, a full light theme, a clearly labelled testnet layer and RTL-aware typography/layout. Typing is always available. Preserve the selected fonts and web/native component twins rather than importing another app's full visual shell or generic generated components.

**Authentication/confirmation:** D33 specifies no wallet PIN, email-code signup or alternative passkey/Apple/Google entry, one Face ID approval for the allowance, no prompt inside that allowance and Face ID above it/to raise it. DESIGN.md assigns hold-to-confirm to irreversible actions that do not pass through Face ID; payments use the Face ID button. Solflare's PIN and Senryo's trade hold are reference/source-context observations, not Kawase payment requirements. These are specification observations, not a runtime audit or claim the flows are complete.

## Useful mappings for the mobile developer

| Kawase journey | Relevant evidence | Apply the lesson while preserving Kawase |
|---|---|---|
| Account entry, auth pending and permissions | P01–P11; F01–F08; S11–S14 | Living but restrained art, provider marks, pending/cancel/error state and contextual permission education; keep D33 account/approval model |
| Recipient/contact identity | P22; F17/F18 | Real avatar and clear name/address identity, bottom search, empty/loading state; a competitor username system is not automatically the contact model |
| Receive/fund/bridge | S21–S27; F20–F28; M04/M16 | Actual chain/asset identity, correct QR/address, explicit nested back and warnings, retained entry state; follow actual Kawase chain/integration rules and current quotes |
| Money confirmation | P20; F23–F27; F41–F45 | Hierarchy for amount/asset/recipient/fees, available funds, invalid/insufficient states and keyboard-aware fields; retain Kawase's Face ID and allowance behavior |
| Activity, receipt and shareable output | F13/F14/F15/F29 | Asset/provider/person identity, precise status/data, clear timeline; receipt success must come from actual execution, with ambiguity/reconciliation kept visible |
| Sheets and navigation | M06/M09/M10/M12/M15/M16 | Entry/exit, dim versus blur, layering, parent restoration and keyboard retention; native navigation stays the approved platform pattern unless explicitly changed |
| Original artwork and onboarding story | S01–S06; M01/M05/M17/M18 | Separate layers, materials, readable marks, loops and static alternatives; adapt to Koe and its glow/color rules instead of adopting a competitor mascot or palette |

IDs above resolve to source times in [screen-index.json](screen-index.json) and [motion-index.json](motion-index.json). The [gallery](gallery.html) searches evidence, component IDs, feature IDs and identity/logo names. The [identity contract](08-logos-and-identity.md) is especially relevant: authentic BTC/USDC/chain/provider artwork stays authentic even on an amber surface. Functional search/share/back icons keep their action role.

Social usernames, follows, clans, leaderboards, prediction markets, leveraged trade controls and card benefits are recorded competitor features. This inventory does not authorize adding them to Kawase or excluding any current planned capability. Reconcile each relevant feature against the master plan and user decisions, then record the treatment for the chosen journey. The source's 18 redesign ideas are candidates from the original project, not newly approved Kawase designs.

## Two different authorities

The recordings establish what these reference sessions show. The destination project's current approved design, decisions, data and implementation determine what it should build. The user asked for transferable high-fidelity analysis, not automatic adoption of a competitor's product capabilities.

This library was originally written for **Senryo in Metropolis**. D2, Mera, Monad deposit rules, launch fiat constraints and Senryo's hold confirmation are **historical source-example context**. They do not become global rules or another project's requirements. The feature register's `senryo_treatment` labels assess that original target only. Re-evaluate those labels for your destination rather than replacing its approved direction.

The [source-context snapshots](PACKAGE-CONTEXT.json) preserve the original plan/code evidence behind cross-repository links. Those files are snapshots, not current target configuration. The 18 design opportunities are original-project proposals; the observed screens, motions, feature boundaries and identity distinctions are the reusable reference layer.

## Adaptation packet

Read the target's repository instructions, current design and user decisions. Write a target-specific handoff that identifies:

- Its approved direction and token/component authority.
- Selected full journeys and relevant feature/component/motion/identity IDs.
- Exact, adapted, additive, blocked and explicitly excluded choices.
- Target-specific account/authentication, funding, instrument, confirmation and success rules.
- Actual asset/chain/venue/provider marks and original art tasks with source provenance.
- The new evidence needed for unrecorded behavior and for real target acceptance.

Keep real entity artwork separate from functional icons, decorative art and status badges. Do not equate the Fomo blue check with a chain; keep the ZEC asset, contextual mark and 10x chip distinct. Preserve back paths, keyboard placement, retained amounts, unavailable/loading/error states and completed outcomes when adapting a journey.

## Local use and validation

The gallery and evidence are self-contained; original MP4s are needed only to regenerate footage or recheck the original source hashes. For video seeking use `tools/serve.py` on a free loopback port. Different projects should use different ports while servers run concurrently.

`validation.json` and `07-validation.md` preserve original-study checks and their limits. `PACKAGE-VALIDATION.json`, when present, validates this packaged copy. A project copy can add `COPY-VALIDATION.json`; its `COPY-MANIFEST.json` checks every unadapted file against the bundled package. Changes to the project handoff/context are declared adaptations; recording evidence should remain unchanged.

Invoke the global `$mobile-reference-study` skill to analyze new footage or copy this package to a fresh project folder. Copying the documentation does not implement screens, change a design direction, select integrations, or establish production results.

# Inspection and validation record

> **Reuse context:** This guide preserves the original Senryo example. Its D2/product decisions and existing-plan labels are historical, not rules for another app. Start with the [project handoff](PROJECT-HANDOFF.md).

[Study index](README.md) · [Machine validation](validation.json)

## Completed checks

- Source files remain unchanged. Their SHA-256 hashes were recomputed by streaming the originals and match the recorded metadata.
- Full-timeline sampling: 1,051 half-second inspection samples; systematic visual contact-sheet coverage at complementary two-second positions, with targeted intermediate inspection.
- Retained evidence: 97 selected frames, nine overview sheets, 18 silent motion clips with timestamped strips, and two dense Phantom menu strips.
- All retained selected frames are 804 × 1748; motion clips are 402 × 874. Encoded clip durations match requested excerpts within 0.12 seconds. Clips contain no audio stream.
- All 44 component entries refer to existing screen/motion IDs. Guide-local links resolve. Python tooling parses successfully; generated text files have no trailing whitespace.
- Expanded coverage: 38 identity/artwork entries and 116 feature/behavior entries, each with existing evidence references. The machine ledger includes both canonical registers. All 28 inspection crop bounds fit the retained frames; the generated identity board was visually checked.
- Reinspection corrected the Fomo token-picker badges to blue checks (not chain logos), distinguished the ZEC contextual mark from its asset/logo and leverage badge, located unresolved token discs in S27, and described Solflare's freestanding mirror/card marks more precisely.
- Privacy review: retained Google screens and connected-email frames masked; unrelated app content omitted. Local OCR found one remaining recognizable email region in an overview; its mask was corrected. The corrected overview, connected-account capture, M11 strip and M11 poster were rechecked with no recognizable email match. Visual checking confirmed the corrected account mask. OCR does not certify that every possible identifier is absent.
- In the Codex browser, verified evidence search by motion ID and component ID, modal opening/closing, native media loading, quarter-speed playback, and forward/backward stepping. Frame steps use decoded excerpt timestamps and the local server supports byte ranges for seeking.
- Expanded gallery search was checked in the browser: LG04 resolves to the USDC evidence anchors S20/S27; FT039 resolves to username validation evidence P07/P08. The identity, feature and redesign guides appear in gallery navigation.
- Final workspace status contains the new study directory only; existing application files and approved design artifacts were not edited.

## Scope of this validation

These checks validate the documentation and evidence browser. They do not establish a working app reconstruction, visual equivalence of an implementation, production funding, a real wallet transaction, KYC completion, passkey creation, saved risk settings, original asset formats, sound or haptic behavior.

Frame anchors, onset estimates and clip source-time labels are approximate. The original recordings have variable frame rate, and browser seeking can round to an adjacent decoded frame. Human gestures and data/network waits are not fixed animation constants. The detailed guides preserve these limits alongside the observed flows.

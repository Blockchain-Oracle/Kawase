# Kawase sounds — Senryo's kit

Every sound here is Senryo's (`metropolis/apps/mobile/assets/sounds`, the owner's own project), at Senryo's levels
(`src/feedback/feedback.ts` `RECORDED_VOLUME`; Senryo `feedback/constants.ts` and `@senryo/tokens` `SOUND_MIX`):

| File | Senryo source | Plays when |
|---|---|---|
| `send.wav` | `send.wav` (variant 1) | money sent (finalized) |
| `received.wav` | `deposit.wav` (variant 1) | money arrived |
| `error.wav` | `error.wav` (variant 2) | a failed action |
| `confirmed.wav` | `cues/success.wav` | a result confirmed |
| `fan-open.wav` | `cues/sheetOpen.wav` | the + fan opens |
| `voice-start.wav` | `unlock.wav` (variant 3) | voice starts listening |
| `voice-end.wav` | `cues/sheetClose.wav` | voice ends |
| `cues/scene.wav` | `scene.wav` (variant 2) | a welcome scene settles |

`cues/{tap,toggle,sheetOpen,sheetClose}.wav` are rendered from the same voice definitions as Senryo's
(`packages/ui-tokens/sound.json`, byte-identical to Senryo's files). Sounds follow the ringer switch, mix with other
audio, never play in the background, and play once per finalized outcome.

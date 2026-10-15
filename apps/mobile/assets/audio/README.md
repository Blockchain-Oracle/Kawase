# Kawase sounds

The cues come from SND's designed kits ([snd.dev](https://snd.dev), dentsu lab Tokyo; free for commercial use inside a
service, with thanks to its sound designers). `packages/ui-tokens/prepare-sounds.mjs` fetches them from SND's own
sources and writes these processed files: trimmed, faded, folded to mono, with player volumes that level the set.
`src/feedback/cue-sources.ts` is generated alongside them. The raw kits are never committed.

| Cue | Source | Plays when |
|---|---|---|
| `received` | SND02 piano `notification` (trimmed to 1.6 s) | money arrived |
| `send` | SND02 piano `transition_up` | money sent (finalized) |
| `confirmed` | SND02 piano `button` | a result confirmed |
| `error` | SND01 sine `caution` | a failed action |
| `agentStep` / `agentDone` | SND01 sine `select` / `notification` | the agent finished a step / its run |
| `sheetOpen` / `sheetClose` | SND01 sine `transition_up` / `transition_down` | the composer sheet |
| `fanOpen` | SND01 sine `swipe_01` | the + fan opens |
| `voiceStart` / `voiceEnd` | SND01 sine `toggle_on` / `toggle_off` | voice starts listening / ends |
| `scene` | SND01 sine `swipe_02` | a welcome scene settles |
| `tap` / `toggle` | SND01 sine `tap_01` / `toggle_on` | (gallery only: haptics own taps) |

Money is piano and in C major: a high C bell when it arrives, a C–E–G chord when it leaves, and a C when a result is
confirmed. The interface uses short sine transients, forgettable because they are heard the most. Sounds follow the ringer
switch, mix with other audio, never play in the background, and play once per finalized outcome. `narration/` holds the
onboarding voice.

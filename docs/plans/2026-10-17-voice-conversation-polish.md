# Kawase voice conversation polish

## Decision

The user approved a focused voice behavior pass after a real-microphone session felt good and yielded mid-sentence. Keep the existing GPT-Live and LiveKit path, cards, transaction rules, and quote delivery. Polish the words and response length, then repeat a real-microphone comparison.

## Evidence

- The isolated worker uses GPT-Live 1 with Marin. The real-microphone check cut off mid-sentence and followed the new topic.
- Synthetic turns still produced generic acknowledgements and occasional jargon. They measured roughly two seconds from the first voiced follow-up frame to the old audio stopping; this did not feel bad in the user's real test.
- A validated quote card can provide a rounded provisional voice update before the final trade card. The card keeps the exact amount. In the tested variant, the final reply did not repeat an unchanged quote.
- With the experiment on, both the voice persona and the answering agent drop the one-or-two-sentence cap on voice turns (text verbosity stays low: the spoken answer waits for the whole text). Typed chat keeps its one-or-two-sentence line.
- Generic waits ("let me check") still came from GPT-Live in some runs despite the persona line. Unresolved.
- The experimental worker had stopped greeting when a session opened. Kawase speaks first again whenever Settings → Voice "Kawase speaks first" is on (the default), and the greeting is now a friendly open question in both GPT-Live and the fallback pipeline, with or without the experiment.

## Switches

The experiment is off unless these are set. `KAWASE_VOICE_CONVERSATIONAL` is read by two processes, so set it on both or the persona and the agent's spoken answers disagree.

| Variable | Read by | Effect |
| --- | --- | --- |
| `KAWASE_VOICE_CONVERSATIONAL=1` | api and voice worker | Conversational persona; the agent's voice lines without the sentence cap |
| `KAWASE_VOICE_PROGRESSIVE=1` | voice worker | Speaks one rounded provisional quote from a finished USDC↔EURC route race before the final card |
| `KAWASE_VOICE_TRACE=1` | voice worker | Timing markers for `test/voice-e2e.ts` (decodes the microphone a second time; tests only) |
| `KAWASE_VOICE_WORKER_PORT` | voice worker | The worker's own HTTP port, so a second local worker can run beside another |

A local experiment also sets `KAWASE_VOICE_AGENT` (on the api and the worker) to a name of its own, so its sessions never reach the production worker and production sessions never reach it.

## Options considered

1. **Voice-specific language polish (chosen):** Let the answering agent vary length on voice turns, favor everyday words, and stop generic wait phrases. Keep typed chat concise and leave transaction behavior intact. Test the result with ordinary chat, a quote, and an interruption.
2. **Earlier local voice activity detection:** Could reduce audio overlap, but the real-microphone check already felt natural. Defer until real use shows a timing problem.
3. **Change the voice model:** API availability and benefit of a newer GPT-Live version are unverified. Defer until the current prompts and delivery are evaluated.

## Acceptance

In a local testnet session, opening voice should get a greeting before the person says anything, an ordinary exchange should answer directly without a stock acknowledgement, a simple explanation should avoid unexplained jargon, a provisional quote should remain accurate and not repeat in the final status, and an interruption should still yield to the latest request. Preserve the card-based transaction controls. No production deployment is part of this pass.

# Kawase voice conversation polish

## Decision

The user approved a focused voice behavior pass after a real-microphone session felt good and yielded mid-sentence. Keep the existing GPT-Live and LiveKit path, cards, transaction rules, and quote delivery. Polish the words and response length, then repeat a real-microphone comparison.

## Evidence

- The isolated worker uses GPT-Live 1 with Marin. The real-microphone check cut off mid-sentence and followed the new topic.
- Synthetic turns still produced generic acknowledgements and occasional jargon. They measured roughly two seconds from the first voiced follow-up frame to the old audio stopping; this did not feel bad in the user's real test.
- A validated quote card can provide a rounded provisional voice update before the final trade card. The card keeps the exact amount. In the tested variant, the final reply did not repeat an unchanged quote.
- The voice persona's rigid sentence cap has an experimental removal, but the underlying agent still asks for one or two sentences and low text verbosity.

## Options considered

1. **Voice-specific language polish (chosen):** Let the answering agent vary length on voice turns, favor everyday words, and stop generic wait phrases. Keep typed chat concise and leave transaction behavior intact. Test the result with ordinary chat, a quote, and an interruption.
2. **Earlier local voice activity detection:** Could reduce audio overlap, but the real-microphone check already felt natural. Defer until real use shows a timing problem.
3. **Change the voice model:** API availability and benefit of a newer GPT-Live version are unverified. Defer until the current prompts and delivery are evaluated.

## Acceptance

In a local testnet session, an ordinary exchange should answer directly without a stock acknowledgement, a simple explanation should avoid unexplained jargon, a provisional quote should remain accurate and not repeat in the final status, and an interruption should still yield to the latest request. Preserve the card-based transaction controls. No production deployment is part of this pass.

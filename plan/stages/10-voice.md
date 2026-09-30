# Stage 10: Voice

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- `apps/voice-agent` (the LiveKit worker, `llmNode` → api, cascade pipeline with per-locale STT/TTS from `config/voice.ts`, `gpt-live-1` delegation where it passed the spike).
- Mobile + web voice screen with the orb/visualizer, captions and push-to-talk; the RPC `ui.show` handlers; barge-in.
- Fixed-template money read-backs; "I've put a form on your screen"; mic permission primer + the denied → Settings path.
- Voice settings; accessibility / no-mic completion of every flow (U1).
- **Exit:** in French, by voice only until the confirm tap: "Bonjour" small talk → "envoie 20 à Alex" (unknown) → the form pops up while talking → saved → confirm sheet → signed → spoken result. The same flow works in English and Spanish; Arabic displays RTL.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)

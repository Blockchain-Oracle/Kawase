# Kawase design context

Approved direction: **Lime on Ink**, dark by default. Source of truth: `packages/ui-tokens/tokens.json`, `DESIGN.md`, `plan/design/REVAMP-PLAN.md`, and `plan/design/MOBILE-QUALITY-IMPLEMENTATION-2026-10-02.md`.

Expo 57 / React Native / Uniwind / React Native Reusables. Reuse the project's Sheet, ListRow, Composer, StoryShell, fan, dock, and orb. Space Grotesk for display, Manrope for body, JetBrains Mono for money/address metadata, with the existing script fonts and RTL support.

Keep authentic asset/provider marks, money hierarchy, reachable controls, a fixed onboarding footer, and a compact input that expands on focus or content. Respect reduced motion, safe areas, keyboard dismissal, native selection, and assistive technology. Every journey needs accurate unavailable/pending/failure states and a useful recovery action.

Verified inspiration: https://21st.dev/@zochory/components/prompt-input-dynamic-grow. Adapt its behavior through native primitives; retain Kawase tokens and native input semantics. Abu rejects AI-generated design alternatives and feature borrowing from another project.

Shared motion configuration is `packages/config/src/motion.ts`: swipe settle 260 ms, automatic panel travel 420 ms, reading dwell 4500 ms, composer 180 ms. Tune from recorded release-device comparisons.

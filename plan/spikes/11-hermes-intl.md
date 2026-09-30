# Spike 11: Hermes Intl for the 10 launch locales

Purpose: find which Intl features the React Native engine (Hermes, Expo SDK 57, RN 0.86.3, iOS simulator) supports, before i18n and money formatting depend on them.
Date: 2026-09-29
**Result: PARTIAL, with fixes applied / planned**

| Feature | Hermes | Action |
|---|---|---|
| `Intl.NumberFormat` (all 10 locales), including decimal-string input | ✅ | `formatAmount` works as written |
| `Intl.DateTimeFormat` | ✅ | — |
| `Intl.PluralRules` | ❌ `undefined` | Polyfill `@formatjs/intl-pluralrules` (+ locale data for the 10 locales) before i18next init (Stage 3) |
| `Intl.RelativeTimeFormat` | ❌ | Polyfill `@formatjs/intl-relativetimeformat` (Stage 3) |
| `NumberFormat#formatToParts` | ❌ "undefined is not a function" | **Fixed:** `packages/money` `separatorsFor` now detects separators from `format()` only |

Observed: on iOS Hermes, `ar`, `bn` and `hi` format with Latin digits by default (Node formats `bn` with Bengali digits). Parsing still accepts native digits via `toAsciiDigits`, so users can type either.

Method: a temporary probe screen rendered in the dev build, with results read from the Metro log. The probe code was removed afterwards; the template's Home screen was restored.
Gotcha found: `CI=1 expo start` disables Metro file watching; new routes need a restart with `--clear`.

# Component sourcing: 21st.dev candidates and native equivalents per surface

Purpose: for each major surface of the app, list concrete author-built candidates found on 21st.dev today (web) and the native (Expo) equivalents, so the build selects instead of hand-rolling (D19, premium-ui hard rule).

Sources:
- `21st search … --type c --json` run 2026-09-29, raw JSON per query in `.firecrawl/product/14/search/<slug>.json` (the slug is given in each section heading)
- `21st get <id> --json` import lists (code not kept): `.firecrawl/product/14/component-imports-summary.txt`
- Premium-registry probes: `.firecrawl/product/14/registry-probe.txt`; routing table `~/.claude/skills/premium-ui/references/routing-table.json`
- Native packages, npm 2026-09-29: `.firecrawl/product/14/npm-versions-2026-09-29.tsv`, `npm-native-peers.txt`, `npm-disttags-peers.txt`
- HeroUI Native component index: https://www.heroui.com/native/llms.txt (`heroui-native-llms.txt`); RNR component list: `rnr-tree.txt`; `@expo/ui` Universal: https://docs.expo.dev/versions/latest/sdk/ui/universal/
- LiveKit: `@livekit/react-native@3.0.0` package source (exports `BarVisualizer`, `useMultibandTrackVolume`, `useTrackVolume`); Agents UI https://docs.livekit.io/frontends/agents-ui/
- Voice runtime decision: `../09-voice-decision/README.md` (LiveKit)

Verified: 2026-09-29

**How to read this.** Every web candidate below is [VERIFIED] to exist, with the ID, name, author and URL exactly as the 21st API returned them. Whether each one **looks** good enough is **not** verified. Candidates were chosen from metadata; the final pick goes through `21st-ui-explore` (visual comparison) and premium-ui Phase 3. The ranking notes are [INFERENCE]. Native equivalents: versions are [VERIFIED] npm; the fit is [INFERENCE].

---

## 1. Chat thread + composer (`chat-thread`, `chat-composer`, `sidebar-chat`, `markdown`, `suggestions`, `agent-elements`, `ai-elements`, `tool-card`)

| Role | 21st candidate (id · name · author · URL) | Note |
|---|---|---|
| Shell | 12402 · Agent Chat · @serafimcloud · https://21st.dev/@serafimcloud/components/agent-chat | "Drop-in chat shell composing a scrollable message list with an input composer"; imports only react + clsx + tailwind-merge [VERIFIED imports] |
| Composer | 12399 · Input Bar · @serafimcloud · https://21st.dev/@serafimcloud/components/input-bar | "auto-resizing textarea, attachment chips … send/stop button … Self-contained port from 21st.dev Agent Elements" |
| Composer alt | 1740 · Prompt Input · @ibelick · https://21st.dev/@ibelick/components/prompt-input ; 557 · Chat Input · @Alwurts · https://21st.dev/@Alwurts/components/chat-input ; KokonutUI `ai-prompt` (`https://kokonutui.com/r/ai-prompt.json`, deps `lucide-react`, `motion`) | |
| Message | 28375 · Chat Message · @asanshay · https://21st.dev/@asanshay/components/chat-message | "renders a single AI SDK message, formatting markdown text, reasoning st[eps]…"; matches our `ai@7` parts model (`../05-voice-language-genui/generative-ui.md`) |
| Message alt | 20125 · AI Message Bubble · @elements- · https://21st.dev/@elements-/components/message-bubble | roles, avatars, timestamps, streaming |
| Streaming text | 23818 · AI Response · @educalvolpz · https://21st.dev/@educalvolpz/components/ai-response ; 1748 · Response Stream · @ibelick · https://21st.dev/@ibelick/components/response-stream ; 12398 · Markdown · @serafimcloud · https://21st.dev/@serafimcloud/components/markdown | |
| Tool call state | 19159 · Tool Invocation · @Alwurts · https://21st.dev/@Alwurts/components/tool-invocation ; 20078 · AI Tool Call · @elements- · https://21st.dev/@elements-/components/tool-call ; 23789 · AI Tool Call · @educalvolpz · https://21st.dev/@educalvolpz/components/ai-tool-call | The "working…" row before a genUI card lands |
| Reasoning | 23790 · AI Reasoning · @educalvolpz · https://21st.dev/@educalvolpz/components/ai-reasoning ; 20075 · AI Chain of Thought · @elements- | For the "Why I did this" card (L12) |
| Suggestions | 12342 · Suggestions · @serafimcloud · https://21st.dev/@serafimcloud/components/suggestions ; 20132 · AI Suggestions · @pacekit | |
| History list | 29936 · Conversation List · @arihantcodes_1f7b8c4d · https://21st.dev/@arihantcodes_1f7b8c4d/components/conversation-list | "date-grouped conversation sidebar" |

**Native:** `@assistant-ui/react-native` 0.1.44 (thread, composer, AI SDK integration, Uniwind, "same color tokens as the web kit" per `../05-voice-language-genui/generative-ui.md`). Or RNR `Textarea`/`Text` + `@shopify/flash-list` 2.3.2 + `react-native-keyboard-controller` 1.22.5. Markdown on native needs a native markdown renderer; none was evaluated here [UNKNOWN].

## 2. Voice orb / waveform (`voice-orb`, `el-orb`, `waveform`, `voice-agent`)

| 21st candidate | Tech (imports) |
|---|---|
| 7494 · Voice Powered Orb · @isaiahbjork · https://21st.dev/@isaiahbjork/components/voice-powered-orb | WebGL via `ogl` [VERIFIED imports] |
| 8602 · Orb · @ElevenLabs-crawled · https://21st.dev/@ElevenLabs-crawled/components/orb | `three`, `@react-three/fiber`, `@react-three/drei` [VERIFIED imports] |
| 20073 · Voice Dictator · @uicapsule · https://21st.dev/@uicapsule/components/voice-dictator | "WebGL dithered waveform orb" |
| 5816 · Siri Orb · @m.umairwaheedansari · https://21st.dev/@m.umairwaheedansari/components/siri-orb | |
| 1451 · AI Voice Input · @kokonutd · https://21st.dev/@kokonutd/components/ai-voice-input ; KokonutUI `ai-voice` (`motion`, `lucide-react`) | mic button + visualizer + timer |
| 18483 · Waveform · @thegridcn · https://21st.dev/@thegridcn/components/waveform ; 28201 · Audio Frequency Visualizer Card · @shadcnspace | bar visualizers |
| LiveKit **Agents UI** (a shadcn registry, not on 21st): `npx shadcn@latest registry add @agents-ui`; visualizers "Bar, Grid, Radial, Wave, Aura", `AgentControlBar`, `AgentChatTranscript` [VERIFIED docs]. React only; React Native "not listed" [VERIFIED] | Fits the LiveKit decision in `../09-voice-decision/README.md` |

**Native:** `@livekit/react-native` 3.0.0 exports `BarVisualizer`, `useMultibandTrackVolume` and `useTrackVolume` [VERIFIED package src]. These drive a native visualizer from the live track. For an orb look, draw a shader with `@shopify/react-native-skia` 2.13.1 fed by `useMultibandTrackVolume` [INFERENCE]. A DOM-component wrap of the WebGL orb works technically, but it adds webview startup cost and blocks OTA updates for that component (`21st-dev.md` §6) [VERIFIED limits].

## 3. Generative UI cards (FEATURE-INVENTORY §L)

The catalog pattern (one Zod catalog, one registry per platform) is in `../05-voice-language-genui/generative-ui.md` §4. Web registry entries are sourced from 21st. Native entries are RNR/HeroUI builds of the same design.

| Card | 21st candidates (web) | Native build |
|---|---|---|
| Swap quote (L4) | 7804 · Swap Card · @ravikatiyar162 · https://21st.dev/@ravikatiyar162/components/swap-card ; 27122 · Swap Ticket · @ssychui · https://21st.dev/@ssychui/components/swap-ticket ; 16251 · BeUI Multi-chain Swap · @starc007 · https://21st.dev/@starc007/components/be-ui-multi-chain-swap ; 7973 · Crypto Swap Card · @moazamtrade (**fetches CoinGecko itself**, so strip data fetching; values must come only from server tool output) | RNR `Card` + `Badge` + `Separator`; animated numbers with Reanimated 4.7.0 |
| Bridge route comparison (L5) | **No direct match.** "bridge route" returned flight-route maps (14040 FlightRoutes @ridemountainpig) [VERIFIED]. Compose from a selectable-card pattern: 26141 · Pricing Card · @felipemenezes098 (Popular badge → "Cheapest / Fastest" badge) or 23552 · Segmented Control · @ddoemonn for cheapest/fastest sort | RNR `RadioGroup` + `Card` |
| Confirmation sheet (L2) | 705 · Alert Dialog · @shadcn · https://21st.dev/@shadcn/components/alert-dialog ; in a bottom sheet (§8) on mobile web | Native bottom sheet + `expo-local-authentication`; **must be native** (biometric, reliability) [INFERENCE] |
| Contact picker / add contact (L3) | 11404 · Combobox · @coss.com · https://21st.dev/@coss.com/components/combobox ; 25130 · Select with Avatar · @felipemenezes098 · https://21st.dev/@felipemenezes098/components/select-08 ; 12249 · QR Code · @tom_ui · https://21st.dev/@tom_ui/components/qr-code | RNR `Select`/`Input` + `expo-camera` scan + `react-native-qrcode-svg` 6.3.26 |
| Automation editor (L7) | 2941 · Scheduler · @hari · https://21st.dev/@hari/components/scheduler ; 7316 · Scheduler · @ruixen.ui · https://21st.dev/@ruixen.ui/components/scheduler ; 24924 · Weekly Availability Checkbox Grid · @cnippet-dev ; 774 · Stepper · @originui | RNR `ToggleGroup` (weekday), `Select` (cadence), `Switch`; `@expo/ui` `Picker` for native pickers |
| Charts (L11) | 2376 · Area Chart · @reaviz · https://21st.dev/@reaviz/components/area-chart-1 ; 10104 · Area Chart · @bklitai ; 29532 · Portfolio Chart · @arihantcodes_1f7b8c4d · https://21st.dev/@arihantcodes_1f7b8c4d/components/portfolio-chart ("interactive SVG chart … value against its cost basis") | `victory-native` 42.0.1 (peer Skia ≥2.6) or `react-native-gifted-charts` 1.4.78 (SVG) |
| Balance / portfolio (L1) | 5214 · Wallet Card 2 · @beratberkayg ; 7945 · Asset Card · @ravikatiyar162 ; 21513 · Number Ticker Currency Counter · @shadcnspace ; 20459 · Number Ticker · @danielpetho | RNR `Card` + Reanimated counter |
| Receipt / tx status (L10) | 6492 · Ticket Confirmation Card · @ravikatiyar162 ; 9038 · Order Confirmation Card · @kavikatiyar | RNR `Card` |
| Status / eyebrow chips | 25393 · Status · @diceui · https://21st.dev/@diceui/components/status (pulsing dot); 1600 · Pill · @haydenbleasel | RNR `Badge`; HeroUI Native `Chip` |

## 4. Network pill toggle + testnet bar (`network-toggle`, `segmented`, `banner`, `status-pill`)

Spec from `../12-network-toggle/recommendation.md`: a top-bar pill that opens a two-option sheet, a persistent testnet bar, and eyebrows on money cards.

- Pill: 25393 · Status · @diceui (pulsing indicator + color variants); 1600 · Pill · @haydenbleasel.
- Two-option chooser: 23552 · Segmented Control · @ddoemonn · https://21st.dev/@ddoemonn/components/segmented-control ("accessible segmented control (radio group) with an animated sliding thumb").
- Testnet bar: 21206 · Banner · @diceui · https://21st.dev/@diceui/components/banner; 349 · Banner · @serafimcloud.
- The theme-toggle analogy (Abu D15): 554 · Theme Toggle · @campsite; 6609 · Theme Switcher · @ncdai.
- **Native:** RNR `Badge` + `ToggleGroup`/`Tabs`; HeroUI Native `Chip`, `Tabs`, `BottomSheet`. The testnet hue is a token (`recommendation.md` §3), so the bar is a styled `View`, which is legitimate glue.

## 5. Onboarding / tour (`onboarding`, `tour`, `stepper`)

- 26918 · Product Tour · @laziekiki · https://21st.dev/@laziekiki/components/product-tour ("spotlight onboarding walkthrough").
- 29891 · Product Tour Popover · @shadcnspace · https://21st.dev/@shadcnspace/components/product-tour-popover.
- 5587 · Onboarding Checklist · @chowlol202 · https://21st.dev/@chowlol202/components/onboarding-checklist.
- 29517 · Minimal Welcome Onboarding · @ziegfiroyt; 8364 · Onboarding · @ravikatiyar162; 29815 · Vertical Titled Stepper · @sean0205.
- **Native:** RNR has auth blocks (sign-in, sign-up, verify-email, user-menu) [VERIFIED `rnr-tree.txt`] but no tour. A native spotlight-tour library was **not researched** [UNKNOWN]. Onboarding screens compose from RNR + Reanimated.

## 6. Settings (`settings`, `settings-page`, `language`)

- 28366 · Settings Sidebar Layout · @felipemenezes098 · https://21st.dev/@felipemenezes098/components/settings-2 (desktop/web).
- 28358 · Settings Tabbed Sections · @felipemenezes098; 24937 · Vertical Settings Tabs · @cnippet-dev.
- 26523 · Notification Settings Field · @shadcnspace (title + description + switch rows: Telegram/Discord/email/push).
- 7450 · Language Selector Dropdown · @samsiavoshian2009 (flags; note flags ≠ languages, so use language names) [INFERENCE].
- **Native:** `@expo/ui` Universal `List`, `FieldGroup`, `Switch`, `Picker` (SwiftUI on iOS, Compose on Android) [VERIFIED docs], or HeroUI Native `ListGroup` + `Switch`. Native settings lists fit platform conventions better than a web design ported over [INFERENCE].

## 7. Activity feed (`activity`, `timeline`)

- 29394 · Activity Feed · @felipemenezes098 · https://21st.dev/@felipemenezes098/components/item-19 (vertical timeline).
- 2943 · Transaction List · @hari · https://21st.dev/@hari/components/transaction-list.
- 25163 · Audit Log · @corr (timestamped actor/type rows, good for the agent action log); 7710 · Order History · @kavikatiyar (step progress, good for bridge in-flight status).
- **Native:** `@shopify/flash-list` 2.3.2 + RNR rows; `SectionList` date grouping.

## 8. Toasts and bottom sheets (`toast`, `sonner`, `bottom-sheet`, `drawer`)

| | Web (21st) | Native |
|---|---|---|
| Toast | shadcn `sonner` (registry item deps `sonner`, `next-themes` [VERIFIED probe]; `sonner` 2.0.8). Styled variants: 19941/19945/19938 · Sonner Toast · @bundui; 24297 · Toast · @cnippet-dev; 19994 · Toast Notification · @framecn | `sonner-native` 0.27.0 (~1.4k★, Reanimated 4 peers) [VERIFIED]; HeroUI Native `Toast` |
| Bottom sheet | 31360 · Drawer · @wensity · https://21st.dev/@wensity/components/drawer ("drag to dismiss, snap points", built on `@base-ui/react/drawer` [VERIFIED imports]); 4485 · Drawer · @efferd (built on Vaul; `vaul` last publish 2024-12-14 [VERIFIED npm], so prefer Base UI) ; 19360 · Magnetic Drawer · @animbits | `@gorhom/bottom-sheet` 5.2.14 (~9.1k★); HeroUI Native `BottomSheet` (peer on gorhom); `@expo/ui` `BottomSheet` (native) |
| Command palette (desktop) | 31354 · Command · @wensity; 2075 · Command Palette · @rafa-porto; 31802 · Command Palette with Argument Chips · @moumensoliman ("Assign to [person]" pattern ≈ "Send [amount] to [contact]") | n/a (desktop web / PWA) |

## 9. Landing / showcase page (D20)

This is plain web, so 21st and the premium registries apply fully (premium-ui pipeline). Candidates:

- Hero: `glassmorphism-trust-hero` (https://21st.dev/r/easemize/glassmorphism-trust-hero, routing-table `bestFor: fintech, trust-led`); `prisma-hero` (Abu favorite per routing table); `section-with-mockup` (@erikx); 19056 · Financial Hero Section · @uilayout.contact; 8258 · Credit Card Hero · @ruixen.ui.
- Device frames for app screenshots: 20020 · Phone Mockups 1 · @solaceui (auto-rotating iPhone carousel); 6474 · Iphone Mockup · @lovesickfromthe6ix; 23322 · Great UI Mobile Mockup · @saurabh-2607.
- Bento/features: KokonutUI `bento-grid`, Aceternity `bento-grid`, `bento-product-features` (@kavikatiyar) [routing table].
- Story/scroll: `zoom-parallax` (@efferd, marked favorite), `story-scroll`.
- Chat/voice demo embeds: reuse the web app's own chat + orb components, the best proof of the product [INFERENCE].
- Social proof, footer, logo cloud: routing-table picks (`logo-cloud-2`, `footer-section` @efferd, `testimonials` @reapollo).
- Templates to study (not adopt): 403 · Cryptgen Marketing Template · @aceternity-templates; 764 · Qronos AI/SaaS Product Template · @monolythdev [VERIFIED search].

## 10. Other premium registries: web vs native

| Registry | Install path (probe 2026-09-29) | Sample deps | Native? |
|---|---|---|---|
| Aceternity UI | `@aceternity/<name>` → `ui.aceternity.com/registry/<name>.json` (200) | `motion`, `mini-svg-data-uri` | No. Web-only (DOM + `motion`) [VERIFIED deps]; secondary sources say no RN port [REPORTED, WebSearch] |
| Magic UI | `magicui.design/r/<name>.json` (308 → 200) | `motion` | No [VERIFIED deps; REPORTED no port] |
| KokonutUI | `kokonutui.com/r/<name>.json` (200), e.g. `ai-voice`, `ai-prompt` | `motion`, `lucide-react` | No [VERIFIED deps] |
| Motion-Primitives | `motion-primitives.com/c/<name>.json` (200 via curl; the premium-ui skill notes a CLI 429, so use the 21st mirror) | `motion` | No. `motion` (ex-Framer Motion) is a web library [REPORTED]; the RN analogues are Reanimated 4.7.0 / Moti 0.30.0 (last publish 2025-01) |
| 21st community | `21st.dev/r/<author>/<slug>?api_key=…` (403 without a key) | varies (Radix/Base UI, three, ogl, motion) | No (see `21st-dev.md` §6) |
| RN-side curated sources | RNR registry (`reactnativereusables.com/r/{nativewind,uniwind}/<name>.json`, 200); HeroUI Native; catalogs.dev | Reanimated, RN Primitives, Uniwind | **Yes**, these are the native counterparts |

## 11. Gaps
- None of the listed 21st components was installed or rendered. Visual quality, Tailwind v4 compatibility and accessibility are unverified per item. premium-ui Phase 4 requires porting Tailwind v3-isms and fixing the `whileInView` trap per component.
- The bridge route comparison has no catalog match and needs composition (or 21st AI, if enabled).
- No native tour, native markdown or native voice-orb shader was evaluated.

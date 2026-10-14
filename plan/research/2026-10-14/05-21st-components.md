# 21st.dev picks for Kawase's new surfaces (2026-10-14)

Labels: VERIFIED = seen in a live `21st search/get` response today or in repo code; REPORTED = from a prior doc, not rechecked; IDEA = my own. Nothing installed, no signups, no OpenAI calls. No injected instructions found in tool output.

## Cost and limits (VERIFIED, `21st usage`)
Abu's account is Tier paid: unlimited search and code retrieval, so every pick below costs $0 to fetch or install. 21st AI generation is off (0 credits; resets 2026-11-01), so we cannot "generate"; we pick and adapt. Without the paid key, raw `21st.dev/r/...` URLs return 403 (context/08-product-research/14-ui-and-docs/21st-dev.md section 3). Key stays in `.env` as `API_KEY_21ST`; never commit.

## What exists already
- Kawase web has installed (packages/ui-web/src/components/ui): prompt-input, suggested-actions, response-stream, bubble, order-confirmation-card, item-19 (activity feed), segmented-control, hold-to-confirm, voice-powered-orb, plus button/card/tooltip. Compositions: composer, confirm-sheet, network-chip (VERIFIED, ls). Picks are logged in plan/stages/02-design-system-component-sourcing.md:18-30.
- How twins are made (plan/spikes/08-ui-stack.md:11-27, VERIFIED): the 21st DOM component is installed with the shadcn CLI into packages/ui-web, reskinned to tokens, and used through a `.web.tsx` file; the native twin is hand-built in packages/ui-native using the 21st component as the visual spec. 21st components are web-only (docs, REPORTED in 21st-dev.md section 6).
- Web deps present: framer-motion/motion 13, radix-ui, lucide, hugeicons, cva, tailwind 4. NOT present: `@base-ui/react`, `@number-flow/react`, `gsap`, `embla-carousel-react`, `vaul`. Native deps present: Reanimated 4.5.1, gesture-handler, @gorhom/bottom-sheet 5, Skia 2.6.2 (VERIFIED, package.json).
- Native twin recipe (IDEA, general): motion/framer animation -> Reanimated `withSpring/withTiming` + layout animations; `layoutId` active pill -> an `Animated.View` translated to the measured tab x; sheets -> @gorhom/bottom-sheet; SVG charts -> Skia paths; shimmer -> Reanimated opacity or Skia gradient.

## Senryo and Mitoshi: what they used (VERIFIED, files cited)
- Senryo (metropolis/design/DIRECTIONS.md:35-52; docs/product/provenance/*.md): ~700 of 1,367 previews reviewed, 74 installed. Picks: ssychui/swap-ticket 27122 (also the trade ticket), barvian/number-flow 1444, ddoemonn/segmented-control 23552, ssychui/market-watchlist 20110, shadcn/drawer 1245, bankkroll/number-pad 3711, starc007/slide-action-button 29304 (slide-to-confirm), sean0205/vertical-titled-stepper 29815 (bridge timeline), preetsuthar17/selector-chips 1963 (chain grid), hari/transaction-list 2943 (activity), yadwinder/bottom-menu 574, ibelick/text-shimmer 1641, shadcn/skeleton 1588, serafimcloud/empty-state 1435, minhxthanh/copy-code-button 9552, haydenbleasel/pill 1600. Its map lists gaps: no faucet/deposit, order-book ladder, vault/APY card, bet slip.
- Mitoshi (crypto-world-fair/context/tempo/research-2026-09-29/21st-map.md): ~150 searches, 262 components statically checked. Strongest family: ssychui (finance, reduced-motion respected, keyboard scrubbing); second: wensity/coss Base UI ports; third: ddoemonn (a11y-first). Picks reused below: unlumen/motion-navigation-menu 21349, soralabs/dock-nav 19177, wensity/drawer 31360, wensity/command 31354, ddoemonn/command-palette 23522, ddoemonn/skeleton-swap 23557, ddoemonn/wizard-steps 23576, ssychui/candle-chart 20107, ssychui/balance-chart 30538, ssychui/trade-journal-table 27124, ddoemonn/hold-to-confirm 23527, cnippet-dev/toast 24297.
- IDEA: ssychui + ddoemonn are the most compatible with Kawase's need for calm, token-only, reduced-motion-safe parts; prefer them.

## Slots (id | author/slug | link `https://21st.dev/@<author>/components/<slug>`)
Deps column = npm imports found in the fetched source (VERIFIED, `21st get`).

### 1. Agent home / command bar
- 23594 kvnkld/ai-agent-input: chat input with attachments, model picker, slash-command skill pills. Deps: lucide only. Fits: grows, "skills" map to Kawase tools. Native: TextInput with autoGrow + horizontal chip row.
- 28303 edwinvakayil/ai-input: agent/model chips, plus-menu, settings dropdown. Deps: @base-ui/react/input, motion, react-dom (heavier; skip unless we add Base UI).
- Live thinking/tool progress: 29318 starc007/agent-activity (adaptive stream of reasoning, tool calls, searches; deps motion, plus 3 helper files), 23789 educalvolpz/ai-tool-call (collapsed while running, expands to args/result; framer-motion), 12336 serafimcloud/text-shimmer (status text, tiny). Chips: 20132 pacekit/ai-suggestions needs gsap, so prefer the already-installed suggested-actions or 26546 nexus-ui/suggestions.
- Recommend: 23594 + 29318 + 12336. Native: Reanimated opacity sweep for shimmer; collapsible row with LayoutAnimation.

### 2. Route race list
No exact component exists (IDEA: compose). Best parts:
- 20078 elements-/tool-call or 27026 laziekiki/tool-call-inspector: row with status badge (running/done) is the "venue row lights up when quote arrives" anatomy.
- 29368 rmahammad/streaming-data-rows: rows insert, resort and highlight changed cells as data streams. Deps: motion + helper `motiq`. This is the closest match to a live race with re-ranking.
- 28337 sean0205/c-radio-group-17: selectable cards (price/description) for "pick another". Badge from 6955 prebuiltui/badge-tag.
- Native twin: FlatList with Reanimated `LinearTransition` (reorder animation), logo from packages/identity, "Best" pill, press selects. Mitoshi gap note: no ladder or vault card exists either (21st-map.md).

### 3. Swap ticket
- 27122 ssychui/swap-ticket: editable amount + Max, flip seam, receive card, token-select overlay, slippage chip; CTA label = validation state. Deps: framer-motion, lucide. Used by both Senryo and Mitoshi, so proven. Native twin exists in Senryo's `features/swap/SwapCards.tsx` as a model (IDEA: read it before writing).
- Quote age: add a ring from 26542 edwinvakayil/r-progress (circular progress, deps radix-progress + motion).
- Alt: 16251 starc007/be-ui-multi-chain-swap (no description; deps motion, clsx).

### 4. Bridge / move ticket
- Chain picker: 1963 preetsuthar17/selector-chips (Senryo ChainGrid), or segmented-control 23552 for 2-3 chains.
- Steps tracker: 29815 sean0205/vertical-titled-stepper (Senryo BridgeTimeline: dots, check, spinner), 35237 kevingirelli/stepper (accessible, radix-slot + cva), 23576 ddoemonn/wizard-steps (motion only).
- Ticket body: reuse 27122 with chain badges. Native: Senryo's timeline pattern; Reanimated spinner.

### 5. Buy sheet
- Keypad: 3711 bankkroll/number-pad (currency formats; deps radix-dialog, vaul, cva; strip the dialog/vaul part), alt 22111 ziegfiroyt/auth30 (PIN keypad layout).
- Apple Pay area: 25102 felipemenezes098/payment-3 (Apple Pay + Google Pay express buttons; radix-separator only). Note: the real Apple Pay button must be Transak/MoonPay's native one (see report 2), this is just the layout.
- Amount field: 28357 cnippet-dev/v-group-13. Progress to receipt: existing order-confirmation-card (9038) plus 23576 steps.
- Sheet: 31360 wensity/drawer (Base UI) on web; native @gorhom/bottom-sheet.

### 6. Marketplace
- Filter grid: 23525 ddoemonn/filter-grid (animated grid, segmented chips with live counts; motion only). Best fit for categories.
- Page with sidebar filters and price range: 29395 mohammadshehadeh/ecommerce-04 (sticky filters, counts) as web desktop layout.
- Table: 22162 felipemenezes098/table-12 (TanStack, search + status filter) or 27325 laziekiki/advanced-data-table-filter-builder (AND/OR filters).
- Card: 22103 ziegfiroyt/automation10 ("recipe card", connected app icons, install) adapts to "service card with provider logo and price per call"; 28200 deltacomponents/product-card.
- Detail drawer: 31360 wensity/drawer; alt 11442 coss.com/drawer (nested). Native: FlatList grid + chips + gorhom sheet.

### 7. Trading terminal
- Chart: 20107 ssychui/candle-chart (deps framer-motion, keyboard-resizable, readout), 30538 ssychui/balance-chart (plain SVG, no deps, scrubbing) for P&L/sparkline. Native: Skia paths with the same data model.
- Ticket: 27122 as long/short ticket (Senryo did this) + leverage slider 31347 wensity/slider (Base UI) or 29217 ai2/slider-marks (REPORTED in Mitoshi map).
- Positions: 27124 ssychui/trade-journal-table (open position lit, outcome pill), 29368 for live updates. P&L digits: see slot 11. Mitoshi found no order book ladder on 21st.

### 8. Agent activity feed
- Already have item-19 (felipemenezes098, id 29394). Add 29318 starc007/agent-activity for the live "what the agent is doing" and 28391 nexus-ui/chain-of-thought or 29416 odysseyui/components-ai-thought-chain (collapsible steps, done/active/pending; radix-collapsible + motion).
- Receipts: 25163 corr/audit-log (event/actor/status tags, filters; heavy, needs context-menu, input, textarea) or 28483 olewandowski1/activity-3. Detail = existing order-confirmation-card.
- Status header: 36497 syeddhasnainn/agent-status (4.5 KB, uses solar-icons) or 37506 luv-jeri/agent-state (living status field, 52 KB; showpiece, heavy).

### 9. Onboarding story
- 19097 cnippet-dev/v-carousel-8 (steps + progress bar; embla), 10480 patrick-xin/onboarding-dialog (animated dots, cross-fade), 23576 wizard-steps. None is a "story" format; Senryo's six-scene story was custom (report 3). IDEA: take progress-bar-at-top mechanic from v-carousel-8, build scenes ourselves. Native: pager with Reanimated (no embla).

### 10. App shell
- Floating sidebar with animated active pill: 21517 unlumen/sidebar-001 (spring hover, active bar, collapsible; deps lucide + motion). Also used by roy-chain's rail credits (THIRD_PARTY_NOTICES.md:20).
- Mobile dock: 19177 soralabs/dock-nav (reduced-motion aware), 21349 unlumen/motion-navigation-menu (take only layoutId pill), 18014 manuarora700/floating-dock. Native: Senryo Dock.tsx pattern.
- Command palette: 23522 ddoemonn/command-palette (motion only, strong ARIA), 31354 wensity/command (Base UI), 31802 moumensoliman/command-palette (argument chips: "Send [amount] to [person]" fits Kawase).
- Drawers: 31360 wensity/drawer.

### 11. Micro-parts
- Number ticker: 1444 barvian/number-flow (`@number-flow/react`, 1.6 KB wrapper, used by Senryo), 21513 shadcnspace/number-ticker-02 (currency, same lib). Native: no NumberFlow; Owarine's Odometer is a Reanimated model (REPORTED in context file).
- Skeleton: 23557 ddoemonn/skeleton-swap (zero layout shift, aria-busy), 1588 shadcn/skeleton.
- Toast: 24297 cnippet-dev/toast (Base UI), alt 27363 sonner. Native: HeroUI-style or custom Reanimated stack.
- Hold / slide confirm: hold-to-confirm 23527 already in ui-web; slide: 29304 starc007/slide-action-button (motion only) or 24884 radiumcoders/slide-to-detonate. Native: gesture-handler Pan + Reanimated (Senryo slide-to-confirm.tsx).
- Status ring: 26542 edwinvakayil/r-progress; pulse dot 24882 edwinvakayil/status-dot.

## Caveats
- Several picks import `@base-ui/react`, `gsap`, `embla`, `@number-flow/react`; each adds web bundle weight and a new dep (all MIT-class, free; license not rechecked). Prefer motion-only picks.
- Some installs pull helper files (`@/components/ui/*-utils`) that `get` does not print; use `21st add`/shadcn to get them (REPORTED in Mitoshi map).
- Expect a reskin pass: earlier installs needed token swaps and framer-motion 13 type fixes (spike 8:27).
- Not tested: whether `21st review` handles native files (UNKNOWN).

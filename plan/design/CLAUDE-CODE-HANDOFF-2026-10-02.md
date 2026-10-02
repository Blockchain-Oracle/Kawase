# Kawase continuation handoff — 2026-10-02

Abu requested a round-off because Codex credit is nearly exhausted and explicitly asked Claude Code to continue from here. Continue implementation, not another standalone planning exercise. Every promised area stays required. Do not call the whole product complete from these repairs.

## Read first

- `plan/design/MOBILE-QUALITY-IMPLEMENTATION-2026-10-02.md`: the approved repair plan and acceptance gates.
- `plan/MASTER-PLAN.md`, `plan/design/REVAMP-PLAN.md`, `plan/COVERAGE.md`, `plan/STATUS.md`: full product scope and current evidence.
- `context/08-product-research/DECISIONS-FROM-ABU.md`, `FEATURE-INVENTORY.md`, `DESIGN.md`, `ARCHITECTURE.md`: Arc scope, approval policy, architecture and visual direction. The other project's feedback provides design principles only.
- `plan/design/voice-evaluation-2026-10-02/README.md`: actual synthesis/delegation measurements and listening samples, with explicit limitations.
- `plan/design/review-evidence/2026-10-02/repair-delivery.json`: source/build/deployment/runtime matrix.

Abu's recording: `/Users/abu/Downloads/ScreenRecording_10-02-2026 07-49-28_1.MP4`, TestFlight **1.0.0 (4)**. Retain Lime on Ink, five-panel onboarding artwork, quick-action fan, history sheet, tab transitions and orb origins. Fix execution and finish the agreed product. No physical device is connected; never convert simulator evidence into device acceptance.

## Source and delivery

Work began from clean `main` 22388c9. Commits already pushed:

- 4107252: approved implementation plan.
- 998f0b2: durable leased chat/voice turn persistence, migrations 0016/0017, authentication identity-binding guard.
- 63629f2: worker stable voice turn IDs, Stop RPC, explicit LiveKit recording disabled.
- f2b020b: native staged access retries, primary guest action, UI-thread onboarding, compact growing composer/keyboard/Stop/history search, guest Automations.
- 13b5deb: startup secure-storage recovery, locale fallback and synthetic TTS comparison/isolated Eleven v4 adapter.

The final round-off commit after 13b5deb contains audio foundation, GPT-Live fixtures, evidence and this handoff. It is **local, not pushed or deployed**, so inspect `git log -1` and `git status` before continuing. Build 5 does not contain it. No PR was requested or created.

Live deployments, all healthy when checked:

| Service | Coolify application | Deployment | Revision | Finished UTC |
|---|---|---|---|---|
| API | sx1jzpkgchqbhltagb0qquig | hdu1u4tlxh2usxah8dtoxzuu | 998f0b2 | 08:18:14 |
| Voice worker | vly0o2rxwzbhtl5gepcaynpj | vodjpq2zzd2pjllvrvrupugw | 63629f2 | 08:23:28 |
| Web | jq8rxr24rbepd17hiyakwh67 | 4twuhw0asexuqo2pfhkvdkgz | 13b5deb | 08:58:58 |

API `https://kawase-api.84.46.247.92.sslip.io`; web `https://kawase.84.46.247.92.sslip.io`.

EAS build **38a00dc0-24af-4a69-813e-c2f396258b56**, **1.0.0 (5)**, source 13b5deb, finished **09:03:56.628 UTC**. TestFlight submission **efe2a4b8-36be-432a-8399-c8f8271406ed** returned FINISHED. Apple processing/tester availability and physical-device journeys remain unverified. The build archive was uploaded before audio changes. No App Store publication was performed.

All three Coolify auto-deploy settings were temporarily disabled for ordered API-before-worker rollout and have been **restored to true**, with healthy GET verification. A push may deploy automatically: inspect watch paths and serialize builds on the memory-limited server. Read `deploy/coolify.md` and the Coolify skill. CLI context `agari-new`; local tunnel port 8001 to agari-box is currently a foreground SSH session. Config/token are private: never print them. `coolify app deployments logs` takes the **application UUID** in this installed CLI.

## What changed and what is proven

Access: sanitized stage/correlation/duration/error-category tracing; one active authentication attempt; fresh SDK session after provider/code verification; proof exchange/account-refresh/wallet retries preserve successful stages; obsolete UI completions cannot route after dismissal. API matching email cannot silently rebind a different/unbound wallet identity: negative integration check returns account_recovery_required and preserves guest data. Full recovery ceremony/devices/sessions still required. Sign-in completion never implicitly submits a payment.

Native: “Try first, sign in later” is now a real primary guest button. Guest Automations explains sign-in before fetching private account data. Onboarding tracking/settling/targets run on the UI thread; art/copy/progress share position; shared settle 260 ms, auto travel 420 ms, dwell 4.5 s. Input is compact when empty/unfocused, expands on focus/content, native multiline height cap 128; dock/keyboard clearance coordinated; Stop, partial response preservation and safe history recovery added. History search filters titles of the loaded 50 entries; full text/all-history search is not finished. Drafts are currently in-memory, not durable/account-scoped.

Local Release source 13b5deb ran on dedicated **Kawase Quality iPhone17**, iOS 26.5, UUID `5DCA6EAD-77F4-405E-8E4B-4F8DEF2C9BEA`, local 1.0.0 (1), production API, Arc Testnet. Verified: onboarding renders; auto stops on panel five; switching English→French retains panel five; primary guest action loads home in French; guest chat completes; compact composer renders. Keyboard focus/multiline/dismissal, Stop tap, history sheet, guest Automations runtime and gesture performance remain pending. Another project keeps changing Simulator focus; do not click Senryo or kill other projects' processes/simulators.

Web 13b5deb: welcome renders, guest button opens home, guest starter opens chat, capability card and response complete, Stop visible during generation. Recorded screenshot `review-evidence/2026-10-02/web-guest-chat.png`. The current capability card dumps ten rows and the model often restates them in multiple paragraphs despite existing prompt guidance; this is a remaining chat hierarchy gap, not accepted visual quality.

Conversation: DB stable turn IDs, input hashing, per-thread row locks and one live owner, 90-second renewable leases, incremental text/tool persistence. Expired claims retain identity and cannot execute again. Old turns cannot replace newer history. API handling was deployed before worker protocol v2. PostgreSQL tests cover duplicates, overlap, stale writes, continuation and lease expiry; HTTP test covers stream draining without UI consumption. Production guest greeting 200, duplicate 409, exactly one user/assistant pair retained. This is not exactly-once money acceptance. Reconnect/Stop after actual submitted payment still need checking. Actual spoken greeting/filler/truncation is not yet saved alongside canonical tool records.

## Audio/voice work in the local round-off commit

- SDK-compatible expo-audio ~57.0.5 plus required expo-asset ~57.0.18, plugins added. Expo Doctor **21/21**. iOS prebuild and pod install completed; **native rebuild/runtime not yet done** for this source.
- Independent persistent sound/haptic preferences in Settings; sounds default off, haptics on. Narration row honestly Coming; localized bundled narration after accepted voice selection is still required.
- Quiet bundled `assets/audio/confirmed.wav`, generated from synthetic SFX prompt, normalized/faded mono PCM. Decode checked (0.48 s, 44.1 kHz, nonempty); not listening/device accepted.
- Feedback called after confirmed sends/funding/setup, stable result IDs prevent card remount replay. App background cancels effects. Communication audio claim invalidates effects and waits for the preceding voice session to stop; LiveKit retry cannot race old audio shutdown. Three meaningful ownership race tests pass. Silent mode, headphones, Bluetooth and phone interruptions remain unverified.
- Ten-language synthesis: baseline 595 ms median request→first decoded audio, Eleven v4 Turbo 1,377 ms, OpenAI Marin 3,265 ms. OpenAI plugin buffers output. These are component measurements, not end-of-speech useful response or phone latency. All 30 files decode; retained English/French/Spanish samples have not been listening-accepted. Production Flash unchanged.
- v4 needs separate dialogue WebSocket protocol; isolated `src/evaluation/eleven-dialogue.ts` adapter is not production plugin integration. Needs reuse/interruption/reconnection/lifecycle tests.
- `test/gpt-live-delegation.ts`: four English synthetic fixtures, no account/tools/money execution, fixture delegation rather than backend integration. Draft/pending/failed/balance transcripts + WAVs retained. First sound 1,501 / 1,204 / 2,135 / 1,485 ms, sometimes filler. Pending softened “Do not send it again” to “I wouldn’t send it again”; this is a financial-wording concern. No candidate is production-accepted or recommended.
- Deployed worker synthetic e2e greeting/card/history passed, first sound ~6.8 s including filler. Useful-response target is not established.
- LiveKit recording/upload disabled does **not** prove provider no retention. ElevenLabs logs by default; verified account tier Starter, zero-retention entitlement unestablished. Realtime can continue logging with a warning if ZRM is ineligible. Provider retention, transcript delete/export/retention controls remain unfinished.

## Verification and safe continuation

Before round-off: API auth/proof/store/stream targeted tests 16 pass against real PostgreSQL; guest-merge 2, API-client correlation 4, catalog 5, storage queue 2 pass. Mobile/UI/API/DB/worker types and targeted lint pass. Audio ownership tests 3 pass; latest Expo Doctor 21/21. Keep supported-platform/manual acceptance separate from compilation.

Next concrete steps:

1. Inspect the local round-off commit, rebuild iOS Release with new audio modules and production API, test Settings persistence/audio ownership and keyboard/Stop/history/guest Automations. Do not re-sign app manually or use an unsigned build: stale native modules caused missing ExpoPushTokenManager, then disabled signing caused keychain startup failure. Regenerated pods plus normal Xcode Simulator signing fixed it. Source is frozen before bundling; do not edit during build.
2. Physical TestFlight 5 email/Apple/Google journeys, cancellation, wrong/expired codes, staged outages/restart recovery, originating conversation/draft/language/destination preservation. Match source/API/build in every result. Build 4 artifact returned 403; its embedded config remains unverified. Recording-window API logs had no nonce/Turnkey exchange requests: pre-exchange failure is only an inference, not established cause.
3. Fix chat hierarchy: `apps/mobile/src/chat/tool-cards.tsx` CapabilitiesCard currently shows all ten rows. Put details behind an expandable control and make guest context actionable. Existing `packages/agent/src/prompt.ts` already asks for brief plain replies and no card repetition; don't pretend adding the same prompt sentence guarantees compliance. Preserve all financial safety wording. Add durable/account-scoped draft storage and actual spoken turn records without overwriting newer canonical results.
4. Complete real phone voice comparison on Wi-Fi/mobile data in all ten languages, deeper en/fr/es. Warm useful-response median ≤1.5 s, interruption-to-silence ≤300 ms; filler excluded, tool turns separate. Reject changed amount/asset/recipient/network/approval/outcome. Measure total cost and listen before selecting production or generating onboarding narration.
5. Continue the full remaining dependency order in COVERAGE/MASTER: recovery/devices/limits/allowlists/risk → money/batch/split/QR/contacts/funding → notifications/Needs-you/editable practice rules/DBOS → portfolio/tokens/routes/bridge recovery/yield → business/x402 → memory/search/cards → trust/privacy/history/export/deletion → web voice/desktop/docs/landing/judge kit/hardening/submission. Blocked is unfinished. Revalidate provider/mainnet availability; never import the other project's feature/network scope.

Local Release command (from `apps/mobile`; private env already present): explicitly set `EXPO_PUBLIC_API_URL` to production because `.env` points at localhost:3023. Use `EXTRA_PACKAGER_ARGS='--max-workers 2' xcodebuild -jobs 4 -workspace ios/Kawase.xcworkspace -scheme Kawase -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=5DCA6EAD-77F4-405E-8E4B-4F8DEF2C9BEA' -derivedDataPath /tmp/kawase-quality-release CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=86C6ZFJ6V6 ONLY_ACTIVE_ARCH=YES`. Platform install/launch/screenshots target that exact UUID. Native UI actions use CUA and a fresh Kawase window state; another project's Senryo window must not be touched.

Private QA logs/artifacts remain in `/tmp/kawase-*`: original recording frames, deployment metadata, EAS build/submission metadata, local build log, synthesis fixtures, runtime recording `/tmp/kawase-quality-runtime-20261002.mp4`. These are supplementary local evidence and may disappear. Public-safe retained PNGs/JSON/WAVs are in plan/design. Do not copy raw provider logs, credentials, emails, OTPs, tokens or access-bearing artifact URLs into the repo or responses.

Update STATUS/COVERAGE in each implemented slice. Include source/API revision, platform, network, scenario and outcome. Keep implemented, simulator checked, physical device checked, deployed and accepted distinct. A build or screenshot never closes the promised journey.

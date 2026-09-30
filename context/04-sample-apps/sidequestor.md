# sidequestor
A Circle-authored, local-first (macOS/launchd) personal agent orchestrator: a Python triage loop watches Slack/email/GitHub/Jira/Telegram/X for changes on user-defined "quests" and dispatches a headless coding-agent CLI (Codex / Claude Code / Cursor) to take the next step, with a dollar/count spend governor, human approval queue, and an append-only per-quest decision timeline. **No payments, wallets, USDC or Arc code at all.**
Sources: https://github.com/circlefin/sidequestor, refs/circlefin/sidequestor @ 142ae7a (release 0.1.26, 2026-09-07), PyPI `sidequestor`; no official docs page (not in arc/circle llms dumps)
Verified: 2026-09-29

## 1. What it does
- `pip install sidequestor`, `sq init .`, `sq setup` (Slack user-token app via manifest; OAuth; tokens in macOS Keychain), `sq start` launches 3 launchd jobs: triage loop, heartbeat/health monitor, local dashboard (README.md "How do I install it?").
- User creates a **quest** = folder `state/quests/active/<quest-id>/` with 4 files (`meta.json` policy incl. `allow_send`, `watch.json` tripwires, `context.md` mission brief, `timeline.ndjson` history) (`src/sidequestor/runtime/yaas-triage/skills/yaas-quest-creation/SKILL.md:8`, `:87`).
- Each **tick** (`runtime/yaas-triage/tick.py`) runs per-type checkers (slack_thread, email, github_pr, jira, schedule/cron, x_*, telegram_*, approval), classifies each watch (dirty/clean/hold/backoff/skip/misconfig), gates on budget + Slack health, then dispatches ONE paid agent run per dirty quest.
- The worker agent acts (reply, draft, create approval, add watches) and must **ack each dispatched item** (`handled|nothing_to_do|blocked`); only acked watermarks advance (evidence-based commit).
- Outbound sends require quest `allow_send: true` or a **human-reviewed, claimed approval** from the dashboard queue; dispatched sends need an `idempotency_key`.
- Slack reactions (emoji) trigger one-off "process/draft/save/adopt" jobs without a quest.

## 2. RFB fit
- No Circle product usage; not a payments app. Value is **architecture patterns for RFB4 (Autonomous Business Operator)**: budget governor, human-approval state machine, decision/audit log, escalation, idempotent side effects, evidence-based "did the agent actually do it" ledger.
- Secondary: RFB2 (AP/AR) and RFB5 (continuous monitoring) — the watch/checker/watermark loop is exactly "continuously monitor counterparties/invoices and act only on new activity".
- Missing for any RFB: wallets, USDC, on-chain limits, x402, any Circle API. The "budget" is **LLM spend** (USD from agent CLI `total_cost_usd`), enforced off-chain in Python, not on-chain.

## 3. Tech stack + versions
- Python `>=3.11`, setuptools `>=77`, **zero runtime deps** (`pyproject.toml` `dependencies = []`); optional `telegram = ["Telethon>=1.44,<2"]`. Version 0.1.26.
- Entry points: `sidequestor`, `sq`, `yaas` -> `sidequestor.cli:main` (pyproject.toml).
- macOS-only: launchd plists (`runtime/yaas-triage/setup/com.yaas.*.plist.template`), Keychain via `security` + a C helper (`runtime/yaas-triage/surfaces/keychain-helper.c`). CLI deps: `jq`, `curl`, `openssl`, `security`, `open`.
- Agent backends (external CLIs, must be pre-authenticated): `codex` (default), `claude`, `cursor-agent`.
- Dashboard: stdlib HTTP server `runtime/yaas-triage/ops/dashboard-server.py` (2287 lines) + single `runtime/dashboard.html`.
- Tests: `python -m unittest discover -s tests -p 'test_*.py'` (~35 test files).

## 4. Architecture
- `refs/circlefin/sidequestor/src/sidequestor/cli.py` — `sq` command surface (init/setup/start/stop/tick/watch/doctor/dashboard/upgrade/x-auth/telegram-auth).
- `refs/circlefin/sidequestor/src/sidequestor/launchd.py`, `setup.py`, `workspace.py`, `upgrade.py` — install/lifecycle.
- `refs/circlefin/sidequestor/src/sidequestor/runtime/yaas-triage/triage-loop.sh` — KeepAlive loop driving `tick.py` (avoids broken launchd StartInterval on macOS 26).
- `.../yaas-triage/tick.py` (1838 lines) — orchestrator: `check_quest` :326, budget gate :855/`budget_exceeded` :1020, dispatch loop :1100-1150, `dispatch_one` :1172, `commit_quest` :1599, `main` :1767.
- `.../yaas-triage/tick_state.py` — config/env knob loading (pure). `tick_check.py` — six-verdict classifier (pure). `tick_dispatch.py` — Slack gate + `slice_plan` time-budget/fan-out planner (pure).
- `.../yaas-triage/dispatch/` — `dispatch-agent.sh` (backend launcher), `run-agent.py` (watchdog, tee ndjson, transcript), `extract-tokens.py` (cost capture), `spend-window.py` (rolling spend caps), `plan.py` (fair rotation + per-target circuit breaker), `worker.mcp.json` (Slack/Coda/Atlassian MCP).
- `.../yaas-triage/ledger/` — `ack-watch.py` (dispatch manifest + worker acks), `commit.py` (pure commit predicate), `approval-helper.py` (approval queue CLI), `watch-guard.py` (append-only enforcement by outcome), `add-watch.py`, `checker-health.py`, `housekeep.py`.
- `.../yaas-triage/approval_state.py` — pure approval state machine; `approval_store.py` — flock'd JSON store `state/pending-approvals.json`.
- `.../yaas-triage/surfaces/` — side-effect tools the agent calls: `slack-send.py`, `x-send.py`, `telegram-send.py`, `log-event.py` (timeline), `mcp-call.sh`, credential stores.
- `.../yaas-triage/checkers/*.py` + `*.watch.json` (schema per watch type) + `*.lag` (watermark lag).
- `.../yaas-triage/skills/*/SKILL.md` — worker instructions (quest-dispatch, quest-creation, answering-quality, reactions, ops, gmail-reply, checker-authoring); `package_data/OPERATING.md` — worker operating manual.
- `.../yaas-triage/ops/` — `dashboard-server.py`, `health-monitor.py`, `notify.py`, `doctor.sh`, `rotate-logs.py`.
- Runtime state (per workspace): `state/quests/{active,completed,archived}/`, `state/pending-approvals.json`, `state/triage/dispatch-<run_id>.json`, `logs/run-log.ndjson`.

## 5. Circle products/SDKs used
| product | package/API | where | what |
|---|---|---|---|
| none | — | — | Grep for circle/usdc/wallet/payment/x402 finds only copyright headers and an example slug `correct-eurc-usdc-mechanism` (`skills/yaas-quest-creation/SKILL.md:96`). |

Other integrations: Slack MCP `https://mcp.slack.com/mcp` + Coda + Atlassian MCP (`dispatch/worker.mcp.json`), Gmail via `gws` CLI, GitHub, Jira REST, Telegram MTProto (Telethon), X OAuth2 PKCE.

## 6. Env vars (names only; workspace `.env`, template `src/sidequestor/package_data/env.example`)
- Agent: `SIDEQUESTOR_AGENT`, `SIDEQUESTOR_CLAUDE_MODEL`, `SIDEQUESTOR_CLAUDE_EFFORT`, `SIDEQUESTOR_CLAUDE_PERMISSION_MODE`, `SIDEQUESTOR_CLAUDE_DEBUG`, `SIDEQUESTOR_CODEX_MODEL`, `SIDEQUESTOR_CODEX_EFFORT`, `SIDEQUESTOR_CODEX_PERMISSION_MODE`, `SIDEQUESTOR_CURSOR_MODEL`.
- Spend/throughput governor: `SIDEQUESTOR_MAX_DISPATCH_FANOUT`, `SIDEQUESTOR_MAX_TARGET_DISPATCH_PER_HOUR`, `SIDEQUESTOR_MIN_DISPATCH_SLICE`, `SIDEQUESTOR_TICK_DISPATCH_BUDGET`, `SIDEQUESTOR_WORKER_TIMEOUT`, `SIDEQUESTOR_TRIAGE_INTERVAL`, `SIDEQUESTOR_TRIAGE_MAX_PARALLEL`; code also reads legacy `YAAS_MAX_SPEND_1H` (default 40), `YAAS_MAX_SPEND_24H` (250), `YAAS_MAX_DISPATCH_6H` (250) (`tick.py:1022-1024`).
- Approvals/health: `SIDEQUESTOR_APPROVAL_LEASE_MIN` (45), `SIDEQUESTOR_HEALTH_*`, `SIDEQUESTOR_STALE_REPLY_HOURS`, `SIDEQUESTOR_UNACKED_PROMOTE`, `SIDEQUESTOR_CHECKER_ERROR_PROMOTE`.
- Connectors: `SIDEQUESTOR_CHECKER_CONNECTORS`, `SIDEQUESTOR_SLACK_CHECKERS_ENABLED`, `SLACK_APP_ID`, `SLACK_CLIENT_ID`, `SLACK_WORKSPACE_DOMAIN`, `SLACK_WORKSPACE_NAME`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `CODA_API_KEY`, `CODA_MCP_PATH`, `SIDEQUESTOR_FROM_EMAIL`, `SIDEQUESTOR_REACTION_*_EMOJI`.
- Paths: `SIDEQUESTOR_WORKSPACE` (legacy `YAAS_WORKSPACE`), `SIDEQUESTOR_IDE_APP`, `SIDEQUESTOR_PYTHON`.

## 7. How to run
```bash
python3 -m venv .venv && source .venv/bin/activate
python -m pip install sidequestor
sq init .
sq setup --manifest > slack-app-manifest.yaml   # paste at api.slack.com
sq setup                                         # OAuth; choose bypassPermissions for unattended Codex
sq start                                         # prints dashboard URL
sq tick --dry-run                                # detect without dispatching
sq tick --isolated --fake-worker                 # safe ack without a paid agent
```
Prereq: macOS, an authenticated `codex`/`claude`/`cursor-agent` CLI, Slack workspace admin approval for user scopes.

## 8. Smart contracts
None.

## 9. AI/LLM usage
- Provider: whatever agent CLI is chosen. Launcher `refs/circlefin/sidequestor/src/sidequestor/runtime/yaas-triage/dispatch/dispatch-agent.sh`:
  - Claude: `claude --model ${YAAS_CLAUDE_MODEL:-opus} --permission-mode ... --mcp-config worker.mcp.json --strict-mcp-config --tools "Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch" --output-format stream-json -p "$PROMPT"` (:81-107).
  - Codex (default): `codex exec --json` with `-s workspace-write -c approval_policy=never` or `--dangerously-bypass-approvals-and-sandbox` (:109-149); default model `gpt-5.6-luna` at `high` effort (README).
  - Cursor: `cursor-agent -p --output-format stream-json --approve-mcps` (:151-158).
- Prompt: built in `tick.py` — startup instruction `_dispatch_read_instructions` (:1045-1048: "read .yaas/engine/current/OPERATING.md, then load skills/<skill>/SKILL.md") + `_RUN_DISCIPLINE` (:1040-1042: "ACT SILENTLY... emit summary ONLY if something material happened"); per-quest `context.md`; skills in `runtime/yaas-triage/skills/`.
- What the AI decides: how to respond to new activity on a quest (reply/draft/escalate via approval/add watches/log/nothing), and which items to ack. The **orchestrator (not the AI)** decides whether to spend (dirty detection, budget, breaker, fan-out), and whether sends are authorized.
- **Cost tracking**: `dispatch/extract-tokens.py:50-72` reads the final `{"type":"result"}` event of the stream-json, writes `gate_dispatch_tokens` event `{ts, targets, input, output, cache_write, cache_read, cost_usd: result.total_cost_usd, wall_sec, exit}` to `run-log.ndjson`. Only Claude reports `total_cost_usd`; Codex/Cursor produce `uncosted` dispatches, hence the count cap (`spend-window.py:41-48`).

## 10. Reusable for a hackathon entry (RFB4 agent that logs decisions and respects budgets)
- **Rolling spend governor**: lift `dispatch/spend-window.py:91-176` — reads an NDJSON event log, sums `cost_usd` over 1h/6h/24h windows, returns `breach` string for the tightest cap crossed. Swap `cost_usd` for USDC paid (x402/nanopayments) and you have an off-chain pre-spend budget check; call it before each payment exactly like `budget_exceeded` (`tick.py:1020-1037`), which logs `gate_budget_exceeded` and withholds the action. Note it **fails open** (`tick.py:1026-1027`) — flip to fail-closed for money.
- **Per-target circuit breaker**: `plan.py breaker-open` + `tick.py:1125-1138` — cap actions per counterparty/vendor per hour (`YAAS_MAX_TARGET_DISPATCH_PER_HOUR`=25). Direct analog to per-vendor payment limits (RFB4/RFB5).
- **Human approval state machine**: `approval_state.py` `TRANSITIONS` (pending_review -> reviewed -> executing -> executed; needs_reply, cancel, undo, reclaim, 45-min lease). Worker can only `start` from `reviewed` (structural human gate, comment above `("reviewed","start")`). Reuse for "payment over limit -> escalate to human -> approve -> agent executes once".
- **Target-bound approval + policy check before side effect**: `surfaces/slack-send.py:333-337` — send allowed iff quest `allow_send` OR a claimed approval matching the exact target coordinates. Same pattern: pay allowed iff under autonomous limit OR claimed approval for that exact (payee, amount).
- **Idempotency ledger**: `surfaces/x-send.py:247-270` — `idempotency_key` required for dispatched actions (:115-116), stored in `state/x-idempotency.json`, rejects key reuse for a different action; interrupted attempts are held, not retried. Use for payment dedupe.
- **Decision log with trusted timestamps**: `surfaces/log-event.py` — agent appends `{quest_id, event, note, reason, ...}` to `timeline.ndjson`; `ts` always stamped server-side because "an LLM worker has no clock". Event vocabulary: `message_sent, draft_posted, executed, info_received, status_change, note, blocked`. Add `payment_proposed / payment_executed / escalated`.
- **Evidence-based completion**: `ledger/ack-watch.py` + `ledger/commit.py` — orchestrator opens a manifest of what the agent must handle; agent acks each item; only acked items advance. Prevents "agent exited 0 but silently skipped invoice #3".
- **Pure/impure split**: tick_check/tick_dispatch/commit/plan are pure and unit-tested — a good template for a judge-friendly "policy engine" module.
- **Append-only enforcement by outcome**: `ledger/watch-guard.py` snapshot/verify/restore — verify the agent didn't mutate records it may only append to.

## 11. Limitations / gotchas
- macOS + launchd + Keychain only; won't run on Linux/Vercel without rework.
- Not a payments system; zero Circle/Arc code. "Budget" = LLM USD from Claude's `total_cost_usd`; Codex/Cursor report no cost (count cap only).
- Budget gate **fails open** on unreadable run log (`tick.py:1026`, `spend-window.py:53-55`) — unacceptable for money.
- `--dangerously-bypass-approvals-and-sandbox` / `bypassPermissions` recommended for unattended use — the agent has full shell/network in the workspace.
- State is flock'd JSON/NDJSON files on disk, single machine; no DB, no multi-user.
- Hardcoded Slack OAuth clientId in `dispatch/worker.mcp.json` (Circle's public MCP client) and `/opt/homebrew/bin` PATH assumption (`dispatch-agent.sh:78`).
- Internal lineage leaks ("yaas", "yaas-v2", internal Slack channel id comment in `tick_state.py:51`).
- Very large files (tick.py 1838 lines, dashboard-server.py 2287) — lift the small pure helpers, not the orchestrator.

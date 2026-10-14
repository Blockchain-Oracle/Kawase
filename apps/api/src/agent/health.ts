// Is the agent's model reachable? (D10) One tiny tool call to the chat model when the api starts and every 10 minutes
// (selfTestModel in @kawase/agent). While it fails, /agent/chat answers a typed "agent_offline" at once, so the app
// shows its designed offline state instead of a turn that breaks halfway; /agent/health tells the app before the person
// types. The status is shared by everyone, so only the self-test sets it: a chat turn that fails on the provider does
// not take the agent offline by itself (one person's large turn hitting a TPM 429, or a single 502, says nothing about
// the next turn) but asks for a confirming check at once, and the check decides. While offline the next check comes
// within a minute, and the app's "Check again" runs one too (at most one every few seconds for the whole api).
import type { AgentHealth } from "@kawase/api-client";
import { selfTestModel, type Models, type SelfTestResult } from "@kawase/agent";
import type { Logger } from "@kawase/log";

/** How often the model is checked (D10: every 10 minutes). */
export const MODEL_CHECK_MS = 600_000;
/** After a failure, check again sooner, so a key fixed in Coolify brings the agent back within a minute. */
export const RETRY_OFFLINE_MS = 60_000;
/** Checks asked for by a failed turn or by "Check again" run at most this often, for the whole api. */
export const MIN_CHECK_GAP_MS = 15_000;

export type ModelHealth = {
  /** The latest result; "unknown" before the first check finishes. */
  status(): AgentHealth;
  /** Runs one check now (start-up, the timer, and tests); shares a check already running. */
  check(): Promise<AgentHealth>;
  /**
   * The app's "Check again": while the agent is not online, runs a check unless one started under MIN_CHECK_GAP_MS ago
   * (then shares it, or answers the latest result). Online, it answers the latest result without a call.
   */
  recheck(): Promise<AgentHealth>;
  /** A live turn just failed on the provider: confirm with a check now (or as soon as the gap allows); it decides. */
  reportFailure(reason: string): void;
  /** Starts the start-up check and the timer (10 minutes online, 1 minute offline); returns a stop function. */
  start(): () => void;
};

export function createModelHealth(input: {
  models: Pick<Models, "forRole" | "hasKeyFor">;
  /** "openai:gpt-5.6-luna": what is checked, for the logs and the app. */
  modelId: string;
  log: Logger;
  /** Injected in tests (a failing key, a passing model); the real self-test otherwise. */
  selfTest?: (() => Promise<SelfTestResult>) | undefined;
  intervalMs?: number | undefined;
  retryOfflineMs?: number | undefined;
  minCheckGapMs?: number | undefined;
  now?: (() => Date) | undefined;
}): ModelHealth {
  const now = input.now ?? (() => new Date());
  const selfTest = input.selfTest ?? (() => selfTestModel(input.models));
  const intervalMs = input.intervalMs ?? MODEL_CHECK_MS;
  const retryOfflineMs = input.retryOfflineMs ?? RETRY_OFFLINE_MS;
  const minGapMs = input.minCheckGapMs ?? MIN_CHECK_GAP_MS;
  let current: AgentHealth = { status: "unknown", checkedAt: null, model: input.modelId, reason: null };
  let running: Promise<AgentHealth> | null = null;
  /** When the latest check started (monotonic wall clock, not the injected `now`), for the gap between asked-for checks. */
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  // The timer, reachable by every check: whatever ran a check, the next one is timed from its result.
  let started = false;
  let timer: NodeJS.Timeout | undefined;
  let confirmTimer: NodeJS.Timeout | undefined;

  const schedule = () => {
    if (!started) return;
    clearTimeout(timer);
    timer = setTimeout(() => void check().catch(() => undefined), current.status === "offline" ? retryOfflineMs : intervalMs);
    timer.unref();
  };

  const check = (): Promise<AgentHealth> => {
    // One check at a time: a slow provider never piles up calls.
    if (running) return running;
    lastStartedAt = Date.now();
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
    running = selfTest()
      .catch((error: unknown): SelfTestResult => ({ ok: false, ms: 0, reason: error instanceof Error ? error.message : "self_test_failed" }))
      .then((result) => {
        current = { status: result.ok ? "online" : "offline", checkedAt: now().toISOString(), model: input.modelId, reason: result.ok ? null : result.reason };
        if (result.ok) input.log.info({ model: input.modelId, ms: result.ms }, "agent model online");
        else input.log.warn({ model: input.modelId, ms: result.ms, reason: result.reason }, "agent model offline");
        return current;
      })
      .finally(() => {
        running = null;
        schedule();
      });
    return running;
  };

  /** Milliseconds until an asked-for check may run (0: now). */
  const wait = () => Math.max(0, lastStartedAt + minGapMs - Date.now());

  return {
    status: () => current,
    check,
    async recheck() {
      if (current.status === "online") return current;
      if (running) return running;
      return wait() === 0 ? check() : current;
    },
    reportFailure(reason) {
      input.log.warn({ model: input.modelId, reason }, "agent turn failed on the provider; confirming with a check");
      if (running || confirmTimer) return;
      const delay = wait();
      if (delay === 0) {
        void check().catch(() => undefined);
        return;
      }
      confirmTimer = setTimeout(() => {
        confirmTimer = undefined;
        void check().catch(() => undefined);
      }, delay);
      confirmTimer.unref();
    },
    start() {
      started = true;
      void check().catch(() => undefined);
      return () => {
        started = false;
        clearTimeout(timer);
        clearTimeout(confirmTimer);
        confirmTimer = undefined;
      };
    },
  };
}

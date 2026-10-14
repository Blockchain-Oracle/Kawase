// Is the agent's model reachable? (D10) One tiny tool call to the chat model when the api starts and every 10 minutes
// (selfTestModel in @kawase/agent). While it fails, /agent/chat answers a typed "agent_offline" at once, so the app
// shows its designed offline state instead of a turn that breaks halfway; /agent/health tells the app before the person
// types. A chat turn that fails on the provider marks it offline too, and the next check brings it back.
import type { AgentHealth } from "@kawase/api-client";
import { selfTestModel, type Models, type SelfTestResult } from "@kawase/agent";
import type { Logger } from "@kawase/log";

/** How often the model is checked (D10: every 10 minutes). */
export const MODEL_CHECK_MS = 600_000;
/** After a failure, check again sooner, so a key fixed in Coolify brings the agent back within a minute. */
const RETRY_OFFLINE_MS = 60_000;

export type ModelHealth = {
  /** The latest result; "unknown" before the first check finishes. */
  status(): AgentHealth;
  /** Runs one check now (start-up, the timer, and tests). */
  check(): Promise<AgentHealth>;
  /** A live turn just failed on the provider: offline until the next check passes. */
  reportFailure(reason: string): void;
  /** Starts the start-up check and the 10-minute timer; returns a stop function. */
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
  now?: (() => Date) | undefined;
}): ModelHealth {
  const now = input.now ?? (() => new Date());
  const selfTest = input.selfTest ?? (() => selfTestModel(input.models));
  let current: AgentHealth = { status: "unknown", checkedAt: null, model: input.modelId, reason: null };
  let running: Promise<AgentHealth> | null = null;

  const check = () => {
    // One check at a time: a slow provider never piles up calls.
    running ??= selfTest()
      .then((result) => {
        current = { status: result.ok ? "online" : "offline", checkedAt: now().toISOString(), model: input.modelId, reason: result.ok ? null : result.reason };
        if (result.ok) input.log.info({ model: input.modelId, ms: result.ms }, "agent model online");
        else input.log.warn({ model: input.modelId, ms: result.ms, reason: result.reason }, "agent model offline");
        return current;
      })
      .finally(() => {
        running = null;
      });
    return running;
  };

  return {
    status: () => current,
    check,
    reportFailure(reason) {
      current = { status: "offline", checkedAt: now().toISOString(), model: input.modelId, reason };
    },
    start() {
      let timer: NodeJS.Timeout | undefined;
      let stopped = false;
      const schedule = () => {
        if (stopped) return;
        timer = setTimeout(
          () => void check().catch(() => undefined).finally(schedule),
          current.status === "offline" ? RETRY_OFFLINE_MS : (input.intervalMs ?? MODEL_CHECK_MS),
        );
        timer.unref();
      };
      void check().catch(() => undefined).finally(schedule);
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },
  };
}

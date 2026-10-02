// The api's side of the agent's intelligence layer (A5): memory first. Built per turn inside `buildAgentContext`, so
// it is scoped to one person, one thread and one network like every other tool.
import type { IntelligenceContext, MemoryFact } from "@kawase/agent";
import type { Db } from "@kawase/db";
import type { Logger } from "@kawase/log";

import { MemoryService } from "../memory/service";
import type { SessionUser } from "../types";

const WORD_MIN = 2;
/** Words of two or more letters, lowercased, for matching "forget my landlord" to a fact. */
const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}@_]+/u).filter((word) => word.length >= WORD_MIN));

export function buildIntelligence(input: { db: Db; user: SessionUser; threadId: string; log: Logger }): IntelligenceContext {
  const { db, user, threadId, log } = input;
  const memory = new MemoryService(db);
  // One read per turn: the instructions and forget_fact's refs see the same list.
  let facts: Promise<MemoryFact[]> | undefined;

  return {
    memory() {
      facts ??= memory.forTurn(user.id).catch((error: unknown) => {
        log.warn({ err: error }, "memory read failed");
        return [];
      });
      return facts;
    },

    async rememberFact(fact) {
      return memory.remember(user.id, fact, threadId);
    },

    async forgetFact({ id, text }) {
      let target = id;
      if (!target && text) {
        // The fact that shares the most words with what the person said.
        const wanted = words(text);
        const { facts: all } = await memory.view(user.id);
        let best = 0;
        for (const fact of all) {
          const shared = [...words(fact.fact)].filter((word) => wanted.has(word)).length;
          if (shared > best) {
            best = shared;
            target = fact.id;
          }
        }
      }
      const forgotten = target ? await memory.forget(user.id, target) : undefined;
      return forgotten ? { status: "forgotten", fact: forgotten } : { status: "not_found" };
    },

    async markMemoryUsed(ids) {
      await memory.markUsed(user.id, ids);
    },
  };
}

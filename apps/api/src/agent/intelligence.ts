// The api's side of the agent's intelligence layer (A5): memory first. Built per turn inside `buildAgentContext`, so
// it is scoped to one person, one thread and one network like every other tool.
import type { IntelligenceContext, MemoryFact } from "@kawase/agent";
import { eq } from "drizzle-orm";

import { threadDigests, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";

import { MemoryService } from "../memory/service";
import { SearchService } from "../search/service";
import type { EarnService } from "../earn/service";
import type { RequestService } from "../requests/service";
import { SuggestionService } from "../suggestions/service";
import type { WalletService } from "../wallet/service";
import type { BridgeService } from "../bridge/service";
import type { MarginService } from "../margin/service";
import type { InvoiceService } from "../business/invoices";
import { PayCodeService } from "../paycodes/service";
import { SplitService } from "../splits/service";
import type { Recipients } from "../send/recipients";
import { ProblemError } from "../http/problem";
import { StatusService } from "../status/service";
import type { SwapService } from "../swap/service";
import type { AssetService } from "../tokens/service";
import type { Chains } from "../wallet/chain";
import { chartFor, decisionFor, settingDiff } from "./insight";
import type { SessionUser } from "../types";

const WORD_MIN = 2;
/** Words of two or more letters, lowercased, for matching "forget my landlord" to a fact. */
const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}@_]+/u).filter((word) => word.length >= WORD_MIN));

export function buildIntelligence(input: {
  db: Db;
  user: SessionUser;
  threadId: string;
  log: Logger;
  wallets: WalletService;
  earn: EarnService;
  requests: RequestService;
  assets: AssetService;
  swaps: SwapService;
  bridges: BridgeService;
  chains: Chains;
  margin?: MarginService | undefined;
  invoices?: InvoiceService | undefined;
  recipients: Recipients;
}): IntelligenceContext {
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

    async threadDigest() {
      const [row] = await db.select().from(threadDigests).where(eq(threadDigests.threadId, threadId));
      return row ? { summary: row.summary, throughMessageId: row.throughMessageId, folded: row.folded, actions: row.actions } : null;
    },

    async saveThreadDigest(digest) {
      await db
        .insert(threadDigests)
        .values({ threadId, ...digest })
        .onConflictDoUpdate({ target: threadDigests.threadId, set: { ...digest, updatedAt: new Date() } });
      log.info({ threadId, folded: digest.folded }, "thread summarized");
    },

    async searchHistory(query) {
      // Other conversations: this one is already in front of the model.
      const found = await new SearchService(db).search(user.id, query);
      return { query: found.query, hits: found.hits.filter((hit) => hit.threadId !== threadId) };
    },

    async forYou() {
      return new SuggestionService(db, input.wallets, input.earn, input.requests, log, input.assets, input.margin).list(user);
    },

    async chart({ token, range }) {
      return chartFor(input.assets, user, { token, range });
    },

    async explainChoice(about) {
      return decisionFor({ db, swaps: input.swaps, bridges: input.bridges, earn: input.earn }, user, threadId, about);
    },

    async settingDiff({ setting, value, reason }) {
      return settingDiff(memory, user, setting, value, reason);
    },

    async status() {
      return new StatusService(db, input.chains).view();
    },

    async splitBill(split) {
      if (user.isAnonymous) return { status: "needs_sign_in" };
      if (!(await input.wallets.userWallet(user.id))) return { status: "needs_wallet" };
      // "euros" is EURC; any other name is found like a request's token (held and verified first, R1).
      const asked = split.asset.trim().replace(/^euros?$/i, "EURC").replace(/^dollars?$/i, "USDC");
      const asset = /^(usdc|eurc|0x[0-9a-fA-F]{40})$/i.test(asked)
        ? asked.replace(/^(usdc|eurc)$/i, (symbol) => symbol.toUpperCase())
        : ((await input.assets.search(user, user.activeNetwork, asked).catch(() => []))[0]?.token.address ?? asked);
      try {
        return { status: "created", split: await new SplitService(db, input.requests, input.recipients).create(user, { ...split, asset }) };
      } catch (error) {
        // A share that does not add up is the person's to fix: say which rule, in their words via the model.
        if (error instanceof ProblemError && error.code === "validation") return { status: "invalid", problem: error.detail ?? "invalid" };
        throw error;
      }
    },

    async payCode(code) {
      return new PayCodeService(input.requests, input.invoices, undefined, input.chains).resolve(user, code);
    },

    warn(error, what) {
      log.warn({ err: error }, what);
    },
  };
}

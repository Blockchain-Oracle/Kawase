// The agent's view of one person, built per request from the api's own services (K2: the model proposes, code
// resolves). Money is given to the model both exactly (base units) and as a plain display string; network and
// identity come from the session, never from the model.
import { and, eq, inArray } from "drizzle-orm";

import { LANGUAGE_NAMES, type CatalogLocale } from "@kawase/i18n";
import type { AgentContext, Money, WalletSummary } from "@kawase/agent";
import type { CapabilityId } from "@kawase/config";
import { intents, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { amount, formatAmount, type AssetId } from "@kawase/money";

import { capabilityView } from "../capabilities/service";
import type { ContactService } from "../contacts/service";
import type { FaucetService } from "../faucet/service";
import type { RequestService } from "../requests/service";
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { SwapService } from "../swap/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { summarizeSend } from "./send-summary";
import { summarizeSwap } from "./swap-summary";

/** Display strings for the model are canonical (English digits); the model renders them in the person's language. */
const DISPLAY_LOCALE = "en";
const SECONDS_PER_DAY = 86_400;
const ZERO = 0n;

type NetworkState = {
  setUp: boolean;
  usdcBalance: string;
  eurcBalance: string;
  allowance: { receipt: { token?: string; amountPerPeriod?: string; periodSeconds?: number; targets: string[]; maxNativeValue?: string; unknownCaveats: string[] }; expiresAt: string | Date } | null;
};

const money = (asset: AssetId, baseUnits: string): Money => ({
  asset: asset as Money["asset"],
  baseUnits,
  display: formatAmount(amount(asset, BigInt(baseUnits)), DISPLAY_LOCALE),
});

const COUNTERPARTY_NAMES = { circle_faucet: "Circle faucet", kawase_agent: "Kawase agent", kawase_relayer: "Kawase", self: "yourself", swap: "a swap (Circle App Kit)" } as const;

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const DRAFTABLE = ["submitted", "working", "input_required", "auth_required", "ready_for_approval"] as const;

export function buildAgentContext(input: {
  user: SessionUser;
  db: Db;
  chains: Chains;
  wallets: WalletService;
  faucet: FaucetService;
  contacts: ContactService;
  recipients: Recipients;
  sends: SendService;
  swaps: SwapService;
  requests: RequestService;
  threadId: string;
  lastUserText: string;
  log: Logger;
}): AgentContext {
  const { user, db, chains, wallets, faucet, contacts, recipients, sends, swaps, requests, threadId, log } = input;
  const network = user.activeNetwork;
  const locale = (user.replyLanguage ?? user.locale) as CatalogLocale;

  const networkState = async () => {
    const status = await wallets.status(user.id);
    return { address: status.address, state: (status.networks as Record<string, NetworkState | undefined>)[network] };
  };

  return {
    network,
    locale,
    languageName: LANGUAGE_NAMES[locale] ?? LANGUAGE_NAMES.en,
    isGuest: user.isAnonymous,
    handle: user.handle,
    lastUserText: input.lastUserText,

    async proposeSend(request) {
      // One open send per conversation: a newer proposal replaces any earlier one still waiting, so an old card
      // can never be approved by mistake.
      await db
        .update(intents)
        .set({ state: "canceled" })
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "send"), inArray(intents.state, [...DRAFTABLE])));
      let intent = await sends.create(user, request, { surface: "chat", threadId });
      // D33 / DESIGN.md: inside the allowance the agent just sends and says so. The person's own request is the
      // instruction; the policy has already decided that no second look is needed (above the allowance, a new
      // address above the threshold or a lookalike all route to Face ID instead and wait on the card).
      if (!intent.blocking && intent.route === "allowance" && !user.isAnonymous) {
        const answer = await sends.approve(user, intent.id, { version: intent.version, surface: "chat" }).catch((error: unknown) => {
          log.warn({ err: error, intentId: intent.id }, "auto-send inside the allowance did not start");
          return undefined;
        });
        if (answer) intent = answer.intent;
      }
      return { intent, summary: summarizeSend(intent) };
    },

    async proposeSwap(request) {
      // One open swap per conversation, like sends. A swap is always confirmed on the card (Face ID or an email
      // code): the daily allowance only covers transfers, so nothing is approved here.
      await db
        .update(intents)
        .set({ state: "canceled" })
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "swap"), inArray(intents.state, [...DRAFTABLE])));
      const intent = await swaps.create(user, request, { surface: "chat", threadId });
      return { intent, summary: summarizeSwap(intent) };
    },

    async createPaymentRequest(request) {
      if (user.isAnonymous) return { status: "needs_sign_in" as const };
      if (!(await wallets.userWallet(user.id))) return { status: "needs_wallet" as const };
      return { request: await requests.create(user, request) };
    },

    async findContacts(query) {
      if (user.isAnonymous) return [];
      const text = query.trim();
      const [all, matches] = await Promise.all([contacts.list(user.id), recipients.search(user.id, text)]);
      const ids = new Set(matches.flatMap((match) => (match.kind === "contact" ? [match.contactId] : [])));
      const shown = all.filter((contact) => ids.has(contact.id));
      return Promise.all(
        shown.map(async (contact) => ({
          name: contact.displayName,
          handle: contact.handle,
          address: contact.address ? `${contact.address.slice(0, ADDRESS_HEAD)}…${contact.address.slice(-ADDRESS_TAIL)}` : null,
          onHold: Boolean(contact.pendingChange),
          paidBefore: contact.address ? await recipients.paidBefore(user.id, network, contact.address) : false,
        })),
      );
    },

    async wallet(): Promise<WalletSummary> {
      if (user.isAnonymous) return { status: "guest" };
      const { address, state } = await networkState();
      if (!address || !state) return { status: "no_wallet" };
      const allowance = state.allowance;
      return {
        status: "ready",
        address,
        handle: user.handle,
        setUp: state.setUp,
        balances: [money("USDC", state.usdcBalance), money("EURC", state.eurcBalance ?? "0")],
        allowance: allowance
          ? { perDay: money("USDC", allowance.receipt.amountPerPeriod ?? "0"), until: new Date(allowance.expiresAt).toISOString() }
          : null,
      };
    },

    async activity(limit) {
      if (user.isAnonymous) return [];
      const { items } = await wallets.activity(user.id, network);
      return items.slice(0, limit).map((item) => ({
        direction: item.direction,
        amount: money(item.asset, item.amount),
        counterparty: item.counterparty,
        counterpartyName: item.contactName ?? (item.counterpartyLabel ? COUNTERPARTY_NAMES[item.counterpartyLabel] : null),
        label: item.counterpartyLabel,
        ...(item.swap ? { paid: money(item.swap.asset, item.swap.amount) } : {}),
        at: item.at,
        explorerUrl: item.explorerUrl,
      }));
    },

    async capabilities() {
      const view = await capabilityView(db, chains.available);
      const other = network === "testnet" ? "mainnet" : "testnet";
      return (Object.keys(view) as CapabilityId[]).map((id) => ({
        id,
        here: view[id][network].state,
        otherNetwork: view[id][other].state,
        ...(view[id][network].reason ? { reason: view[id][network].reason } : {}),
      }));
    },

    async claimTestMoney() {
      if (user.isAnonymous) return { status: "needs_sign_in" };
      const result = await faucet.claim(user.id, network, log);
      if (result.status === "sent") {
        return { status: "sent", amounts: Object.entries(result.amounts).map(([asset, value]) => money(asset as AssetId, value)), nextAt: result.nextAt };
      }
      return result;
    },

    async authority() {
      if (user.isAnonymous) return null;
      const { state } = await networkState();
      const allowance = state?.allowance;
      if (!allowance) return null;
      const { receipt } = allowance;
      const token = receipt.token?.toLowerCase();
      return {
        perPeriod: money("USDC", receipt.amountPerPeriod ?? "0"),
        periodSeconds: receipt.periodSeconds ?? SECONDS_PER_DAY,
        until: new Date(allowance.expiresAt).toISOString(),
        onlyThisToken: Boolean(token) && receipt.targets.length > 0 && receipt.targets.every((target) => target.toLowerCase() === token) && BigInt(receipt.maxNativeValue ?? "0") === ZERO,
        unknownTerms: receipt.unknownCaveats.length > 0,
      };
    },
  };
}

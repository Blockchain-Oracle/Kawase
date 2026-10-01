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
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { summarizeSend } from "./send-summary";

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

const COUNTERPARTY_NAMES = { circle_faucet: "Circle faucet", kawase_agent: "Kawase agent", kawase_relayer: "Kawase", self: "yourself" } as const;

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
  threadId: string;
  lastUserText: string;
  log: Logger;
}): AgentContext {
  const { user, db, chains, wallets, faucet, contacts, recipients, sends, threadId, log } = input;
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
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), inArray(intents.state, [...DRAFTABLE])));
      const intent = await sends.create(user, request, { surface: "chat", threadId });
      return { intent, summary: summarizeSend(intent) };
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

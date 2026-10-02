// The agent's view of one person, built per request from the api's own services (K2: the model proposes, code
// resolves). Money is given to the model both exactly (base units) and as a plain display string; network and
// identity come from the session, never from the model.
import { CAPABILITY_SCOPE } from "@kawase/config";
import { and, eq, inArray } from "drizzle-orm";

import { LANGUAGE_NAMES, type CatalogLocale } from "@kawase/i18n";
import type { AgentContext, Money, WalletSummary } from "@kawase/agent";
import type { CapabilityId } from "@kawase/config";
import { intents, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import { amount, formatAmount, parseAmount, type AssetId } from "@kawase/money";
import type { AgentTopUpProposal, AgentWalletLine, BuyOutcome } from "@kawase/api-client";

import type { MarketplaceService } from "../marketplace/service";
import { summarizeAgentWallet, summarizeBuy, summarizeInspect, summarizeServices, summarizeTopUp } from "./marketplace-summary";

import { capabilityView } from "../capabilities/service";
import type { ContactService } from "../contacts/service";
import type { FaucetService } from "../faucet/service";
import type { RequestService } from "../requests/service";
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { AutomationService } from "../automations/service";
import type { BridgeService } from "../bridge/service";
import type { EarnService } from "../earn/service";
import type { MarginService } from "../margin/service";
import type { OnrampService } from "../onramp/service";
import type { CrossChainService } from "../crosschain/service";
import type { LendService } from "../lend/service";
import type { SwapService } from "../swap/service";
import type { AssetService } from "../tokens/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import { summarizeSend } from "./send-summary";
import { summarizeAutomation } from "./automation-summary";
import { summarizeBridge } from "./bridge-summary";
import { percent, summarizeEarn } from "./earn-summary";
import { summarizeSwap } from "./swap-summary";
import { railsContext } from "./rails-context";

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

const COUNTERPARTY_NAMES = { circle_faucet: "Circle faucet", kawase_agent: "Kawase agent", kawase_relayer: "Kawase", self: "yourself", swap: "a swap (Circle App Kit)", bridge: "a bridge to another chain (Circle CCTP)", earn: "their own earn vault" } as const;

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
  bridges: BridgeService;
  earn: EarnService;
  margin?: MarginService | undefined;
  onramp?: OnrampService | undefined;
  crosschain?: CrossChainService | undefined;
  lend?: LendService | undefined;
  assets: AssetService;
  automations: AutomationService;
  requests: RequestService;
  /** The x402 marketplace; paid services answer "unavailable" without it. */
  marketplace?: MarketplaceService | undefined;
  threadId: string;
  lastUserText: string;
  log: Logger;
  /** Where the person is: typing in chat, or talking (voice answers are spoken; the cards carry the details). */
  surface?: "chat" | "voice" | undefined;
}): AgentContext {
  const { user, db, chains, wallets, faucet, contacts, recipients, sends, swaps, bridges, earn, assets, automations, requests, threadId, log } = input;
  const network = user.activeNetwork;
  const locale = (user.replyLanguage ?? user.locale) as CatalogLocale;
  const { marketplace } = input;
  // Set once paid data was read in this turn: every later purchase in it waits for the person's tap.
  let tainted = false;

  // Only the active network: the agent never talks about the other one's money without a switch.
  const networkState = async () => {
    const status = await wallets.status(user.id, [network]);
    return { address: status.address, state: (status.networks as Record<string, NetworkState | undefined>)[network] };
  };

  return {
    network,
    locale,
    languageName: LANGUAGE_NAMES[locale] ?? LANGUAGE_NAMES.en,
    isGuest: user.isAnonymous,
    handle: user.handle,
    lastUserText: input.lastUserText,
    surface: input.surface ?? "chat",
    ...railsContext({ user, db, margin: input.margin, onramp: input.onramp, crosschain: input.crosschain, lend: input.lend, threadId }),

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
      // By voice it always waits for the tap on its card: a microphone can hear a request the person did not make
      // (seen on 2026-10-01: speech in the room became "10 usdc"), and a spoken yes never moves money.
      if (!intent.blocking && intent.route === "allowance" && !user.isAnonymous && input.surface !== "voice") {
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

    async proposeBridge(request) {
      // One open bridge per conversation. Always confirmed on the card (Face ID or an email code).
      await db
        .update(intents)
        .set({ state: "canceled" })
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "bridge"), inArray(intents.state, [...DRAFTABLE])));
      const intent = await bridges.create(user, request, { surface: "chat", threadId });
      return { intent, summary: summarizeBridge(intent) };
    },

    async proposeTrade(request) {
      // A token as the person named it: an address or a verified symbol goes through as is; any other name is the
      // best match of a search (held and verified first), so the model never has to know an address.
      const resolve = async (text: string | null) => {
        if (!text) return null;
        const value = text.trim();
        if (/^0x[0-9a-fA-F]{40}$/.test(value) || /^(usdc|eurc|dollars?|euros?)$/i.test(value)) return value.replace(/^dollars?$/i, "USDC").replace(/^euros?$/i, "EURC");
        const [best] = await assets.search(user, network, value);
        return best?.token.address ?? value;
      };
      await db
        .update(intents)
        .set({ state: "canceled" })
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "swap"), inArray(intents.state, [...DRAFTABLE])));
      const intent = await swaps.create(user, { tokenIn: await resolve(request.from), tokenOut: await resolve(request.to), amount: request.amount }, { surface: "chat", threadId });
      return { intent, summary: summarizeSwap(intent) };
    },

    portfolio: () => assets.portfolio(user),
    searchTokens: (query) => assets.search(user, network, query),
    tokenDetail: (address) => assets.token(user, network, address),

    async earnOverview() {
      const view = await earn.overview(user);
      return {
        network,
        vaults: view.vaults.map((vault) => ({ name: vault.name, protocol: vault.protocol, apy: percent(vault.apy), available: `${vault.available} USDC`, circleGuarded: vault.circleGuarded, status: vault.status, address: vault.address })),
        positions: view.positions.map((position) => ({ name: position.name, worth: money("USDC", position.assets).display, apy: percent(position.apy) })),
      };
    },

    async proposeEarn(request) {
      await db
        .update(intents)
        .set({ state: "canceled" })
        .where(and(eq(intents.userId, user.id), eq(intents.threadId, threadId), eq(intents.kind, "earn"), inArray(intents.state, [...DRAFTABLE])));
      const intent = await earn.create(user, request, { surface: "chat", threadId });
      return { intent, summary: summarizeEarn(intent) };
    },

    async draftAutomation(request) {
      // A guest gets a real draft too (blocked on signing in): it moves into their account when they sign in, and the
      // card checks the same draft again — the amount and recipient they said are never lost (review K03).
      const automation = await automations.create(user, request, { threadId });
      return { automation, summary: summarizeAutomation(automation) };
    },

    async draftAutoSave(request) {
      const automation = await automations.createAutoSave(user, request, { threadId });
      return { automation, summary: summarizeAutomation(automation) };
    },

    async draftRule(request) {
      const automation = await automations.createRule(user, request, { threadId });
      return { automation, summary: summarizeAutomation(automation) };
    },

    async listAutomations() {
      if (user.isAnonymous) return { network, automations: [] };
      const list = (await automations.list(user)).filter((entry) => entry.status !== "draft");
      return { network, automations: list.map((automation) => ({ automation, summary: summarizeAutomation(automation) })) };
    },

    async changeAutomation({ automationId, change }) {
      // Pausing, resuming and skipping narrow what runs, so they happen at once. Cancelling stops every run at once;
      // revoking the grant on chain is the wallet's own transaction, offered on the card.
      const automation =
        change === "pause"
          ? await automations.pause(user, automationId)
          : change === "resume"
            ? await automations.resume(user, automationId)
            : change === "skip_next"
              ? await automations.skip(user, automationId)
              : (await automations.cancel(user, automationId)).automation;
      return { automation, summary: summarizeAutomation(automation) };
    },

    async createPaymentRequest(request) {
      if (user.isAnonymous) return { status: "needs_sign_in" as const };
      if (!(await wallets.userWallet(user.id))) return { status: "needs_wallet" as const };
      return { request: await requests.create(user, request) };
    },

    async searchServices({ query, category }) {
      if (!marketplace) return { network, services: [], total: 0, summary: { status: "unavailable" } };
      const found = await marketplace.search(user, query, category);
      return { ...found, summary: summarizeServices(found.services, found.total) };
    },

    async inspectService(request) {
      const result = marketplace ? await marketplace.inspect(user, request) : { network, status: "unavailable" as const };
      return { result, summary: summarizeInspect(result) };
    },

    async buyService(request) {
      const outcome: BuyOutcome = marketplace
        ? await marketplace.buy(user, request, { threadId, tainted })
        : { network, status: "refused", reason: "unavailable" };
      if (outcome.status === "paid" || outcome.status === "free") tainted = true;
      return { outcome, summary: summarizeBuy(outcome) };
    },

    async agentWallet() {
      const wallet: AgentWalletLine = user.isAnonymous
        ? { network, status: "needs_sign_in" }
        : marketplace
          ? { status: "ready", ...(await marketplace.view(user)) }
          : { network, status: "unavailable" };
      return { wallet, summary: summarizeAgentWallet(wallet) };
    },

    async proposeAgentTopUp({ amount: asked }) {
      let proposal: AgentTopUpProposal;
      if (user.isAnonymous) proposal = { network, status: "needs_sign_in" };
      else if (!marketplace) proposal = { network, status: "unavailable" };
      else if (!(await wallets.userWallet(user.id))) proposal = { network, status: "needs_wallet" };
      else {
        const view = await marketplace.view(user);
        const preset = view.topUpPresets[0] ?? "0";
        const suggested = asked ? parseAmount(asked, "USDC", "en").baseUnits.toString() : preset;
        proposal = {
          network,
          status: "proposed",
          suggested,
          presets: view.topUpPresets,
          wallet: { onHand: view.balances.onHand, inGateway: view.balances.inGateway, total: view.balances.total },
          grantPerDay: view.grant?.perDay ?? null,
        };
      }
      return { proposal, summary: summarizeTopUp(proposal) };
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
        ...(CAPABILITY_SCOPE[id] ?? {}),
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

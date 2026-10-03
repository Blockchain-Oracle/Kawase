// Everyday money (A5-2): scan to pay, split a bill, open any intent by its id, and contacts from the device.
// Client-safe shapes shared by the api, the agent and the app.
import type { AgentNetwork } from "./agent-types";
import type { OnrampOrderView } from "./rails";
import type { AutomationView, PaymentRequest, PublicPaymentRequest, RequestToken, SendIntent, SwapIntent, BridgeIntent, EarnIntent } from "./types";

/** What a scanned or pasted code means, and where it goes. */
export type PayCodeView =
  | {
      status: "send";
      network: AgentNetwork;
      /** Checksummed recipient. */
      to: string;
      /** Decimal, when the code carried one. */
      amount: string | null;
      /** "USDC", "EURC", or any token's address on this network (R1); null when the code named none. */
      asset: string | null;
    }
  | {
      status: "request";
      token: string;
      request: PublicPaymentRequest;
      /** When the request is an invoice's: its number and the business's name. */
      invoice: { number: string; business: string | null } | null;
    }
  | {
      status: "unsupported";
      /**
       * other_network: it is for the other Arc network (switch first); other_chain: it asks for payment on another
       * chain; unsupported_asset: a token Kawase does not send here; request_closed: paid, expired or cancelled;
       * not_found: no such Kawase request; not_a_payment: anything else.
       */
      reason: "other_network" | "other_chain" | "unsupported_asset" | "request_closed" | "not_found" | "not_a_payment";
      network?: AgentNetwork | undefined;
      chainId?: number | undefined;
      chainName?: string | undefined;
      token?: string | undefined;
    };

/** One person in a split: who, and their share (decimal). */
/** `ask: false` keeps a share to its link only (the agent sets it for a name that is not in the person's own words). */
export type SplitShareInput = { name: string; amount?: string | undefined; ask?: boolean | undefined };
export type SplitInput = {
  /** What the bill was for (shown to every payer). */
  title: string;
  /** "USDC", "EURC", a verified symbol or any token's address on the active network (R1). */
  asset: string;
  /** The whole bill, decimal; equal shares unless each share has its own amount. */
  total: string;
  /** Whether the person who split it pays a share too (it is never requested from them). */
  includeMe: boolean;
  people: SplitShareInput[];
};

export type SplitShare = {
  name: string;
  /** The contact or @handle it matched, when it did. */
  handle: string | null;
  /** They are on Kawase and were asked in the app (inbox and push); the link is for everyone else. */
  askedInApp: boolean;
  amount: string;
  request: PaymentRequest;
};

export type SplitView = {
  id: string;
  network: AgentNetwork;
  title: string;
  /** The token's symbol; `assetToken` has its address and decimals (any asset, R1). */
  asset: string;
  assetToken: RequestToken;
  /** Base units. */
  total: string;
  myShare: string | null;
  shares: SplitShare[];
  /** Base units collected so far, and how many shares are paid. */
  collected: string;
  paidCount: number;
  status: "open" | "settled" | "canceled";
  createdAt: string;
};

/** Any money action by its id, as the card that shows it needs it (`/i/<id>` from push, inbox or email). */
export type IntentLookup =
  | { kind: "send"; network: AgentNetwork; threadId: string | null; intent: SendIntent }
  | { kind: "swap"; network: AgentNetwork; threadId: string | null; intent: SwapIntent }
  | { kind: "bridge"; network: AgentNetwork; threadId: string | null; intent: BridgeIntent }
  | { kind: "earn"; network: AgentNetwork; threadId: string | null; intent: EarnIntent }
  | { kind: "margin"; network: AgentNetwork; threadId: string | null; positionId: string | null }
  // Every other id a notification can carry lands on its own screen (A5-3): an automation's live card, a run's story,
  // an invoice, a Buy order, a split or one of the person's requests.
  | { kind: "automation"; network: AgentNetwork; threadId: string | null; automation: AutomationView }
  | { kind: "automation_run"; network: AgentNetwork; threadId: null; runId: string }
  | { kind: "invoice"; network: AgentNetwork; threadId: null; invoiceId: string }
  | { kind: "onramp"; network: AgentNetwork; threadId: null; order: OnrampOrderView }
  | { kind: "split"; network: AgentNetwork; threadId: null; splitId: string }
  | { kind: "request"; network: AgentNetwork; threadId: null; requestId: string };

/** A device contact the person chose to check, as a hash of each email (the email never leaves the phone). */
export type DiscoverInput = { contacts: { ref: string; emailHashes: string[] }[] };
export type DiscoverMatch = { ref: string; handle: string };

/** The client calls for these (spread into the api client). */
type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function everydayApi(call: Call) {
  return {
    payCodes: {
      /** What a scanned or pasted code means here, with the network and asset checked. */
      resolve: (code: string) => call<PayCodeView>("POST", "/pay-codes/resolve", { code }),
    },
    splits: {
      list: () => call<{ splits: SplitView[] }>("GET", "/splits"),
      get: (id: string) => call<{ split: SplitView }>("GET", `/splits/${id}`),
      create: (input: SplitInput) => call<{ split: SplitView }>("POST", "/splits", input),
      cancel: (id: string) => call<{ split: SplitView }>("POST", `/splits/${id}/cancel`, {}),
    },
    intents: {
      /** Any money action of the person's by id, with its kind and network. */
      get: (id: string) => call<IntentLookup>("GET", `/intents/${id}`),
    },
    discover: {
      /** Which of the chosen device contacts are on Kawase (only people who let others find them by email). */
      match: (input: DiscoverInput) => call<{ matches: DiscoverMatch[] }>("POST", "/contacts-discovery/match", input),
      /** Whether others who have my email can find my @handle. */
      get: () => call<{ discoverable: boolean }>("GET", "/contacts-discovery/me"),
      set: (discoverable: boolean) => call<{ discoverable: boolean }>("PUT", "/contacts-discovery/me", { discoverable }),
    },
  };
}

// A small, explicit client: one function per route, problem+json turned into `ApiError`, the session token
// supplied by the caller (secure storage on native, a cookie or storage on web).
import type {
  VoicePrefs,
  ActivityPage,
  AllowanceRequestResponse,
  ApiUser,
  HandleAvailability,
  Capabilities,
  Consent,
  ConsentKind,
  DeviceInfo,
  NetworkId,
  Problem,
  SetupRequestResponse,
  SignedAuthorizationInput,
  SignInResponse,
  StampedProof,
  RevokeRequest,
  SignedRevokeInput,
  WalletStatus,
  FaucetClaim,
  FaucetStatus,
  ThreadSummary,
  Contact,
  ContactInput,
  AddressSource,
  RecipientMatch,
  SendIntent,
  SendRequest,
  SendApproveResponse,
  SwapApproveResponse,
  SwapIntent,
  SwapRequest,
  BridgeApproveResponse,
  AutomationGrantRequest,
  AutomationInput,
  AutoSaveInput,
  RuleInput,
  AutomationView,
  VoiceSession,
  EarnApproveResponse,
  EarnIntent,
  EarnPositionView,
  EarnRequest,
  EarnVaultView,
  BridgeDestinationView,
  BridgeIntent,
  BridgeRequest,
  PaymentRequest,
  PaymentRequestInput,
  RequestReminder,
  VerifyMethod,
  BlockView,
  ContactChain,
  PublicPaymentRequest,
  InboxItem,
  NotificationSettings,
  NotificationSettingsChange,
} from "./types";
import type { Candle, ChartRange, MarketListView, MarketSegment, NetworkTotalsView, PortfolioView, TokenDetailView, TokenSearchResult, TokenTradesView, WatchRow } from "./assets";
import type { ClientEvent } from "./client-events";
import type {
  AgentWalletSettings,
  AgentWalletSettingsChange,
  AgentWalletView,
  MarketplaceCategory,
  MarketplaceGrantRequest,
  PurchaseView,
  ReturnResult,
  ServiceSearchResult,
  TopUpResult,
} from "./marketplace";
import type { AccountApi, AccountDeleted, AccountHoldings, DeviceView } from "./account";
import type { ActivityFeedApi, FeedPage } from "./activity-feed";
import type { ExitKitResponse, SafetyApi, SafetyChange, SafetyChangeResponse, SafetyView, TokenOption } from "./safety";
import type { AutomationEdit, AutomationEditResponse, AutomationsMoreApi, DcaInput, NeedsYouApi, NeedsYouApproval, NeedsYouItem, SimulationView } from "./automations-8c";
import { railsEndpoints } from "./rails";
import { withdrawEndpoints } from "./withdraw";
import { tokenRulesEndpoints } from "./token-rules";
import { feedEndpoints } from "./feed";
import { budgetEndpoints } from "./budget";
import type { PrivacySettings, ReportView, WhyView } from "./history";
import type { FeeReserveView, FxView } from "./fees";
import { intelligenceApi } from "./intelligence";
import { everydayApi } from "./everyday";

export * from "./types";
export * from "./agent-types";
export * from "./assets";
export * from "./client-events";
export * from "./routes";
export * from "./marketplace";
export * from "./account";
export * from "./safety";
export * from "./automations-8c";
export * from "./activity-feed";
export * from "./feed";
export * from "./budget";
export * from "./rails";
export * from "./withdraw";
export * from "./token-rules";
export * from "./history";
export * from "./intelligence";
export * from "./everyday";
export * from "./chat-cards";
export * from "./fees";

export class ApiError extends Error {
  readonly status: number;
  /** The last path segment of the problem type, e.g. "nonce_invalid". */
  readonly code: string;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.type.split("/").pop() ?? "unknown";
    this.problem = problem;
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  /** The Kawase session token, when signed in. */
  getToken: () => string | undefined | Promise<string | undefined>;
  fetch?: typeof fetch;
  /**
   * Headers proving a request comes from this device's own Turnkey key (security review M12), for the calls a bearer
   * token alone may not make: approving a send (inside the allowance it goes at once), a waiting run, deleting the
   * account. Without it those calls go unproven (older servers accept that until proofs are required).
   */
  prove?: (request: { method: string; path: string; body: string }) => Promise<Record<string, string>>;
};

const HTTP_NO_CONTENT = 204;

export function createApiClient({ baseUrl, getToken, fetch: fetchImpl = fetch, prove }: ApiClientOptions) {
  const base = baseUrl.replace(/\/$/, "");

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    options: {
      idempotencyKey?: string | undefined;
      token?: string | undefined;
      authAttemptId?: string | undefined;
      /** Carries the device's proof (M12). */
      proven?: boolean | undefined;
    } = {},
  ): Promise<T> {
    const token = options.token ?? (await getToken());
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    if (options.authAttemptId) headers["x-kawase-auth-attempt"] = options.authAttemptId;
    const sent = body !== undefined ? JSON.stringify(body) : undefined;
    // The proof covers this exact method, path and body; a device that cannot prove sends none (the api decides).
    if (options.proven && prove) Object.assign(headers, await prove({ method, path, body: sent ?? "" }).catch(() => ({})));
    const init: RequestInit = { method, headers };
    if (sent !== undefined) init.body = sent;
    const response = await fetchImpl(`${base}${path}`, init);
    if (response.status === HTTP_NO_CONTENT) return undefined as T;
    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : undefined;
    if (!response.ok) throw new ApiError(parsed as Problem);
    return parsed as T;
  }

  return {
    ...railsEndpoints(call),
    ...withdrawEndpoints(call),
    ...tokenRulesEndpoints(call),
    // The agent's feed and its model's health (front door): api.feed.get(), api.agentHealth.health().
    ...feedEndpoints(call),
    // The weekly budget (D38): terms, pause, ledger, kill-switch and the swap/earn leaf path.
    ...budgetEndpoints(call),
    /** `minAppVersion`: older apps must update (cards/access.md). */
    health: () => call<{ ok: boolean; networks: NetworkId[]; minAppVersion?: string }>("GET", "/health"),
    capabilities: () => call<{ capabilities: Capabilities }>("GET", "/capabilities"),

    auth: {
      nonce: (authAttemptId?: string) =>
        call<{ nonce: string; expiresAt: string }>("POST", "/auth/nonce", undefined, { authAttemptId }),
      guest: (input: { device: DeviceInfo; locale?: string }) => call<SignInResponse>("POST", "/auth/guest", input),
      /** With a guest token, the guest is upgraded or merged into the account. */
      turnkey: (
        input: { proof: StampedProof; turnkeyUserId: string; device: DeviceInfo },
        guestToken?: string,
        authAttemptId?: string,
      ) => call<SignInResponse>("POST", "/auth/turnkey", input, { token: guestToken, authAttemptId }),
      /** Local development only: a throwaway testnet key signs the nonce (`Kawase dev sign-in\n<nonce>`). */
      dev: (
        input: { email: string; address: string; nonce: string; signature: string; device: DeviceInfo },
        guestToken?: string,
      ) => call<SignInResponse & { wallet: { id: string; address: string } }>("POST", "/auth/dev", input, { token: guestToken }),
      signOut: () => call<void>("POST", "/auth/sign-out"),
    },

    me: {
      get: (authAttemptId?: string) =>
        call<{ user: ApiUser; availableNetworks: NetworkId[] }>("GET", "/me", undefined, { authAttemptId }),
      update: (
        settings: Partial<
          Pick<
            ApiUser,
            | "locale"
            | "replyLanguage"
            | "displayCurrency"
            | "timezone"
            | "theme"
            | "handle"
          >
        > & { handlePrompted?: true; voicePrefs?: Partial<VoicePrefs> },
      ) => call<{ user: ApiUser }>("PATCH", "/me", settings),
      /** The handle field's live check: which rule it breaks, or whether someone has it. */
      handleAvailability: (handle: string) =>
        call<HandleAvailability>("GET", `/me/handle/availability?handle=${encodeURIComponent(handle)}`),
      setNetwork: (network: NetworkId) => call<{ user: ApiUser }>("PUT", "/me/network", { network }),
      consents: () => call<{ consents: Consent[] }>("GET", "/me/consents"),
      consent: (input: { kind: ConsentKind; version: string; locale: string }) =>
        call<{ consents: Consent[] }>("POST", "/me/consents", input),
    },

    wallet: {
      status: () => call<WalletStatus>("GET", "/wallet"),
      /** USDC and EURC transfers in and out on one network, newest first. */
      activity: (network: NetworkId) => call<ActivityPage>("GET", `/wallet/activity?network=${network}`),
      register: (input: { address: string; walletId: string }, authAttemptId?: string) =>
        call<{ wallet: { id: string; address: string } }>("POST", "/wallet", input, { authAttemptId }),
      setupRequest: (network: NetworkId) => call<SetupRequestResponse>("POST", "/wallet/setup/request", { network }),
      setupSubmit: (network: NetworkId, authorization: SignedAuthorizationInput, idempotencyKey?: string) =>
        call<{ tx: string | null; setUp: boolean }>(
          "POST",
          "/wallet/setup/submit",
          { network, authorization },
          { idempotencyKey },
        ),
      allowanceRequest: (network: NetworkId, periodAmount?: string) =>
        call<AllowanceRequestResponse>("POST", "/wallet/allowance/request", { network, periodAmount }),
      /** `revoke`: the allowance it replaces, signed in the same yes; the api turns it off on chain first. */
      allowanceSubmit: (grantId: string, signature: string, revoke?: SignedRevokeInput) =>
        call<{ grantId: string; receipt: unknown; expiresAt: string }>("POST", "/wallet/allowance/submit", {
          grantId,
          signature,
          revoke,
        }),
      revokeRequest: (network: NetworkId) =>
        call<RevokeRequest>("POST", "/wallet/allowance/revoke/request", { network }),
      submitTransaction: (requestId: string, signedTransaction: string) =>
        call<{ tx: string; status: "confirmed" | "reverted" }>("POST", "/wallet/transactions/submit", {
          requestId,
          signedTransaction,
        }),
      /** The wallet's signature on a relayed request (a RevokeRequest with `relayed`): Kawase's relayer sends it. */
      submitSignature: (requestId: string, signature: string) =>
        call<{ tx: string; status: "confirmed" | "reverted" }>("POST", "/wallet/transactions/submit", { requestId, signature }),
    },

    agent: {
      /** The person's conversations, newest first. */
      threads: () => call<{ threads: ThreadSummary[] }>("GET", "/agent/threads"),
      /** One conversation with its messages (AI SDK UI messages). */
      thread: (id: string) => call<{ thread: ThreadSummary; messages: unknown[] }>("GET", `/agent/threads/${id}`),
      deleteThread: (id: string) => call<void>("DELETE", `/agent/threads/${id}`),
      renameThread: (id: string, title: string) => call<{ thread: ThreadSummary }>("PATCH", `/agent/threads/${id}`, { title }),
    },

    contacts: {
      list: () => call<{ contacts: Contact[] }>("GET", "/contacts"),
      get: (id: string) => call<{ contact: Contact }>("GET", `/contacts/${id}`),
      create: (input: ContactInput) => call<{ contact: Contact }>("POST", "/contacts", input),
      update: (
        id: string,
        patch: Partial<Pick<ContactInput, "displayName" | "aliases" | "notes" | "label" | "kind">>,
      ) => call<{ contact: Contact }>("PATCH", `/contacts/${id}`, patch),
      /** The new address waits out a cooldown; the contact cannot be paid until then. */
      changeAddress: (id: string, input: { address: string; source?: AddressSource; chain?: ContactChain }) =>
        call<{ contact: Contact }>("POST", `/contacts/${id}/address`, input),
      cancelChange: (id: string, chain: ContactChain = "arc") => call<{ contact: Contact }>("DELETE", `/contacts/${id}/address/pending?chain=${chain}`),
      /** Mark the current address on a chain (Arc unless named) verified on the active network (null clears it). */
      verify: (id: string, method: VerifyMethod | null, chain: ContactChain = "arc") => call<{ contact: Contact }>("POST", `/contacts/${id}/verify`, { method, chain }),
      remove: (id: string) => call<void>("DELETE", `/contacts/${id}`),
    },

    /** Who the person blocked: payments to them are refused; their asks and reminders never reach the inbox. */
    blocks: {
      list: () => call<{ blocks: BlockView[] }>("GET", "/blocks"),
      /** Exactly one of a saved contact, an @handle or an address. */
      block: (target: { contactId?: string; handle?: string; address?: string }) => call<{ blocks: BlockView[] }>("POST", "/blocks", target),
      unblock: (target: { contactId?: string; handle?: string; address?: string }) => call<{ blocks: BlockView[] }>("POST", "/blocks/remove", target),
      remove: (id: string) => call<{ blocks: BlockView[] }>("DELETE", `/blocks/${id}`),
    },

    /** The send screen's search: contacts by name, alias or handle, then an exact Kawase @handle. */
    recipients: {
      search: (query: string) =>
        call<{ matches: RecipientMatch[] }>("GET", `/recipients?q=${encodeURIComponent(query)}`),
    },

    sends: {
      create: (request: SendRequest) => call<{ intent: SendIntent }>("POST", "/sends", request),
      get: (id: string) => call<{ intent: SendIntent }>("GET", `/sends/${id}`),
      /** A fix or an edit: the same send, a new version. An empty patch re-checks it (after a saved contact). */
      revise: (id: string, patch: SendRequest) => call<{ intent: SendIntent }>("PATCH", `/sends/${id}`, patch),
      cancel: (id: string) => call<{ intent: SendIntent }>("POST", `/sends/${id}/cancel`),
      /** Approve one version; above the allowance the answer carries the transaction for the wallet to sign. */
      approve: (id: string, version: number, idempotencyKey?: string, override?: boolean) =>
        call<SendApproveResponse>("POST", `/sends/${id}/approve`, { version, ...(override ? { override } : {}) }, { idempotencyKey, proven: true }),
      /** `kind: "typed"` for a gas-free send's EIP-3009 signature. */
      signature: (id: string, approvalId: string, signedTransaction: string, kind?: "transaction" | "typed") =>
        call<SendApproveResponse>("POST", `/sends/${id}/signature`, { approvalId, signedTransaction, ...(kind ? { kind } : {}) }),
    },

    /** Every asset the person holds (Arc, other chains, positions), priced; and their show/hide choices. */
    portfolio: {
      get: () => call<{ portfolio: PortfolioView }>("GET", "/portfolio"),
      /** Each network's own total (the network pill's sheet). */
      networks: () => call<NetworkTotalsView>("GET", "/portfolio/networks"),
      setVisibility: (address: string, visibility: "auto" | "shown" | "hidden") =>
        call<{ address: string; visibility: string }>("POST", "/portfolio/visibility", { address, visibility }),
    },
    /** Public market data (guests too): a token's page, its chart, search, and the Markets lists. */
    tokens: {
      get: (chainId: number, address: string) => call<{ token: TokenDetailView }>("GET", `/tokens/${chainId}/${address}`),
      chart: (chainId: number, address: string, range: ChartRange) =>
        call<{ range: ChartRange; candles: Candle[] }>("GET", `/tokens/${chainId}/${address}/chart?range=${range}`),
      search: (query: string, network?: NetworkId) =>
        call<{ results: TokenSearchResult[] }>("GET", `/tokens/search?q=${encodeURIComponent(query)}${network ? `&network=${network}` : ""}`),
      /** The person's own: whether the token is starred, and their trades' profit and loss. */
      mine: (chainId: number, address: string) => call<{ watched: boolean; trades: TokenTradesView | null }>("GET", `/tokens/${chainId}/${address}/mine`),
      watch: (chainId: number, address: string, on: boolean) => call<{ watched: boolean }>("POST", `/tokens/${chainId}/${address}/watch`, { on }),
    },
    markets: {
      list: (segment: MarketSegment, network?: NetworkId) =>
        call<{ market: MarketListView }>("GET", `/markets?segment=${segment}${network ? `&network=${network}` : ""}`),
      watchlist: (network?: NetworkId) => call<{ rows: WatchRow[] }>("GET", `/markets/watchlist${network ? `?network=${network}` : ""}`),
    },
    swaps: {
      /** A swap with a fresh quote; naming one currency is enough when there are two. */
      create: (request: SwapRequest) => call<{ intent: SwapIntent }>("POST", "/swaps", request),
      get: (id: string) => call<{ intent: SwapIntent }>("GET", `/swaps/${id}`),
      /** A new amount or direction, or an empty patch to re-quote. */
      revise: (id: string, patch: SwapRequest) => call<{ intent: SwapIntent }>("PATCH", `/swaps/${id}`, patch),
      cancel: (id: string) => call<{ intent: SwapIntent }>("POST", `/swaps/${id}/cancel`),
      /** Approve one version: the answer carries the one transaction (approve + swap) for the wallet to sign. */
      approve: (id: string, version: number, idempotencyKey?: string, override?: boolean) =>
        call<SwapApproveResponse>("POST", `/swaps/${id}/approve`, { version, ...(override ? { override } : {}) }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signedTransaction: string) =>
        call<SwapApproveResponse>("POST", `/swaps/${id}/signature`, { approvalId, signedTransaction }),
    },

    bridges: {
      /** Where USDC can go from the active network. */
      destinations: () => call<{ destinations: BridgeDestinationView[] }>("GET", "/bridges/destinations"),
      create: (request: BridgeRequest) => call<{ intent: BridgeIntent }>("POST", "/bridges", request),
      get: (id: string) => call<{ intent: BridgeIntent }>("GET", `/bridges/${id}`),
      revise: (id: string, patch: BridgeRequest) => call<{ intent: BridgeIntent }>("PATCH", `/bridges/${id}`, patch),
      cancel: (id: string) => call<{ intent: BridgeIntent }>("POST", `/bridges/${id}/cancel`),
      /** Approve one version: the answer carries the one transaction (approve + burn) for the wallet to sign. */
      approve: (id: string, version: number, idempotencyKey?: string) =>
        call<BridgeApproveResponse>("POST", `/bridges/${id}/approve`, { version }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signedTransaction: string) =>
        call<BridgeApproveResponse>("POST", `/bridges/${id}/signature`, { approvalId, signedTransaction }),
    },

    earn: {
      /** The USDC vaults on the active network, highest yield first, and what the person holds in them. */
      overview: () => call<{ vaults: EarnVaultView[]; positions: EarnPositionView[] }>("GET", "/earn"),
      create: (request: EarnRequest) => call<{ intent: EarnIntent }>("POST", "/earn/intents", request),
      get: (id: string) => call<{ intent: EarnIntent }>("GET", `/earn/intents/${id}`),
      revise: (id: string, patch: EarnRequest) => call<{ intent: EarnIntent }>("PATCH", `/earn/intents/${id}`, patch),
      cancel: (id: string) => call<{ intent: EarnIntent }>("POST", `/earn/intents/${id}/cancel`),
      approve: (id: string, version: number, idempotencyKey?: string) =>
        call<EarnApproveResponse>("POST", `/earn/intents/${id}/approve`, { version }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signedTransaction: string) =>
        call<EarnApproveResponse>("POST", `/earn/intents/${id}/signature`, { approvalId, signedTransaction }),
    },

    automations: {
      list: () => call<{ automations: AutomationView[] }>("GET", "/automations"),
      get: (id: string) => call<{ automation: AutomationView }>("GET", `/automations/${id}`),
      /** A draft: the read-back, the next runs and the most that can ever go per period. Nothing runs yet. */
      create: (input: AutomationInput) => call<{ automation: AutomationView }>("POST", "/automations", input),
      /** Auto-save's draft: what it keeps ready, the vault, and what a check right now would move. */
      autoSave: (input: AutoSaveInput) => call<{ automation: AutomationView }>("POST", "/automations/auto-save", input),
      /** A rule's draft: "when my balance goes above 100, bridge the rest to Base", "save 20% of money from Acme". */
      rule: (input: RuleInput) => call<{ automation: AutomationView }>("POST", "/automations/rule", input),
      /** The same draft checked again on fresh facts after a fix (sign-in, setup, a contact added); nothing turns on. */
      recheck: (id: string) => call<{ automation: AutomationView }>("POST", `/automations/${id}/recheck`),
      /** The grants to sign (typed data) that turn it on; one Face ID, then `activate` with every signature. */
      grant: (id: string) => call<AutomationGrantRequest>("POST", `/automations/${id}/grant`),
      activate: (id: string, signatures: { grantId: string; signature: string }[]) =>
        call<{ automation: AutomationView }>("POST", `/automations/${id}/activate`, { signatures }),
      pause: (id: string) => call<{ automation: AutomationView }>("POST", `/automations/${id}/pause`),
      resume: (id: string) => call<{ automation: AutomationView }>("POST", `/automations/${id}/resume`),
      skip: (id: string) => call<{ automation: AutomationView }>("POST", `/automations/${id}/skip`),
      /** Stops it at once; the answer carries the revoke transaction for the wallet to sign (the grant on chain). */
      cancel: (id: string) =>
        call<{ automation: AutomationView; revoke: RevokeRequest | null }>(
          "POST",
          `/automations/${id}/cancel`,
        ),
    },

    /** Automations 8c: DCA, practice runs, the dry run, editing in place. */
    automationsMore: {
      dca: (input: DcaInput) => call<{ automation: AutomationView }>("POST", "/automations/dca", input),
      practice: (id: string) => call<{ automation: AutomationView }>("POST", `/automations/${id}/practice`),
      simulate: (id: string) => call<SimulationView>("POST", `/automations/${id}/simulate`),
      edit: (id: string, edit: AutomationEdit) => call<AutomationEditResponse>("PATCH", `/automations/${id}`, edit),
      editActivate: (id: string, signatures: { grantId: string; signature: string }[], revoke?: SignedRevokeInput) =>
        call<{ automation: AutomationView }>("POST", `/automations/${id}/edit/activate`, { signatures, revoke }),
    } satisfies AutomationsMoreApi,

    /** Activity everywhere: every token's movements merged with Kawase's own outcomes, with their why. */
    activityFeed: {
      list: (network: NetworkId, token?: string) => call<FeedPage>("GET", `/activity?network=${network}${token ? `&token=${token}` : ""}`),
      runWhy: (runId: string) => call<{ why: WhyView }>("GET", `/activity/why/run/${runId}`),
    } satisfies ActivityFeedApi,

    /** The Needs-you queue: steps automations may not take alone, answered once from anywhere. */
    needsYou: {
      list: () => call<{ items: NeedsYouItem[]; pending: number }>("GET", "/needs-you"),
      get: (id: string) => call<{ item: NeedsYouItem }>("GET", `/needs-you/${id}`),
      approve: (id: string, via?: "app" | "push" | "web" | "chat") => call<NeedsYouApproval>("POST", `/needs-you/${id}/approve`, { via }, { proven: true }),
      decline: (id: string, via?: "app" | "push" | "web" | "chat") => call<{ item: NeedsYouItem }>("POST", `/needs-you/${id}/decline`, { via }),
    } satisfies NeedsYouApi,

    voice: {
      /** Start talking: a LiveKit room and token; pass the thread to continue it, or none for a new one. */
      session: (input: { threadId?: string } = {}) => call<VoiceSession>("POST", "/voice/session", input),
    },

    requests: {
      /** The person's own requests, newest first. */
      list: () => call<{ requests: PaymentRequest[] }>("GET", "/requests"),
      create: (input: PaymentRequestInput) => call<{ request: PaymentRequest }>("POST", "/requests", input),
      get: (id: string) => call<{ request: PaymentRequest }>("GET", `/requests/${id}`),
      cancel: (id: string) => call<{ request: PaymentRequest }>("POST", `/requests/${id}/cancel`),
      /** Ask a Kawase user for an open request in the app (an @handle or a contact's name); the link still works. */
      ask: (id: string, payer: string) => call<{ request: PaymentRequest }>("POST", `/requests/${id}/ask`, { payer }),
      /** Remind the payer: in the app once a day when they were asked there; otherwise "link" (share it again). */
      remind: (id: string) => call<{ request: PaymentRequest; reminded: RequestReminder }>("POST", `/requests/${id}/remind`),
      /** No account needed: what the link shows to whoever opens it. */
      open: (token: string) => call<{ request: PublicPaymentRequest }>("GET", `/r/${encodeURIComponent(token)}`),
    },

    notifications: {
      get: () => call<NotificationSettings>("GET", "/notifications"),
      update: (change: NotificationSettingsChange) => call<NotificationSettings>("PATCH", "/notifications", change),
      /** This phone's Expo push token; null when notifications are turned off here or the person signs out. */
      pushToken: (token: string | null) => call<void>("PUT", "/notifications/push-token", { token }),
    },

    inbox: {
      list: () => call<{ items: InboxItem[]; unread: number }>("GET", "/inbox"),
      read: (id: string) => call<void>("POST", `/inbox/${id}/read`),
      readAll: () => call<void>("POST", "/inbox/read-all"),
    },

    /** Looking back: why one transaction happened, a month's export, the weekly report. */
    /** The fee reserve ("~N actions left") and the display currency's rate. */
    fees: {
      reserve: () => call<{ reserve: FeeReserveView }>("GET", "/fees/reserve"),
      fx: (currency?: string) => call<{ fx: FxView }>("GET", `/fx${currency ? `?currency=${encodeURIComponent(currency)}` : ""}`),
    },

    history: {
      why: (txHash: string, network: NetworkId) => call<{ why: WhyView }>("GET", `/history/why/${txHash}?network=${network}`),
      report: (network: NetworkId, days?: number) => call<{ report: ReportView }>("GET", `/history/report?network=${network}${days ? `&days=${days}` : ""}`),
      /** The file itself (CSV or beancount), with whether the explorer's history was complete for that month. */
      export: async (network: NetworkId, month: string, format: "csv" | "beancount") => {
        const token = await getToken();
        const response = await fetchImpl(`${base}/history/export?network=${network}&month=${month}&format=${format}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new ApiError((await response.json()) as Problem);
        const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? `kawase-${month}.${format === "csv" ? "csv" : "beancount"}`;
        return { body: await response.text(), filename, complete: response.headers.get("x-kawase-complete") !== "false" };
      },
    },

    /** Data & privacy: how long conversations are kept, delete them all, export them. */
    privacy: {
      get: () => call<PrivacySettings>("GET", "/privacy"),
      setRetention: (days: number | null) => call<PrivacySettings>("PATCH", "/privacy", { transcriptRetentionDays: days }),
      deleteTranscripts: () => call<PrivacySettings>("DELETE", "/privacy/transcripts"),
      exportTranscripts: async () => {
        const token = await getToken();
        const response = await fetchImpl(`${base}/privacy/transcripts/export`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
        if (!response.ok) throw new ApiError((await response.json()) as Problem);
        return response.text();
      },
    },

    /** Settings → Account: devices, email, export record, deleting the account. */
    account: {
      devices: () => call<{ devices: DeviceView[] }>("GET", "/account/devices"),
      touchDevice: (input: { name?: string; appVersion?: string }) => call<void>("PATCH", "/account/devices/current", input),
      signOutDevice: (id: string) => call<{ turnkeyPublicKey: string | null }>("POST", `/account/devices/${id}/sign-out`),
      signOutEverywhere: () => call<{ turnkeyPublicKeys: string[] }>("POST", "/account/sign-out-everywhere"),
      syncEmail: () => call<{ email: string | null }>("POST", "/account/email/sync"),
      exportRecorded: () => call<void>("POST", "/account/export/recorded"),
      holdings: () => call<AccountHoldings>("GET", "/account/holdings"),
      revokeAllRequest: (network: NetworkId) =>
        call<{ revoke: RevokeRequest | null }>("POST", "/account/grants/revoke/request", { network }),
      deleteAccount: (confirm: string) => call<AccountDeleted>("POST", "/account/delete", { confirm }, { proven: true }),
    } satisfies AccountApi,

    /** Wallet & limits on the active network: tightening applies at once; loosening returns what to sign. */
    safety: {
      get: () => call<SafetyView>("GET", "/safety"),
      tokens: (address?: string) => call<{ tokens: TokenOption[] }>("GET", `/safety/tokens${address ? `?address=${encodeURIComponent(address)}` : ""}`),
      change: (change: SafetyChange, via?: "app" | "chat" | "voice") => call<SafetyChangeResponse>("POST", "/safety/changes", { change, via }),
      approve: (changeId: string, signature: string, revoke?: SignedRevokeInput) =>
        call<SafetyChangeResponse>("POST", `/safety/changes/${changeId}/approve`, { signature, revoke }),
      pause: () => call<SafetyChangeResponse>("POST", "/safety/changes", { change: { kind: "pause", on: true } }),
      exitKit: () => call<ExitKitResponse>("POST", "/safety/exit-kit"),
    } satisfies SafetyApi,

    /** The x402 marketplace and the Agent wallet page (on the active network). */
    marketplace: {
      services: (query: string, category?: MarketplaceCategory) =>
        call<ServiceSearchResult>("GET", `/marketplace/services?q=${encodeURIComponent(query)}${category ? `&category=${category}` : ""}`),
      wallet: () => call<AgentWalletView>("GET", "/marketplace/agent-wallet"),
      updateSettings: (change: AgentWalletSettingsChange) =>
        call<{ settings: AgentWalletSettings }>("PATCH", "/marketplace/agent-wallet/settings", change),
      /** The marketplace grant to sign once (Face ID): USDC only to the agent wallet, capped per day. */
      grant: () => call<MarketplaceGrantRequest>("POST", "/marketplace/agent-wallet/grant"),
      /** `revoke`: the request's revoke, signed in the same yes (the earlier grant it replaces is turned off on chain first). */
      grantSubmit: (grantId: string, signature: string, revoke?: SignedRevokeInput) =>
        call<{ grantId: string; perDay: string; expiresAt: string }>("POST", "/marketplace/agent-wallet/grant/submit", revoke ? { grantId, signature, revoke } : { grantId, signature }),
      topUp: (amount: string, idempotencyKey?: string) =>
        call<TopUpResult>("POST", "/marketplace/agent-wallet/top-up", { amount }, { idempotencyKey }),
      /** Everything in the agent wallet back to the person's wallet. */
      returnAll: (idempotencyKey?: string) => call<ReturnResult>("POST", "/marketplace/agent-wallet/return", {}, { idempotencyKey }),
      purchases: () => call<{ purchases: PurchaseView[] }>("GET", "/marketplace/purchases"),
      decide: (id: string, decision: "approve" | "decline") =>
        call<{ purchase: PurchaseView }>("POST", `/marketplace/purchases/${id}/decision`, { decision }),
    },

    faucet: {
      /** Whether test money can be claimed now, when next, and what Circle's faucet sends. */
      status: () => call<FaucetStatus>("GET", "/faucet"),
      /** Sends test USDC and EURC to the user's own address on Arc Testnet; once a day. */
      claim: (idempotencyKey?: string) => call<FaucetClaim>("POST", "/faucet/claim", {}, { idempotencyKey }),
    },

    clientEvents: {
      /** A failure seen on the phone, for the api's logs; no account needed. */
      report: (event: ClientEvent) => call<void>("POST", "/client-events", event, { token: "" }),
    },

    ...intelligenceApi(call),
    ...everydayApi(call),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

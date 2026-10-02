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
  TransactionRequestResponse,
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
  PublicPaymentRequest,
  InboxItem,
  NotificationSettings,
  NotificationSettingsChange,
} from "./types";
import type { Candle, ChartRange, MarketListView, MarketSegment, PortfolioView, TokenDetailView, TokenSearchResult } from "./assets";
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
import type { AutomationEdit, AutomationEditResponse, AutomationsMoreApi, DcaInput, NeedsYouApi, NeedsYouApproval, NeedsYouItem, PayrollAutomationInput, SimulationView } from "./automations-8c";
import { railsEndpoints } from "./rails";
import { withdrawEndpoints } from "./withdraw";
import { tokenRulesEndpoints } from "./token-rules";
import type {
  BusinessProfile,
  BusinessProfileInput,
  InvoiceInput,
  InvoicePublicView,
  InvoiceView,
  PayoutCreateResult,
  PayoutLineInput,
  PayoutView,
  PayrollGrantRequest,
  PayrollInput,
  PayrollView,
} from "./business";
import type { PrivacySettings, ReportView, WhyView } from "./history";
import { intelligenceApi } from "./intelligence";
import { everydayApi } from "./everyday";

export * from "./types";
export * from "./agent-types";
export * from "./assets";
export * from "./client-events";
export * from "./marketplace";
export * from "./account";
export * from "./safety";
export * from "./automations-8c";
export * from "./activity-feed";
export * from "./rails";
export * from "./withdraw";
export * from "./token-rules";
export * from "./business";
export * from "./history";
export * from "./intelligence";
export * from "./everyday";

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
};

const HTTP_NO_CONTENT = 204;

export function createApiClient({ baseUrl, getToken, fetch: fetchImpl = fetch }: ApiClientOptions) {
  const base = baseUrl.replace(/\/$/, "");

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    options: {
      idempotencyKey?: string | undefined;
      token?: string | undefined;
      authAttemptId?: string | undefined;
    } = {},
  ): Promise<T> {
    const token = options.token ?? (await getToken());
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    if (options.authAttemptId) headers["x-kawase-auth-attempt"] = options.authAttemptId;
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
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
        call<{ tx: string; setUp: boolean }>(
          "POST",
          "/wallet/setup/submit",
          { network, authorization },
          { idempotencyKey },
        ),
      allowanceRequest: (network: NetworkId, periodAmount?: string) =>
        call<AllowanceRequestResponse>("POST", "/wallet/allowance/request", { network, periodAmount }),
      allowanceSubmit: (grantId: string, signature: string) =>
        call<{ grantId: string; receipt: unknown; expiresAt: string }>("POST", "/wallet/allowance/submit", {
          grantId,
          signature,
        }),
      revokeRequest: (network: NetworkId) =>
        call<TransactionRequestResponse>("POST", "/wallet/allowance/revoke/request", { network }),
      submitTransaction: (requestId: string, signedTransaction: string) =>
        call<{ tx: string; status: "confirmed" | "reverted" }>("POST", "/wallet/transactions/submit", {
          requestId,
          signedTransaction,
        }),
    },

    agent: {
      /** The person's conversations, newest first. */
      threads: () => call<{ threads: ThreadSummary[] }>("GET", "/agent/threads"),
      /** One conversation with its messages (AI SDK UI messages). */
      thread: (id: string) => call<{ thread: ThreadSummary; messages: unknown[] }>("GET", `/agent/threads/${id}`),
      deleteThread: (id: string) => call<void>("DELETE", `/agent/threads/${id}`),
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
      changeAddress: (id: string, input: { address: string; source?: AddressSource }) =>
        call<{ contact: Contact }>("POST", `/contacts/${id}/address`, input),
      cancelChange: (id: string) => call<{ contact: Contact }>("DELETE", `/contacts/${id}/address/pending`),
      remove: (id: string) => call<void>("DELETE", `/contacts/${id}`),
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
        call<SendApproveResponse>("POST", `/sends/${id}/approve`, { version, ...(override ? { override } : {}) }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signedTransaction: string) =>
        call<SendApproveResponse>("POST", `/sends/${id}/signature`, { approvalId, signedTransaction }),
    },

    /** Every asset the person holds (Arc, other chains, positions), priced; and their show/hide choices. */
    portfolio: {
      get: () => call<{ portfolio: PortfolioView }>("GET", "/portfolio"),
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
    },
    markets: {
      list: (segment: MarketSegment, network?: NetworkId) =>
        call<{ market: MarketListView }>("GET", `/markets?segment=${segment}${network ? `&network=${network}` : ""}`),
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
        call<{ automation: AutomationView; revoke: TransactionRequestResponse | null }>(
          "POST",
          `/automations/${id}/cancel`,
        ),
    },

    /** Automations 8c: payroll, DCA, practice runs, the dry run, editing in place. */
    automationsMore: {
      payroll: (input: PayrollAutomationInput) => call<{ automation: AutomationView }>("POST", "/automations/payroll", input),
      dca: (input: DcaInput) => call<{ automation: AutomationView }>("POST", "/automations/dca", input),
      practice: (id: string) => call<{ automation: AutomationView }>("POST", `/automations/${id}/practice`),
      simulate: (id: string) => call<SimulationView>("POST", `/automations/${id}/simulate`),
      edit: (id: string, edit: AutomationEdit) => call<AutomationEditResponse>("PATCH", `/automations/${id}`, edit),
      editActivate: (id: string, signatures: { grantId: string; signature: string }[]) =>
        call<{ automation: AutomationView }>("POST", `/automations/${id}/edit/activate`, { signatures }),
    } satisfies AutomationsMoreApi,

    /** Activity everywhere: every token's movements merged with Kawase's own outcomes, with their why. */
    activityFeed: {
      list: (network: NetworkId) => call<FeedPage>("GET", `/activity?network=${network}`),
      runWhy: (runId: string) => call<{ why: WhyView }>("GET", `/activity/why/run/${runId}`),
    } satisfies ActivityFeedApi,

    /** The Needs-you queue: steps automations may not take alone, answered once from anywhere. */
    needsYou: {
      list: () => call<{ items: NeedsYouItem[]; pending: number }>("GET", "/needs-you"),
      get: (id: string) => call<{ item: NeedsYouItem }>("GET", `/needs-you/${id}`),
      approve: (id: string, via?: "app" | "push" | "web" | "chat") => call<NeedsYouApproval>("POST", `/needs-you/${id}/approve`, { via }),
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

    /** Business mode: profile, invoices (paid through their link, matched by an on-chain Memo reference), payouts, payroll. */
    business: {
      profile: () => call<{ profile: BusinessProfile | null }>("GET", "/business/profile"),
      saveProfile: (input: BusinessProfileInput) => call<{ profile: BusinessProfile }>("PUT", "/business/profile", input),
      invoices: () => call<{ invoices: InvoiceView[] }>("GET", "/business/invoices"),
      createInvoice: (input: InvoiceInput) => call<{ invoice: InvoiceView }>("POST", "/business/invoices", input),
      invoice: (id: string) => call<{ invoice: InvoiceView }>("GET", `/business/invoices/${id}`),
      cancelInvoice: (id: string) => call<{ invoice: InvoiceView }>("POST", `/business/invoices/${id}/cancel`),
      /** No account needed: what the client sees on the link. */
      publicInvoice: (token: string) => call<{ invoice: InvoicePublicView }>("GET", `/invoices/public/${encodeURIComponent(token)}`),
      /** The printable invoice (HTML) for a PDF or a browser. */
      documentUrl: (token: string) => `${base}/invoices/public/${encodeURIComponent(token)}/document`,
      payouts: () => call<{ payouts: PayoutView[] }>("GET", "/business/payouts"),
      createPayout: (input: { asset: "USDC" | "EURC"; lines: PayoutLineInput[] }) => call<PayoutCreateResult>("POST", "/business/payouts", input),
      signPayout: (id: string) => call<TransactionRequestResponse>("POST", `/business/payouts/${id}/sign`),
      submitPayout: (id: string, requestId: string, signedTransaction: string) =>
        call<{ payout: PayoutView }>("POST", `/business/payouts/${id}/submit`, { requestId, signedTransaction }),
      payrolls: () => call<{ payrolls: PayrollView[] }>("GET", "/business/payroll"),
      createPayroll: (input: PayrollInput) => call<{ payroll: PayrollView }>("POST", "/business/payroll", input),
      payrollGrant: (id: string) => call<PayrollGrantRequest>("POST", `/business/payroll/${id}/grant`),
      activatePayroll: (id: string, lines: { automationId: string; signatures: { grantId: string; signature: string }[] }[]) =>
        call<{ payroll: PayrollView }>("POST", `/business/payroll/${id}/activate`, { lines }),
      changePayroll: (id: string, change: "pause" | "resume" | "cancel") =>
        call<{ payroll: PayrollView }>("POST", `/business/payroll/${id}/change`, { change }),
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
        call<{ revoke: TransactionRequestResponse | null }>("POST", "/account/grants/revoke/request", { network }),
      deleteAccount: (confirm: string) => call<AccountDeleted>("POST", "/account/delete", { confirm }),
    } satisfies AccountApi,

    /** Wallet & limits on the active network: tightening applies at once; loosening returns what to sign. */
    safety: {
      get: () => call<SafetyView>("GET", "/safety"),
      tokens: (address?: string) => call<{ tokens: TokenOption[] }>("GET", `/safety/tokens${address ? `?address=${encodeURIComponent(address)}` : ""}`),
      change: (change: SafetyChange, via?: "app" | "chat" | "voice") => call<SafetyChangeResponse>("POST", "/safety/changes", { change, via }),
      approve: (changeId: string, signature: string) => call<SafetyChangeResponse>("POST", `/safety/changes/${changeId}/approve`, { signature }),
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
      grantSubmit: (grantId: string, signature: string) =>
        call<{ grantId: string; perDay: string; expiresAt: string }>("POST", "/marketplace/agent-wallet/grant/submit", { grantId, signature }),
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

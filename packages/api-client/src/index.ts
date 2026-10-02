// A small, explicit client: one function per route, problem+json turned into `ApiError`, the session token
// supplied by the caller (secure storage on native, a cookie or storage on web).
import type {
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

export * from "./types";
export * from "./agent-types";
export * from "./marketplace";

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
    health: () => call<{ ok: boolean; networks: NetworkId[] }>("GET", "/health"),
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
            | "riskMode"
            | "practiceMode"
            | "handle"
          >
        > & { handlePrompted?: true },
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
      approve: (id: string, version: number, idempotencyKey?: string) =>
        call<SendApproveResponse>("POST", `/sends/${id}/approve`, { version }, { idempotencyKey }),
      signature: (id: string, approvalId: string, signedTransaction: string) =>
        call<SendApproveResponse>("POST", `/sends/${id}/signature`, { approvalId, signedTransaction }),
    },

    swaps: {
      /** A swap with a fresh quote; naming one currency is enough when there are two. */
      create: (request: SwapRequest) => call<{ intent: SwapIntent }>("POST", "/swaps", request),
      get: (id: string) => call<{ intent: SwapIntent }>("GET", `/swaps/${id}`),
      /** A new amount or direction, or an empty patch to re-quote. */
      revise: (id: string, patch: SwapRequest) => call<{ intent: SwapIntent }>("PATCH", `/swaps/${id}`, patch),
      cancel: (id: string) => call<{ intent: SwapIntent }>("POST", `/swaps/${id}/cancel`),
      /** Approve one version: the answer carries the one transaction (approve + swap) for the wallet to sign. */
      approve: (id: string, version: number, idempotencyKey?: string) =>
        call<SwapApproveResponse>("POST", `/swaps/${id}/approve`, { version }, { idempotencyKey }),
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

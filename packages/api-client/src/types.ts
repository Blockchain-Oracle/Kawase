// Shapes the api returns. Kept by hand next to the routes in apps/api; a test there compares them.
export type NetworkId = "mainnet" | "testnet";

export type ApiUser = {
  id: string;
  email: string | null;
  /** The public @handle, without the @; null until the user picks one. */
  handle: string | null;
  /** The optional handle step was answered (saved or skipped); absent on users cached before it existed. */
  handlePrompted?: boolean;
  isGuest: boolean;
  locale: string;
  replyLanguage: string | null;
  displayCurrency: string;
  timezone: string;
  theme: "system" | "light" | "dark";
  activeNetwork: NetworkId;
  riskMode: "careful" | "balanced" | "autonomous";
  practiceMode: boolean;
  turnkeySubOrganizationId: string | null;
  /** Settings → Voice (defaults filled in by the api); absent on users cached before it existed. */
  voicePrefs?: VoicePrefs;
};

/** GPT-Live's voices, the speaking pace and whether Kawase greets first (the same shape as @kawase/config's). */
export type VoicePrefs = {
  voice: "marin" | "aster" | "beacon" | "cinder" | "stone" | "vesper";
  speed: "relaxed" | "normal" | "brisk";
  autoSpeak: boolean;
};

export type DeviceInfo = {
  platform: "ios" | "android" | "web" | "desktop";
  installationId: string;
  appVersion?: string;
  locale?: string;
};

export type SignInResponse = { token: string; user: ApiUser };

export type StampedProof = { body: string; stamp: string };

export type ConsentKind = "terms" | "mainnet_real_money" | "meme_risk" | "marketplace_risk" | "voice_retention";
export type Consent = { kind: ConsentKind; version: string; acceptedAt: string };

export type CapabilityState = "available" | "coming" | "unavailable";
export type Capabilities = Record<string, Record<NetworkId, { state: CapabilityState; reason?: string }>>;

export type GrantReceipt = {
  wallet: string;
  redeemer: string;
  token?: string;
  amountPerPeriod?: string;
  periodSeconds?: number;
  startsAt?: number;
  expiresAt?: number;
  targets: string[];
  methods: string[];
  recipient?: string;
  maxNativeValue?: string;
  redeemers: string[];
  unknownCaveats: string[];
};

export type WalletNetworkStatus = {
  setUp: boolean;
  setupAt: string | null;
  usdcBalance: string;
  /** Base units (6 decimals), like `usdcBalance`. */
  eurcBalance: string;
  allowance: { id: string; receipt: GrantReceipt; expiresAt: string } | null;
};

export type WalletStatus = { address?: string; networks: Partial<Record<NetworkId, WalletNetworkStatus>> };

export type AuthorizationRequest = { contractAddress: `0x${string}`; chainId: number; nonce: number };
export type SignedAuthorizationInput = {
  address: string;
  chainId: number;
  nonce: number;
  r: string;
  s: string;
  yParity: number;
};

export type SetupRequestResponse =
  { alreadySetUp: true } | { alreadySetUp: false; authorization: AuthorizationRequest };

export type TypedDataPayload = {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type AllowanceRequestResponse = { grantId: string; typedData: TypedDataPayload; receipt: GrantReceipt };

export type UnsignedTransaction = {
  type: "eip1559";
  chainId: number;
  nonce: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
};

export type TransactionRequestResponse = { requestId: string; transaction: UnsignedTransaction; grantId?: string };

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  [extra: string]: unknown;
};

export type HandleAvailability =
  | { handle: string; available: true }
  | { handle: string; available: false; reason: "too_short" | "too_long" | "invalid" | "reserved" | "taken" };

export type FaucetStatus = {
  network: NetworkId;
  eligible: boolean;
  /** When the next claim opens, after a successful one. */
  nextAt: string | null;
  /** Base units per asset ("USDC", "EURC"). */
  amounts: Record<string, string>;
  /** Circle's own faucet, for when the in-app drip is refused. */
  fallbackUrl: string;
};

export type FaucetClaim = { status: "sent"; amounts: Record<string, string>; address: string; nextAt: string };

export type ActivityItem = {
  id: string;
  network: NetworkId;
  direction: "in" | "out";
  asset: "USDC" | "EURC";
  /** Base units (6 decimals). */
  amount: string;
  counterparty: string;
  /** Who the counterparty is, when Kawase knows: its own wallets, Circle's faucet, or the user's own address. */
  counterpartyLabel: "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | "swap" | "bridge" | "earn" | null;
  /** The person's own name for the counterparty, when its address is in their contacts. */
  contactName?: string | null;
  /** A swap: this item is what came in, and `swap` is what went out for it in the same transaction. */
  swap?: { asset: "USDC" | "EURC"; amount: string } | null | undefined;
  /** A bridge out of Arc: the chain the USDC went to. */
  bridge?: { chainId: number } | null | undefined;
  /** A move into or out of an earn vault. */
  earn?: { action: "deposit" | "withdraw"; vault: string } | null | undefined;
  txHash: string;
  at: string;
  explorerUrl: string;
};

/** One page of history: the newest movements, whether older ones exist, and the explorer page that has them all. */
export type ActivityPage = { items: ActivityItem[]; more: boolean; historyUrl: string | null };

export type ThreadSummary = { id: string; title: string | null; network: NetworkId; lastMessageAt: string };

// ── Contacts and sends (Stage 5) ────────────────────────────────────────────────────────────────────────────

export type AddressSource = "typed" | "pasted" | "scanned" | "handle" | "received" | "agent";
export type ContactAddressStatus = "pending_cooldown" | "active" | "retired" | "blocked";

export type ContactAddress = {
  id: string;
  address: string;
  version: number;
  status: ContactAddressStatus;
  source: AddressSource;
  sourceDetail: string | null;
  /** When a changed address becomes payable. */
  activatesAt: string | null;
  createdAt: string;
  /** Per network: whether it was paid, how often, and how it was verified. */
  trust: Partial<Record<NetworkId, { paymentCount: number; lastPaidAt: string | null; verifiedMethod: string | null }>>;
};

export type Contact = {
  id: string;
  displayName: string;
  aliases: string[];
  handle: string | null;
  kind: "person" | "business";
  label: string | null;
  notes: string | null;
  /** The address money goes to now (null while a change is on hold). */
  address: string | null;
  /** Set while a changed address waits out its cooldown; payments to the contact are frozen until then. */
  pendingChange: { address: string; activatesAt: string } | null;
  addresses: ContactAddress[];
  createdAt: string;
};

export type ContactInput = {
  displayName: string;
  /** An 0x address or an @handle. */
  address: string;
  source?: AddressSource | undefined;
  kind?: "person" | "business" | undefined;
  label?: string | null | undefined;
  notes?: string | null | undefined;
  aliases?: string[] | undefined;
};

/** A match for the recipient search: a saved contact or a Kawase @handle. */
export type RecipientMatch =
  | { kind: "contact"; contactId: string; name: string; handle: string | null; address: string | null; onHold: boolean }
  | { kind: "handle"; handle: string; address: string };

export type PolicyKind = "error" | "policy" | "precondition" | "clarification" | "warning";
export type PolicyResultView = { code: string; kind: PolicyKind; params?: Record<string, string> };

export type IntentState =
  | "submitted"
  | "working"
  | "input_required"
  | "auth_required"
  | "ready_for_approval"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "rejected"
  | "canceled"
  | "expired"
  | "unknown_outcome";

/**
 * How a send ended, in money terms (the money-ending taxonomy): sent and confirmed; not sent (nothing left the
 * wallet); reverted (on chain but undone; only a fee may have been paid); checking (the outcome is not known yet
 * and nothing is retried); canceled; expired.
 */
export type SendOutcome = "sent" | "not_sent" | "reverted" | "checking" | "canceled" | "expired";

export type SendRecipientView = {
  via: "contact" | "handle" | "address";
  address: string;
  name: string | null;
  handle: string | null;
  contactId: string | null;
  /** How the address reached the book ("scanned", "handle"…), for the trust chip. */
  source: AddressSource | null;
  verifiedMethod: string | null;
  paidBefore: boolean;
};

export type SendDraftView = {
  recipient: SendRecipientView;
  asset: "USDC" | "EURC";
  /** Base units (6 decimals). */
  amount: string;
  note: string | null;
  /** Who pays the network fee, and about how much (USDC base units, 6 decimals). */
  fee: { payer: "kawase" | "wallet"; estimate: string | null };
};

export type SendIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  version: number;
  /** The person's own words for each field. */
  request: { recipient: string | null; amount: string | null; asset: "USDC" | "EURC" | null; note: string | null };
  draft: SendDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  route: "allowance" | "wallet_signature" | null;
  allowance: { active: boolean; available: string; perPeriod: string | null };
  /** For an unknown name: Kawase handles that match it exactly; never chosen for the person. */
  suggestions: RecipientMatch[];
  tx: { hash: string; explorerUrl: string } | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type SendRequest = {
  /** Paying a payment request: its link token. The send must match the request (recipient, asset, amount). */
  requestToken?: string | null | undefined;
  recipient?: string | null | undefined;
  amount?: string | null | undefined;
  asset?: "USDC" | "EURC" | null | undefined;
  note?: string | null | undefined;
};

export type SendApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: SendIntent }
  | { status: "sign"; intent: SendIntent; approvalId: string; transaction: UnsignedTransaction };

// ── Swaps (Stage 6) ─────────────────────────────────────────────────────────────────────────────────────────

/** What a swap's numbers looked like when drafted. Amounts are base units of their own token. */
export type SwapDraftView = {
  tokenIn: "USDC" | "EURC";
  tokenOut: "USDC" | "EURC";
  amountIn: string;
  /** What the route expects to deliver. */
  estimatedOut: string;
  /** The least it may deliver; the swap reverts below this. */
  minOut: string;
  slippageBps: number;
  /** tokenOut per one tokenIn, from the quote, as a decimal string. */
  rate: string;
  /** The same from Circle's market prices, when known. */
  marketRate: string | null;
  /** How far the quote is under the market rate, in basis points (negative when better). */
  rateGapBps: number | null;
  /** Route fees in base units of tokenIn, and the network fee estimate in USDC base units. */
  fees: { route: string; network: string | null };
  /** Who quoted it ("Circle App Kit") and when. */
  provider: string;
  quotedAt: string;
};

export type SwapIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  version: number;
  request: { tokenIn: "USDC" | "EURC" | null; tokenOut: "USDC" | "EURC" | null; amount: string | null };
  draft: SwapDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  /** What actually arrived, from the receipt, once it is done. */
  received: string | null;
  tx: { hash: string; explorerUrl: string } | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type SwapRequest = {
  tokenIn?: "USDC" | "EURC" | null | undefined;
  tokenOut?: "USDC" | "EURC" | null | undefined;
  /** Decimal amount of tokenIn. */
  amount?: string | null | undefined;
};

export type SwapApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: SwapIntent }
  | { status: "sign"; intent: SwapIntent; approvalId: string; transaction: UnsignedTransaction };

// ── Bridges (Stage 6b) ──────────────────────────────────────────────────────────────────────────────────────

export type BridgeDestinationId = "base" | "ethereum" | "arbitrum" | "optimism" | "polygon" | "avalanche";

/** A chain USDC can be bridged to from the active network (testnet chains on testnet). */
export type BridgeDestinationView = { id: BridgeDestinationId; chainId: number; name: string };

export type BridgeDraftView = {
  destination: BridgeDestinationId;
  chainId: number;
  /** Base units of USDC burned on Arc. */
  amount: string;
  /** The most the route takes on the way, and so the least that arrives. */
  maxRouteFee: string;
  minReceived: string;
  /** The network fee on Arc, USDC base units, estimated. */
  networkFee: string | null;
  recipient: string;
  /** Who moves it ("Circle CCTP · App Kit") and the routes considered with why this one. */
  provider: string;
  /** `reason`: quote_only (Kawase does not execute this provider yet), no_quote, timeout, not_on_arc_testnet, not_on_arc. */
  routes: { provider: string; status: "chosen" | "quoted" | "unavailable"; received: string | null; reason: "quote_only" | "no_quote" | "timeout" | "not_on_arc_testnet" | "not_on_arc" | null }[];
  quotedAt: string;
};

/** Where a bridge is after the yes: burning on Arc, waiting for Circle's attestation, minting, delivered. */
export type BridgeStage = "burning" | "attesting" | "minting" | "delivered";

export type BridgeIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  version: number;
  request: { destination: BridgeDestinationId | null; amount: string | null };
  draft: BridgeDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  stage: BridgeStage | null;
  /** What arrived on the destination, from its mint, once delivered. */
  received: string | null;
  tx: { hash: string; explorerUrl: string } | null;
  mintTx: { hash: string; explorerUrl: string } | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type BridgeRequest = {
  destination?: BridgeDestinationId | null | undefined;
  /** Decimal USDC. */
  amount?: string | null | undefined;
};

export type BridgeApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: BridgeIntent }
  | { status: "sign"; intent: BridgeIntent; approvalId: string; transaction: UnsignedTransaction };

// ── Earn (Stage 6c) ─────────────────────────────────────────────────────────────────────────────────────────

/** A USDC vault App Kit lists on the active network. Amounts are decimal USDC; yields are fractions (0.042 = 4.2%). */
export type EarnVaultView = {
  address: string;
  name: string;
  protocol: string;
  apy: number;
  apy30d: number | null;
  totalDeposits: string;
  available: string;
  status: string;
  curator: string | null;
  circleGuarded: boolean;
  warnings: string[];
};

/** What the person holds in one vault: base units of USDC it is worth now. */
export type EarnPositionView = { vault: string; name: string; apy: number; assets: string; shares: string };

export type EarnDraftView = {
  action: "deposit" | "withdraw";
  vault: EarnVaultView;
  /** USDC base units asked for. */
  amount: string;
  /** For a withdrawal, the least USDC that comes back; for a deposit, what the shares are worth at least. */
  minReceived: string;
  /** What the position is worth after this, in USDC base units, at today's rate. */
  positionAfter: string;
  /** About a year's yield on the position after this, at the current rate. */
  yearlyEarnings: string;
  networkFee: string | null;
  quotedAt: string;
};

export type EarnIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  version: number;
  request: { action: "deposit" | "withdraw"; vault: string | null; amount: string | null };
  draft: EarnDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  /** What arrived (shares' worth for a deposit, USDC for a withdrawal), base units of USDC, once done. */
  received: string | null;
  tx: { hash: string; explorerUrl: string } | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type EarnRequest = {
  action?: "deposit" | "withdraw" | undefined;
  /** A vault address; without one Kawase picks the highest-yield active vault (a deposit) or the person's position (a withdrawal). */
  vault?: string | null | undefined;
  /** Decimal USDC. */
  amount?: string | null | undefined;
};

export type EarnApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: EarnIntent }
  | { status: "sign"; intent: EarnIntent; approvalId: string; transaction: UnsignedTransaction };

// ── Automations (Stage 8) ───────────────────────────────────────────────────────────────────────────────────

export type AutomationSchedule = {
  every: "day" | "week" | "month";
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  weekday?: number | undefined;
  /** 1–28, for monthly. */
  monthday?: number | undefined;
  /** "HH:MM" local to `timezone`. */
  time: string;
  timezone: string;
};

export type AutomationRunView = {
  id: string;
  scheduledFor: string;
  status: "pending" | "executing" | "succeeded" | "skipped" | "failed";
  /** Why it was skipped or failed (a policy reason code) and its display values. */
  reason: string | null;
  reasonParams: Record<string, string> | null;
  /** Auto-save: what the run moved, into savings ("in") or back to the wallet ("out"), in USDC base units. */
  move: { direction: "in" | "out"; amount: string } | null;
  /** A rule's run: what triggered it and what it decided (USDC base units as strings). */
  trigger: Record<string, string> | null;
  tx: { hash: string; explorerUrl: string } | null;
};

/** Auto-save: keep `keep` ready in the wallet; above it goes into the person's own position in one vault, below it comes back. */
export type AutoSaveView = {
  vault: string;
  vaultName: string;
  /** The vault's protocol ("morpho"), for its mark. */
  protocol: string;
  /** Yearly yield now, e.g. 0.042. */
  apy: number;
  /** USDC base units kept ready in the wallet. */
  keep: string;
  /** Refill the wallet from savings when it drops below `keep`. */
  topUp: boolean;
  /** In savings now (USDC base units). */
  saved: string;
  /** What a check right now would move, if anything. */
  now: { direction: "in" | "out"; amount: string } | null;
};

/** A rule (review A1): a trigger, an amount rule and one supported step, each shown to the person in words. */
export type RuleView = {
  trigger:
    | { type: "balance_above" | "balance_below"; threshold: string }
    | { type: "money_in"; minAmount: string | null; from: string | null; fromName: string | null };
  amount: { mode: "fixed"; amount: string } | { mode: "excess"; reserve: string } | { mode: "percent"; percent: number };
  step:
    | { type: "bridge"; destination: string; destinationName: string; chainId: number }
    | { type: "save"; vault: string; vaultName: string; protocol: string; apy: number }
    | { type: "notify" };
  /** Balance triggers: whether the next crossing fires. */
  armed: boolean;
  /** The wallet's USDC now (base units). */
  balance: string;
  /** What a check right now would do (balance triggers), or null. */
  now: { amount: string | null } | null;
};

export type AutomationView = {
  id: string;
  network: NetworkId;
  status: "draft" | "active" | "paused" | "canceled" | "ended";
  kind: "scheduled_send" | "auto_save" | "rule";
  schedule: AutomationSchedule;
  /** Auto-save only. */
  save: AutoSaveView | null;
  /** A rule only. */
  rule: RuleView | null;
  /** A scheduled send only. */
  action: {
    recipientWords: string;
    recipientAddress: string | null;
    recipientName: string | null;
    asset: "USDC" | "EURC";
    /** Base units per run. */
    amount: string;
    note: string | null;
  } | null;
  /** The next few runs (ISO), while it is a draft or on. */
  nextRuns: string[];
  /** The most that can ever leave per period, enforced on chain by the grant, and the period. */
  maxPerPeriod: string;
  periodSeconds: number;
  endsAt: string;
  grant: { id: string; status: string; expiresAt: string } | null;
  runs: AutomationRunView[];
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  createdAt: string;
};

export type AutomationInput = {
  /** As the person said it: a contact's name, an @handle, or an address they typed. */
  recipient: string;
  /** Decimal amount per run. */
  amount: string;
  asset?: "USDC" | "EURC" | undefined;
  every: "day" | "week" | "month";
  weekday?: number | undefined;
  monthday?: number | undefined;
  /** "HH:MM"; 09:00 when not said. */
  time?: string | undefined;
  /** IANA zone; the person's own when not said. */
  timezone?: string | undefined;
  note?: string | null | undefined;
};

export type AutoSaveInput = {
  /** Decimal USDC to keep ready in the wallet; Kawase's default when not said. */
  keep?: string | undefined;
  /** A vault from the earn overview; the best one (or the one already used) when not said. */
  vault?: string | undefined;
  /** Refill the wallet from savings when it drops below `keep` (on unless the person said not to). */
  topUp?: boolean | undefined;
  every?: "day" | "week" | "month" | undefined;
  time?: string | undefined;
  timezone?: string | undefined;
};

/** A rule as asked (the model passes the person's words; Kawase resolves and checks them). */
export type RuleInput = {
  trigger: "balance_above" | "balance_below" | "money_in";
  /** Decimal USDC: the balance line, for balance triggers. */
  threshold?: string | undefined;
  /** Money in: only from this contact, @handle or typed address; and/or at least this much (decimal USDC). */
  from?: string | undefined;
  minAmount?: string | undefined;
  action: "bridge" | "save" | "notify";
  /** Bridge: the chain to bridge to (to the person's own address there). */
  destination?: "base" | "ethereum" | "arbitrum" | "optimism" | "polygon" | "avalanche" | undefined;
  /** Save: a vault from the earn overview; the one they use, else the best, when not said. */
  vault?: string | undefined;
  /** How much each time: a fixed amount, what is above a reserve (balance above), or a share of the money in. */
  amountMode?: "fixed" | "excess" | "percent" | undefined;
  amount?: string | undefined;
  reserve?: string | undefined;
  percent?: number | undefined;
};

/** The grants that turn an automation on: one for a scheduled send, three for Auto-save; one Face ID signs them all. */
export type AutomationGrantRequest = { grants: { grantId: string; typedData: unknown }[]; receipts: unknown[] };

// ── Payment requests and the inbox (Stage 5b) ───────────────────────────────────────────────────────────────

export type PaymentRequestStatus = "open" | "paid" | "canceled" | "expired";

/** A request the person made: share `link`; it is marked paid by the send that paid it or by a matching incoming transfer. */
export type PaymentRequest = {
  id: string;
  /** The public id in the link (`/r/{token}`). */
  token: string;
  link: string;
  network: NetworkId;
  asset: "USDC" | "EURC";
  /** Base units (6 decimals). */
  amount: string;
  /** Shown to the payer; never written on the chain. */
  note: string | null;
  status: PaymentRequestStatus;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  paidTx: { hash: string; explorerUrl: string } | null;
  /** Who paid, when known: a Kawase @handle / contact name, or just the address. */
  paidBy: { address: string; name: string | null } | null;
};

export type PaymentRequestInput = { amount: string; asset: "USDC" | "EURC"; note?: string | null | undefined };

/** What anyone with the link sees (no account needed): who asks, how much, on which network. */
export type PublicPaymentRequest = {
  token: string;
  network: NetworkId;
  asset: "USDC" | "EURC";
  amount: string;
  note: string | null;
  status: PaymentRequestStatus;
  expiresAt: string;
  requester: { handle: string | null; address: string };
};

export type InboxKind = "payment_received" | "request_paid" | "send_completed" | "automation_skipped" | "rule_alert";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  network: NetworkId;
  /** Display values for the item's words: amount (base units), asset, from/to address, name, note. */
  params: Record<string, string>;
  requestId: string | null;
  intentId: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
  readAt: string | null;
};

// ── Voice (Stage 10) ────────────────────────────────────────────────────────────────────────────────────────────

/** A voice session: the LiveKit room to join with this token (Kawase's voice worker is dispatched into it), and the thread the conversation is saved in (the same one chat shows). */
export type VoiceSession = { url: string; token: string; room: string; threadId: string };

export type NotificationChannel = "push" | "email";
/** Per event and channel (the same shape as @kawase/config's NotificationPrefs). */
export type NotificationPrefs = Partial<Record<InboxKind, Partial<Record<NotificationChannel, boolean>>>>;
/** "HH:MM" in the person's time zone; the end may be the next day. */
export type QuietHours = { start: string; end: string };

/** Settings → Notifications (Stage 9). `prefs` holds only what the person changed; the rest follows the defaults. */
export type NotificationSettings = {
  prefs: NotificationPrefs;
  quietHours: QuietHours | null;
  /** Where emails go; null for a guest or an account without an email. */
  email: string | null;
  /** Whether the api can send email yet. */
  emailEnabled: boolean;
  /** Whether this phone has a push token on file. */
  pushRegistered: boolean;
};
export type NotificationSettingsChange = { prefs?: NotificationPrefs; quietHours?: QuietHours | null };

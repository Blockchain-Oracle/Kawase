// A small, explicit client: one function per route, problem+json turned into `ApiError`, the session token
// supplied by the caller (secure storage on native, a cookie or storage on web).
import type {
  AllowanceRequestResponse,
  ApiUser,
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
} from "./types";

export * from "./types";

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
    options: { idempotencyKey?: string | undefined; token?: string | undefined } = {},
  ): Promise<T> {
    const token = options.token ?? (await getToken());
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
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
      nonce: () => call<{ nonce: string; expiresAt: string }>("POST", "/auth/nonce"),
      guest: (input: { device: DeviceInfo; locale?: string }) => call<SignInResponse>("POST", "/auth/guest", input),
      /** With a guest token, the guest is upgraded or merged into the account. */
      turnkey: (input: { proof: StampedProof; turnkeyUserId: string; device: DeviceInfo }, guestToken?: string) =>
        call<SignInResponse>("POST", "/auth/turnkey", input, guestToken ? { token: guestToken } : {}),
      signOut: () => call<void>("POST", "/auth/sign-out"),
    },

    me: {
      get: () => call<{ user: ApiUser; availableNetworks: NetworkId[] }>("GET", "/me"),
      update: (
        settings: Partial<
          Pick<
            ApiUser,
            "locale" | "replyLanguage" | "displayCurrency" | "timezone" | "theme" | "riskMode" | "practiceMode"
          >
        >,
      ) => call<{ user: ApiUser }>("PATCH", "/me", settings),
      setNetwork: (network: NetworkId) => call<{ user: ApiUser }>("PUT", "/me/network", { network }),
      consents: () => call<{ consents: Consent[] }>("GET", "/me/consents"),
      consent: (input: { kind: ConsentKind; version: string; locale: string }) =>
        call<{ consents: Consent[] }>("POST", "/me/consents", input),
    },

    wallet: {
      status: () => call<WalletStatus>("GET", "/wallet"),
      register: (input: { address: string; walletId: string }) =>
        call<{ wallet: { id: string; address: string } }>("POST", "/wallet", input),
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

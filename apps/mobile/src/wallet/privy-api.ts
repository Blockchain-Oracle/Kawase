// The api's Privy sign-in endpoints (D41), called the way @kawase/api-client calls everything else (problem+json errors
// become ApiError), until the shared client carries them. Tokens go in the body, never in cookies or the URL.
import { ApiError, type ApiUser, type DeviceInfo } from "@kawase/api-client";

import { API_URL } from "@/session/api";
import { sessionStorage } from "@/session/storage";

export type PrivyTokens = { accessToken: string; identityToken?: string | undefined };
type RegisteredWallet = { id: string; address: string };

const HTTP_NO_CONTENT = 204;

async function post<T>(path: string, body: unknown, options: { token?: string | undefined; authAttemptId?: string | undefined } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  const token = options.token ?? (await sessionStorage.getToken());
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.authAttemptId) headers["x-kawase-auth-attempt"] = options.authAttemptId;
  const response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (response.status === HTTP_NO_CONTENT) return undefined as T;
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) throw new ApiError(parsed as ConstructorParameters<typeof ApiError>[0]);
  return parsed as T;
}

export const privyApi = {
  /** Signs in (or upgrades the guest whose token is sent); registers the wallet the identity token names. */
  signIn: (input: PrivyTokens & { device: DeviceInfo }, guestToken?: string, authAttemptId?: string) =>
    post<{ token: string; user: ApiUser; wallet: RegisteredWallet | null }>("/auth/privy", input, { token: guestToken, authAttemptId }),
  /** Registers a wallet created after sign-in, from fresh tokens for the same Privy identity. */
  registerWallet: (input: PrivyTokens, authAttemptId?: string) =>
    post<{ wallet: RegisteredWallet }>("/auth/privy/wallet", input, { authAttemptId }),
  /** After the email changed at Privy: Kawase follows the verified address. */
  syncEmail: (input: PrivyTokens) => post<{ email: string | null }>("/auth/privy/sync", input),
};

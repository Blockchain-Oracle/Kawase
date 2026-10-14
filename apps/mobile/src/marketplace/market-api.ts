// The marketplace screen's two calls that the shared api client does not carry yet (`POST /marketplace/inspect` and
// `/marketplace/try`, apps/api/src/marketplace/routes.ts): the same base URL, the same session token and the same
// problem errors as `api`, so a screen cannot tell the difference. When @kawase/api-client gains them, this file goes.
import { ApiError, type BuyOutcome, type BuyServiceInput, type InspectServiceResult, type Problem } from "@kawase/api-client";

import { API_URL } from "@/session/api";
import { sessionStorage } from "@/session/storage";

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await sessionStorage.getToken();
  const response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) throw new ApiError(parsed as Problem);
  return parsed as T;
}

export const marketApi = {
  /** The seller's live price for one listed call (its 402 asked now); nothing is paid. */
  inspect: (input: BuyServiceInput) => post<InspectServiceResult>("/marketplace/inspect", input),
  /** One paid call from the agent wallet, under the person's caps. `tryId` makes a second tap the same call. */
  try: (input: BuyServiceInput & { tryId: string }) => post<BuyOutcome>("/marketplace/try", input),
};

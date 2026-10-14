// Which social sign-ins to offer, read from the Privy app itself (the dashboard's login methods), so a button never
// appears for a method that is switched off there. Read once per launch; until it answers, only the email code shows.
import * as React from "react";

import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "./config";
import type { SocialProvider } from "./turnkey-account-core";

const PRIVY_APP_CONFIG = "https://auth.privy.io/api/v1/apps/";

let request: Promise<readonly SocialProvider[]> | undefined;

function loginMethods(clientId: string | undefined): Promise<readonly SocialProvider[]> {
  request ??= fetch(`${PRIVY_APP_CONFIG}${encodeURIComponent(PRIVY_APP_ID)}`, {
    headers: { "privy-app-id": PRIVY_APP_ID, ...(clientId ? { "privy-client-id": clientId } : {}) },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`privy app config ${response.status}`);
      const config = (await response.json()) as { apple_oauth?: boolean; google_oauth?: boolean };
      return [...(config.apple_oauth ? (["apple"] as const) : []), ...(config.google_oauth ? (["google"] as const) : [])];
    })
    .catch((error: unknown) => {
      request = undefined;
      throw error;
    });
  return request;
}

/** Apple and Google, as enabled on the Privy app (the native app reads them through its app client). */
export function usePrivyLoginMethods(platform: "native" | "web"): readonly SocialProvider[] {
  const [methods, setMethods] = React.useState<readonly SocialProvider[]>([]);
  React.useEffect(() => {
    let live = true;
    loginMethods(platform === "native" ? PRIVY_CLIENT_ID : undefined)
      .then((found) => {
        if (live) setMethods(found);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [platform]);
  return methods;
}

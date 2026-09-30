// The Kawase session: who the user is (guest or account), kept in sync with the api. The token lives in
// secure storage; this provider only holds the user and the current status.
import * as Application from "expo-application";
import * as React from "react";
import { Platform } from "react-native";

import type { ApiUser, DeviceInfo, NetworkId } from "@kawase/api-client";
import type { SupportedLocale } from "@kawase/config";

import { api } from "./api";
import { sessionStorage } from "./storage";

type Status = "loading" | "none" | "guest" | "account";

type SessionState = {
  status: Status;
  user: ApiUser | undefined;
  availableNetworks: NetworkId[];
  /** Creates the guest account (first launch) or does nothing when a session exists. */
  ensureGuest: (locale: SupportedLocale) => Promise<void>;
  /** Stores a token the sign-in screen obtained and loads the user behind it. */
  adoptToken: (token: string) => Promise<ApiUser>;
  refresh: () => Promise<void>;
  update: (settings: Parameters<typeof api.me.update>[0]) => Promise<ApiUser>;
  setNetwork: (network: NetworkId) => Promise<ApiUser>;
  signOut: () => Promise<void>;
};

const SessionContext = React.createContext<SessionState | null>(null);

export async function deviceInfo(locale?: string): Promise<DeviceInfo> {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  const info: DeviceInfo = { platform, installationId: await sessionStorage.installationId() };
  if (Application.nativeApplicationVersion) info.appVersion = Application.nativeApplicationVersion;
  if (locale) info.locale = locale;
  return info;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [user, setUser] = React.useState<ApiUser>();
  const [availableNetworks, setAvailableNetworks] = React.useState<NetworkId[]>(["testnet"]);

  const load = React.useCallback(async () => {
    const token = await sessionStorage.getToken();
    if (!token) {
      setStatus("none");
      setUser(undefined);
      return;
    }
    try {
      const me = await api.me.get();
      setUser(me.user);
      setAvailableNetworks(me.availableNetworks);
      setStatus(me.user.isGuest ? "guest" : "account");
    } catch {
      // An expired or revoked session: start again as a guest on the next screen.
      await sessionStorage.setToken(undefined);
      setStatus("none");
      setUser(undefined);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const value = React.useMemo<SessionState>(
    () => ({
      status,
      user,
      availableNetworks,
      async ensureGuest(locale) {
        if (await sessionStorage.getToken()) return load();
        const { token, user: guest } = await api.auth.guest({ device: await deviceInfo(locale), locale });
        await sessionStorage.setToken(token);
        setUser(guest);
        setStatus("guest");
      },
      async adoptToken(token) {
        await sessionStorage.setToken(token);
        const me = await api.me.get();
        setUser(me.user);
        setAvailableNetworks(me.availableNetworks);
        setStatus(me.user.isGuest ? "guest" : "account");
        return me.user;
      },
      refresh: load,
      async update(settings) {
        const { user: updated } = await api.me.update(settings);
        setUser(updated);
        return updated;
      },
      async setNetwork(network) {
        const { user: updated } = await api.me.setNetwork(network);
        setUser(updated);
        return updated;
      },
      async signOut() {
        await api.auth.signOut().catch(() => undefined);
        await sessionStorage.setToken(undefined);
        setUser(undefined);
        setStatus("none");
      },
    }),
    [status, user, availableNetworks, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = React.useContext(SessionContext);
  if (!state) throw new Error("useSession must be used inside SessionProvider");
  return state;
}

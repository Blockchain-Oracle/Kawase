// The Kawase session: who the user is (guest or account), kept in sync with the api. The token lives in
// secure storage; this provider holds the user, the status and whether what it shows is fresh.
//
// Only the api saying the session is invalid (401) ends it. Offline, a timeout or a server error keeps the token
// and the last user the api confirmed, marks the state stale and keeps trying, so a money app never "forgets" an
// account because the connection dropped, and never makes a replacement guest as a side effect (Codex review R01).
import * as Application from "expo-application";
import * as React from "react";
import { AppState, Platform } from "react-native";

import { ApiError, type ApiUser, type DeviceInfo, type NetworkId } from "@kawase/api-client";
import type { SupportedLocale } from "@kawase/config";

import { api } from "./api";
import { sessionStorage } from "./storage";

type Status = "loading" | "none" | "guest" | "account";

/** Whether the user shown was just confirmed by the api, or is the last one it confirmed. */
export type Connection = "online" | "offline" | "unreachable";

type SessionState = {
  status: Status;
  user: ApiUser | undefined;
  availableNetworks: NetworkId[];
  connection: Connection;
  /** True while the user shown is the cached one because the api could not be read. */
  stale: boolean;
  /** Reads the user again now (the stale banner's Retry). */
  retry: () => Promise<void>;
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

const HTTP_UNAUTHORIZED = 401;
/** While stale, the user is read again this often (and whenever the app comes back to the foreground). */
const STALE_RETRY_MS = 20_000;

export async function deviceInfo(locale?: string): Promise<DeviceInfo> {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  const info: DeviceInfo = { platform, installationId: await sessionStorage.installationId() };
  if (Application.nativeApplicationVersion) info.appVersion = Application.nativeApplicationVersion;
  if (locale) info.locale = locale;
  return info;
}

/** Offline (the request never got an answer) or unreachable (the api answered with a server error). */
function connectionFrom(error: unknown): Connection {
  return error instanceof ApiError ? "unreachable" : "offline";
}

const isInvalidSession = (error: unknown) => error instanceof ApiError && error.status === HTTP_UNAUTHORIZED;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [user, setUser] = React.useState<ApiUser>();
  const [availableNetworks, setAvailableNetworks] = React.useState<NetworkId[]>(["testnet"]);
  const [connection, setConnection] = React.useState<Connection>("online");

  const show = React.useCallback((next: ApiUser, networks?: NetworkId[]) => {
    setUser(next);
    if (networks) setAvailableNetworks(networks);
    setStatus(next.isGuest ? "guest" : "account");
    void sessionStorage.setUser(next);
  }, []);

  const clear = React.useCallback(async () => {
    await sessionStorage.setToken(undefined);
    await sessionStorage.setUser(undefined);
    setUser(undefined);
    setStatus("none");
    setConnection("online");
  }, []);

  const load = React.useCallback(async () => {
    const token = await sessionStorage.getToken();
    if (!token) {
      setStatus("none");
      setUser(undefined);
      return;
    }
    try {
      const me = await api.me.get();
      show(me.user, me.availableNetworks);
      setConnection("online");
    } catch (error) {
      if (isInvalidSession(error)) {
        // The api no longer knows this session (expired or revoked): start again on the first screen.
        await clear();
        return;
      }
      // The connection, not the account, failed: keep the token and show the last confirmed user.
      setConnection(connectionFrom(error));
      const cached = await sessionStorage.getUser<ApiUser>();
      if (cached) {
        setUser(cached);
        setStatus(cached.isGuest ? "guest" : "account");
      }
      // Without a cached user the status stays "loading" and the retries below bring it in.
    }
  }, [show, clear]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The person's time zone, inferred from the device (never asked): automations run at their local time. Only an
  // account still on the default is updated, so a zone they chose is never overwritten.
  React.useEffect(() => {
    if (status !== "account" || !user || user.timezone !== "UTC") return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === "UTC") return;
    void api.me
      .update({ timezone: device })
      .then(({ user: next }) => show(next))
      .catch(() => undefined);
  }, [status, user, show]);

  // While stale: try again on a timer and whenever the app returns to the foreground.
  const stale = connection !== "online";
  React.useEffect(() => {
    if (!stale) return undefined;
    const timer = setInterval(() => void load(), STALE_RETRY_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [stale, load]);

  const value = React.useMemo<SessionState>(
    () => ({
      status,
      user,
      availableNetworks,
      connection,
      stale,
      retry: load,
      async ensureGuest(locale) {
        if (await sessionStorage.getToken()) return load();
        const { token, user: guest } = await api.auth.guest({ device: await deviceInfo(locale), locale });
        await sessionStorage.setToken(token);
        show(guest);
        setConnection("online");
      },
      async adoptToken(token) {
        await sessionStorage.setToken(token);
        const me = await api.me.get();
        show(me.user, me.availableNetworks);
        setConnection("online");
        return me.user;
      },
      refresh: load,
      async update(settings) {
        const { user: updated } = await api.me.update(settings);
        show(updated);
        return updated;
      },
      async setNetwork(network) {
        const { user: updated } = await api.me.setNetwork(network);
        show(updated);
        return updated;
      },
      async signOut() {
        await api.auth.signOut().catch(() => undefined);
        await clear();
      },
    }),
    [status, user, availableNetworks, connection, stale, load, show, clear],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = React.useContext(SessionContext);
  if (!state) throw new Error("useSession must be used inside SessionProvider");
  return state;
}

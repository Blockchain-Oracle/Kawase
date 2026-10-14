// What Kawase can do on the active network right now, from the api's capability registry (the same view the agent
// reads). Entry points use it to show only what works, or to say "Soon" before the tap (Codex review R12). Until the
// api answers — or when it can't be reached — the shipped registry (`@kawase/config`) speaks, so a slow or failed read
// never leaves a shipped action stuck on "Soon"; the api's answer adds the runtime overrides. Kept in component state
// on purpose: no module-level store for the React Compiler to memoize.
import * as React from "react";

import type { CapabilityState } from "@kawase/api-client";
import { CAPABILITIES, type CapabilityId } from "@kawase/config";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const shipped = (id: string, network: "mainnet" | "testnet"): CapabilityState | undefined =>
  (CAPABILITIES as Partial<Record<CapabilityId, Record<"mainnet" | "testnet", CapabilityState>>>)[id as CapabilityId]?.[network];

export function useCapability(id: string): CapabilityState | undefined {
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [state, setState] = React.useState<{ network: string; state: CapabilityState | undefined } | undefined>();
  React.useEffect(() => {
    let live = true;
    api
      .capabilities()
      .then(({ capabilities }) => {
        if (live) setState({ network, state: capabilities[id]?.[network]?.state });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, network]);
  return state?.network === network && state.state !== undefined ? state.state : shipped(id, network);
}

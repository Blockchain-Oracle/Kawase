// What Kawase can do on the active network right now, from the api's capability registry (the same view the agent
// reads). Entry points use it to show only what works, or to say "Soon" before the tap (Codex review R12). Kept in
// component state on purpose: no module-level store for the React Compiler to memoize.
import * as React from "react";

import type { CapabilityState } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export function useCapability(id: string): CapabilityState | undefined {
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [state, setState] = React.useState<CapabilityState>();
  React.useEffect(() => {
    let live = true;
    api
      .capabilities()
      .then(({ capabilities }) => {
        if (live) setState(capabilities[id]?.[network]?.state);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, network]);
  return state;
}

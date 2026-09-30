import { CAPABILITIES, type CapabilityId, type CapabilityState } from "@kawase/config";
import { capabilityOverrides, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

export type CapabilityView = Record<CapabilityId, Record<NetworkId, { state: CapabilityState; reason?: string }>>;

/** The shipped registry with the runtime overrides applied. */
export async function capabilityView(db: Db, availableNetworks: NetworkId[]): Promise<CapabilityView> {
  const overrides = await db.select().from(capabilityOverrides);
  const view = {} as CapabilityView;
  for (const [id, byNetwork] of Object.entries(CAPABILITIES) as [CapabilityId, Record<NetworkId, CapabilityState>][]) {
    view[id] = {} as CapabilityView[CapabilityId];
    for (const network of ["mainnet", "testnet"] as const) {
      const override = overrides.find((row) => row.capability === id && row.network === network);
      const shipped = availableNetworks.includes(network) ? byNetwork[network] : "unavailable";
      view[id][network] =
        override && !override.enabled && shipped === "available"
          ? { state: "coming", ...(override.reason ? { reason: override.reason } : {}) }
          : { state: shipped };
    }
  }
  return view;
}

// The vaults on the active network and the person's positions in them, from the api (which reads the positions from
// the vaults themselves). Refreshed on demand; a failed read keeps what was shown and says so.
import * as React from "react";

import type { EarnPositionView, EarnVaultView } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const NOTHING = 0n;

export function useEarnOverview() {
  const { status, user } = useSession();
  const [vaults, setVaults] = React.useState<EarnVaultView[]>();
  const [positions, setPositions] = React.useState<EarnPositionView[]>([]);
  const [failed, setFailed] = React.useState(false);
  const network = user?.activeNetwork;
  const refresh = React.useCallback(async () => {
    if (status !== "account") return;
    try {
      const view = await api.earn.overview();
      setVaults(view.vaults);
      setPositions(view.positions);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [status]);
  React.useEffect(() => {
    void refresh();
  }, [refresh, network]);
  const best = vaults?.find((vault) => vault.status === "active");
  const held = positions.reduce((sum, position) => sum + BigInt(position.assets), NOTHING);
  return { vaults, positions, failed, refresh, best, held };
}

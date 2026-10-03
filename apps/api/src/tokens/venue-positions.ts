// Positions beyond the earn vaults (surfaces.md Home §7 "Positions: earn, borrow (health), perps (P&L)"; the hero's
// "total of every asset, every chain, every position"): what the person has on Aave V4 outside Kawase Margin —
// supplied (earning) and, with a loan, the net of it with the account's health — and every open Kawase Margin
// position by its equity, side, leverage and profit or loss. Read only when a portfolio is asked for; a venue that
// does not answer in time leaves its rows out (the portfolio says it is not fresh).
import type { PositionSummary } from "@kawase/api-client";

import type { LendService } from "../lend/service";
import type { MarginService } from "../margin/service";
import type { SessionUser } from "../types";

const PERCENT = 100;
const round = (value: number) => Math.round(value * PERCENT) / PERCENT;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export type VenuePositions = (user: SessionUser) => Promise<PositionSummary[]>;

export function venuePositions(sources: { lend: () => LendService; margin: () => MarginService }): VenuePositions {
  return async (user) => {
    const [account, margin] = await Promise.all([
      sources
        .lend()
        .account(user)
        .catch(() => null),
      sources
        .margin()
        .positions(user)
        .catch(() => []),
    ]);
    const out: PositionSummary[] = [];
    if (account?.available) {
      const suppliedUsd = sum(account.supplied.map((entry) => entry.usd));
      const debtUsd = sum(account.borrowed.map((entry) => entry.usd));
      if (debtUsd > 0) {
        out.push({
          kind: "borrow",
          id: "aave-v4",
          title: account.borrowed.map((entry) => entry.asset).join(" · "),
          provider: "aave",
          valueUsd: round(suppliedUsd - debtUsd),
          token: null,
          health: account.health,
          debtUsd: round(debtUsd),
          suppliedUsd: round(suppliedUsd),
        });
      } else if (suppliedUsd > 0) {
        // What it earns: each supplied asset's rate, weighted by what is in it.
        const rate =
          sum(
            account.supplied.map(
              (entry) =>
                entry.usd * (account.reserves.find((reserve) => reserve.reserveId === entry.reserveId)?.supplyApr ?? 0),
            ),
          ) / suppliedUsd;
        out.push({
          kind: "earn",
          id: "aave-v4",
          title: account.supplied.map((entry) => entry.asset).join(" · "),
          provider: "aave",
          valueUsd: round(suppliedUsd),
          apyPct: round(rate * PERCENT),
          token: null,
        });
      }
    }
    for (const position of margin) {
      if (position.status !== "open") continue;
      out.push({
        kind: "perp",
        id: position.id,
        title: position.market,
        provider: "aave",
        valueUsd: round(position.equityUsd),
        token: null,
        side: position.side,
        leverage: position.leverage,
        pnlUsd: round(position.pnlUsd),
        pnlPct: round(position.pnlPercent * PERCENT),
        health: position.health,
      });
    }
    return out;
  };
}

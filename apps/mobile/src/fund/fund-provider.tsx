// One fund hub for the whole app: the balance card's Fund, the fan's Fund, home's "Get test USDC" chip and the
// "Get funded" first step all open the same sheet (the audit found Fund meant two different things). After test
// money is sent, `fundedAt` changes so the page behind can watch for the credit.
import * as React from "react";

import { FundSheet } from "@/fund/fund-sheet";

type FundContextValue = {
  open: () => void;
  /** When test money was last sent (ms since epoch), for pages that watch for the credit. */
  fundedAt: number | undefined;
  /** Test money was sent from elsewhere (the agent's faucet card): pages watch for the credit too. */
  markFunded: () => void;
};

const FundContext = React.createContext<FundContextValue | null>(null);

export function FundProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false);
  const [fundedAt, setFundedAt] = React.useState<number>();
  const value = React.useMemo(() => ({ open: () => setOpen(true), fundedAt, markFunded: () => setFundedAt(Date.now()) }), [fundedAt]);
  return (
    <FundContext.Provider value={value}>
      {children}
      <FundSheet open={isOpen} onClose={() => setOpen(false)} onFunded={() => setFundedAt(Date.now())} />
    </FundContext.Provider>
  );
}

export function useFund(): FundContextValue {
  const context = React.useContext(FundContext);
  if (!context) throw new Error("useFund must be used inside FundProvider");
  return context;
}

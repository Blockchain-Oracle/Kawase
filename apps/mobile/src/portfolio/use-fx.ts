// The person's display currency and today's rate (B2-3, plan §A.4 14): every value the api gives in US dollars is
// shown in it — Home, Markets, token pages, cards. The rate is read from the api (which caches its free source) once
// per currency and kept for an hour; until it comes, or if it never does, values show in dollars.
import * as React from "react";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

import { USD_FX, type Fx } from "./format";

const RATE_TTL_MS = 3_600_000;
const rates = new Map<string, { fx: Fx; at: number }>();

export function useFx(): Fx {
  const { user } = useSession();
  const currency = (user?.displayCurrency || "USD").toUpperCase();
  const [fx, setFx] = React.useState<Fx>(() => rates.get(currency)?.fx ?? USD_FX);

  React.useEffect(() => {
    if (currency === "USD") {
      setFx(USD_FX);
      return;
    }
    const known = rates.get(currency);
    if (known) setFx(known.fx);
    if (known && Date.now() - known.at < RATE_TTL_MS) return;
    let live = true;
    void api.fees
      .fx(currency)
      .then(({ fx: next }) => {
        const value = { currency: next.currency, perUsd: next.perUsd };
        rates.set(currency, { fx: value, at: Date.now() });
        if (live) setFx(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [currency]);

  return fx;
}

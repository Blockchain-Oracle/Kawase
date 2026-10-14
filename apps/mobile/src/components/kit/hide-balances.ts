// "Hide balances" (accessibility and privacy, group U): one switch masks every balance and result figure the kit draws
// (the rolling odometer, the amount hero). Kept in device storage so it survives a restart; reading it never throws.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

const KEY = "kawase.hideBalances.v1";
/** What a hidden figure reads as. */
export const HIDDEN_AMOUNT = "••••";

let hidden = false;
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw === "1" && !hidden) {
        hidden = true;
        notify();
      }
    })
    .catch(() => undefined);
  return loading;
}

export const balancesHidden = () => hidden;

export function setBalancesHidden(next: boolean): void {
  hidden = next;
  notify();
  AsyncStorage.setItem(KEY, next ? "1" : "0").catch(() => undefined);
}

/** `[hidden, set]`: the masking switch the kit's figures read, and the setter Settings and the Home hero use. */
export function useHideBalances(): readonly [boolean, (next: boolean) => void] {
  useEffect(() => {
    void load();
  }, []);
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    balancesHidden,
    balancesHidden,
  );
  return [value, setBalancesHidden] as const;
}

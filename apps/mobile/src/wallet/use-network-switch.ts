// The network toggle (D15 / A3): one tap switches mainnet ↔ testnet, instantly both ways. The first switch to
// mainnet needs the versioned real-money consent (the api refuses without it), and mainnet needs an account and
// a live mainnet on the api. The reasons a switch cannot happen are said in words (blocker as label, S5), never
// swallowed. Used by the header pill, Settings → Network and the receive page's network row.
import * as React from "react";
import { toast } from "sonner-native";

import type { NetworkId } from "@kawase/api-client";
import { MAINNET_CONSENT_VERSION } from "@kawase/config";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const other = (network: NetworkId): NetworkId => (network === "testnet" ? "mainnet" : "testnet");
type Translate = ReturnType<typeof useT>["t"];
const networkName = (t: Translate, id: NetworkId) => (id === "testnet" ? t("network.testnet") : t("network.mainnet"));

export function useNetworkSwitch() {
  const { t } = useT();
  const { locale } = useLocale();
  const { status, user, availableNetworks, setNetwork } = useSession();
  const [busy, setBusy] = React.useState(false);
  const [consentNeeded, setConsentNeeded] = React.useState(false);

  const network: NetworkId = user?.activeNetwork ?? "testnet";
  const next = other(network);

  const switchNetwork = React.useCallback(
    async (target: NetworkId) => {
      if (target === network || busy) return;
      if (!availableNetworks.includes(target)) {
        toast(t("network.unavailable", { network: networkName(t, target) }));
        return;
      }
      // A guest looks around mainnet freely (value first, sign last); the first money action signs them in, and their
      // account asks for the real-money consent before anything moves.
      const guest = status !== "account";
      setBusy(true);
      try {
        if (target === "mainnet" && !guest) {
          const { consents } = await api.me.consents();
          const accepted = consents.some((consent) => consent.kind === "mainnet_real_money" && consent.version === MAINNET_CONSENT_VERSION);
          if (!accepted) {
            setConsentNeeded(true);
            return;
          }
        }
        await setNetwork(target);
      } catch (failure) {
        toast.error(failure instanceof Error ? failure.message : t("common.error"));
      } finally {
        setBusy(false);
      }
    },
    [network, busy, availableNetworks, status, setNetwork, t],
  );

  const acceptMainnet = React.useCallback(async () => {
    setBusy(true);
    try {
      await api.me.consent({ kind: "mainnet_real_money", version: MAINNET_CONSENT_VERSION, locale });
      setConsentNeeded(false);
      await setNetwork("mainnet");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }, [locale, setNetwork, t]);

  return {
    network,
    /** The network a toggle would switch to. */
    next,
    nextName: networkName(t, next),
    /** Whether the api offers the other network at all (mainnet is off until Circle approves it). */
    nextAvailable: availableNetworks.includes(next),
    busy,
    toggle: () => void switchNetwork(next),
    switchNetwork,
    consentNeeded,
    acceptMainnet,
    dismissConsent: () => setConsentNeeded(false),
  };
}

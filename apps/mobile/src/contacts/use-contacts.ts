// The person's contacts from the api, for the list and one contact's page: loading, ready and error states, and a
// refresh the screens call on focus and after every change. Guests have no book (contacts need an account).
import * as React from "react";

import type { AddressSource, Contact, NetworkId } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export type LoadState = "idle" | "loading" | "ready" | "error";

export function useContacts() {
  const { status } = useSession();
  const [state, setState] = React.useState<{ status: LoadState; contacts: Contact[] }>({ status: "idle", contacts: [] });

  const refresh = React.useCallback(async () => {
    if (status !== "account") {
      setState({ status: "ready", contacts: [] });
      return;
    }
    setState((current) => ({ status: current.contacts.length > 0 ? "ready" : "loading", contacts: current.contacts }));
    try {
      const { contacts } = await api.contacts.list();
      setState({ status: "ready", contacts });
    } catch {
      setState((current) => ({ status: "error", contacts: current.contacts }));
    }
  }, [status]);

  return { ...state, refresh };
}

export function useContact(id: string | undefined) {
  const { status } = useSession();
  const [state, setState] = React.useState<{ status: LoadState; contact: Contact | undefined }>({ status: "idle", contact: undefined });

  const refresh = React.useCallback(async () => {
    if (status !== "account" || !id) return;
    setState((current) => ({ status: current.contact ? "ready" : "loading", contact: current.contact }));
    try {
      const { contact } = await api.contacts.get(id);
      setState({ status: "ready", contact });
    } catch {
      setState((current) => ({ status: "error", contact: current.contact }));
    }
  }, [status, id]);

  return { ...state, refresh, set: (contact: Contact) => setState({ status: "ready", contact }) };
}

/** True when any of the contact's addresses has been paid on this network. */
export const paidOn = (contact: Contact, network: NetworkId) =>
  contact.addresses.some((address) => (address.trust[network]?.paymentCount ?? 0) > 0);

/** The address that stands for the contact: the current one, else the one waiting out its cooldown. */
export const contactAddress = (contact: Contact) => contact.address ?? contact.pendingChange?.address ?? null;

/** Where an address came from, in the same words as the send screen's trust chip. */
export function useSourceLabel() {
  const { t } = useT();
  return (source: AddressSource) => {
    switch (source) {
      case "handle":
        return t("send.trustHandle");
      case "scanned":
        return t("send.trustScanned");
      case "pasted":
        return t("send.trustPasted");
      case "received":
        return t("send.trustReceived");
      case "agent":
        return t("send.trustAgent");
      default:
        return t("send.trustTyped");
    }
  };
}

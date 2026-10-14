// Which ways to pay this device and this server can offer, as the Buy sheet's rows (D42). Only what the device supports
// is listed: Apple Pay on an iPhone or in Safari that says it can pay, Google Pay on Android or in a browser with the
// Payment Request API (not Safari). Circle (Arc direct) is offered first for every method it takes; Coinbase (US phone,
// delivered on Base, then moved to Arc) adds its Apple Pay / Google Pay rows when its engine is on. A row that cannot
// take this amount stays listed with its fix ("Up to $500 a week"), never hidden or greyed without a word.
import { Platform } from "react-native";

import type { OnrampAvailability, OnrampEngineId, OnrampMethod } from "@kawase/api-client";

export type PayOption = {
  /** Stable key: `${engine}:${method}`. */
  key: string;
  engine: OnrampEngineId;
  method: OnrampMethod;
  /** Coinbase: the money lands on Base and Kawase's CCTP leg carries it to Arc in the same run. */
  viaBase: boolean;
  /** A US mobile number is needed (Coinbase guest checkout). */
  usPhone: boolean;
  /** A guest limit the provider enforces, whole dollars a week. */
  weeklyLimitUsd: number | null;
};

type ApplePayWindow = { ApplePaySession?: { canMakePayments?: () => boolean } };

/** What this device can pay with, before any provider is asked. */
export function deviceMethods(): ReadonlySet<OnrampMethod> {
  const methods = new Set<OnrampMethod>(["card", "bank"]);
  if (Platform.OS === "ios") methods.add("apple_pay");
  else if (Platform.OS === "android") methods.add("google_pay");
  else if (typeof globalThis.window !== "undefined") {
    const apple = (globalThis.window as unknown as ApplePayWindow).ApplePaySession;
    let canApple: boolean;
    try {
      canApple = Boolean(apple?.canMakePayments?.());
    } catch {
      canApple = false;
    }
    if (canApple) methods.add("apple_pay");
    else if ("PaymentRequest" in globalThis.window) methods.add("google_pay");
  }
  return methods;
}

/** Wallet methods first (one tap), then the card, then the bank. */
const ORDER: readonly OnrampMethod[] = ["apple_pay", "google_pay", "card", "bank"];

/** The rows for this availability on this device, Circle before Coinbase within a method. */
export function payOptions(availability: OnrampAvailability | undefined, device: ReadonlySet<OnrampMethod> = deviceMethods()): PayOption[] {
  const engines = (availability?.engines ?? []).filter((engine) => engine.available);
  const options: PayOption[] = [];
  for (const method of ORDER) {
    if (!device.has(method)) continue;
    for (const engine of engines) {
      if (!engine.methods.includes(method)) continue;
      options.push({
        key: `${engine.id}:${method}`,
        engine: engine.id,
        method,
        viaBase: engine.bridgesToArc,
        usPhone: engine.id === "coinbase",
        weeklyLimitUsd: engine.weeklyLimitUsd,
      });
    }
  }
  return options;
}

/** The identity mark for a method: the wallets' own marks; a card or a bank has no brand of its own here. */
export function methodMark(method: OnrampMethod): string | null {
  if (method === "apple_pay") return "pay:applepay";
  if (method === "google_pay") return "pay:googlepay";
  return null;
}

export function engineMark(engine: OnrampEngineId): string {
  return engine === "coinbase" ? "provider:coinbase" : "provider:circle";
}

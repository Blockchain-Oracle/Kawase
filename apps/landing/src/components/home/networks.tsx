"use client";

// Mainnet and testnet, side by side: the same toggle the app has. The orb turns between the two networks' colours, testnet always carries
// the words "Testnet · no real money" and mainnet the REAL MONEY eyebrow (DESIGN.md "Testnet layer"), and the list
// shows what each network can do, from the registry.
import { useState } from "react";

import type { NetworkId } from "@kawase/networks";
import { SegmentedControl } from "@kawase/ui-web/components/ui/segmented-control";

import { Orb } from "@/components/orb";
import { StateChip } from "@/components/state-chip";
import { AREAS, areaState } from "@/lib/capabilities";

const OPTIONS = [
  { value: "mainnet", label: "Mainnet" },
  { value: "testnet", label: "Testnet" },
];

const COPY: Record<NetworkId, { title: string; body: string }> = {
  mainnet: {
    title: "Arc mainnet",
    body: "Real USDC and EURC. Signing in is required, and the first switch asks you to confirm you understand it is real money.",
  },
  testnet: {
    title: "Arc testnet",
    body: "Works like the real thing with free test USDC from Circle. The colour changes and the strip stays on screen, so you always know.",
  },
};

export function Networks() {
  const [network, setNetwork] = useState<NetworkId>("testnet");
  const isTestnet = network === "testnet";
  return (
    <section id="networks" data-network={network} className="scroll-mt-24 px-6 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Two networks</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Practise on testnet. Switch when you’re ready.
          </h2>
          <div className="mt-6 max-w-xs">
            <SegmentedControl
              label="Network"
              options={OPTIONS}
              value={network}
              onValueChange={(value) => setNetwork(value as NetworkId)}
            />
          </div>
          <div className="relative mx-auto mt-8 aspect-square w-full max-w-[300px]">
            <Orb network={network} />
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card">
          {isTestnet ? (
            <p className="rounded-t-3xl bg-network-surface px-5 py-2 text-center text-sm font-semibold text-network">
              Testnet · no real money
            </p>
          ) : (
            <p className="px-5 pt-5 text-xs font-semibold uppercase tracking-widest text-foreground">Real money</p>
          )}
          <div className="p-5">
            <h3 className="font-display text-xl font-semibold">{COPY[network].title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{COPY[network].body}</p>
            <ul className="mt-5 divide-y divide-border">
              {AREAS.map((area) => (
                <li key={area.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>{area.title}</span>
                  <StateChip state={areaState(area.id, network)} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

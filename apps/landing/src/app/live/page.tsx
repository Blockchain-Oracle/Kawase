// What Kawase has actually done, as counts from the api (`GET /public/stats`): completed actions per network,
// automation runs, accounts and guests. Aggregates only; when the api can't be reached the page says so.
import type { Metadata } from "next";

import type { NetworkId } from "@kawase/networks";

import { Section } from "@/components/section";
import { CountUp } from "@/components/ui/count-up";
import { fetchPublicStats, type NetworkStats, type PublicActionKind } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Live counts",
  description: "How many sends, swaps, bridges, savings moves and automation runs Kawase has completed, per network.",
};

const ROWS: readonly { label: string; value: (stats: NetworkStats) => number }[] = [
  ...(
    [
      ["send", "Sends completed"],
      ["swap", "Swaps completed"],
      ["bridge", "Bridges completed"],
      ["earn", "Savings moves"],
    ] as const satisfies readonly (readonly [PublicActionKind, string])[]
  ).map(([kind, label]) => ({ label, value: (stats: NetworkStats) => stats.completed[kind] })),
  { label: "Automation runs", value: (stats) => stats.automationRuns },
  { label: "Automations on now", value: (stats) => stats.activeAutomations },
];

const NETWORK_TITLE: Record<NetworkId, string> = { testnet: "Arc testnet", mainnet: "Arc mainnet" };
const NETWORK_ORDER: readonly NetworkId[] = ["testnet", "mainnet"];
const COUNT_SECONDS = 1.6;

function Count({ value }: { value: number }) {
  return (
    <CountUp
      to={value}
      separator=","
      duration={COUNT_SECONDS}
      digitEffect="slide"
      className="font-display text-4xl font-semibold tabular-nums"
    />
  );
}

function NetworkCard({ network, stats }: { network: NetworkId; stats: NetworkStats }) {
  return (
    <div data-network={network} className="rounded-3xl border border-border bg-card">
      {network === "testnet" ? (
        <p className="rounded-t-3xl bg-network-surface px-5 py-2 text-center text-sm font-semibold text-network">
          Testnet · no real money
        </p>
      ) : (
        <p className="px-5 pt-5 text-xs font-semibold uppercase tracking-widest text-foreground">Real money</p>
      )}
      <div className="p-5">
        <h2 className="font-display text-xl font-semibold">{NETWORK_TITLE[network]}</h2>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          {ROWS.map((row) => (
            <div key={row.label} className="flex flex-col-reverse gap-1">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd>
                <Count value={row.value(stats)} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export default async function LivePage() {
  const stats = await fetchPublicStats();

  if (!stats) {
    return (
      <Section
        eyebrow="Live"
        title="Counts unavailable right now"
        body="Kawase's API didn't answer. The numbers come back on their own when it does; the evidence page lists the transactions in the meantime."
      >
        <a
          href="/demo#evidence"
          className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          See the evidence
        </a>
      </Section>
    );
  }

  const updated = new Date(stats.generatedAt);
  return (
    <Section
      eyebrow="Live"
      title="What Kawase has done so far"
      body={
        <>
          Counted from Kawase’s own records: only actions confirmed on chain, and automation runs that did their work
          by themselves. Aggregates only; no names, addresses or amounts.
        </>
      }
    >
      <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        Updated <time dateTime={stats.generatedAt}>{updated.toUTCString()}</time>
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {NETWORK_ORDER.map((network) => (
          <NetworkCard key={network} network={network} stats={stats.networks[network]} />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col-reverse gap-1 rounded-3xl border border-border bg-card p-5">
          <dt className="text-sm text-muted-foreground">People signed in with a wallet</dt>
          <dd>
            <Count value={stats.accounts} />
          </dd>
        </div>
        <div className="flex flex-col-reverse gap-1 rounded-3xl border border-border bg-card p-5">
          <dt className="text-sm text-muted-foreground">Guests who tried it</dt>
          <dd>
            <Count value={stats.guests} />
          </dd>
        </div>
      </dl>
    </Section>
  );
}

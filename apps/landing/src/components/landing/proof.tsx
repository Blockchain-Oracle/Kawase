// "Don't take our word for it" (Mitoshi's Settled in public, Kawase's evidence): the money flows this build ran on Arc
// testnet on 2026-10-15, each with its transaction on the explorer, the same ones the README lists. Testnet USDC has no
// value; the hashes are real. The full run and the demo are one link away.
import { ArrowUpRight } from "lucide-react";

import { explorerTxUrl, type ExplorerId } from "@kawase/config";

import { Reveal } from "./reveal";

type Proof = { what: string; how: string; tx: { label: string; hash: string; explorer: ExplorerId }[] };

const PROOFS: readonly Proof[] = [
  {
    what: "Send",
    how: "Inside the budget, no prompt",
    tx: [{ label: "send", hash: "0xa6b7b60c3412f585888ae30540c2fbeb52d3c22f0babc5c96a95db86c289c9e0", explorer: "arcTestnet" }],
  },
  {
    what: "Gas-free send",
    how: "No USDC to spare; Kawase's relayer pays the gas",
    tx: [{ label: "relayed", hash: "0xac4f63a576222fd1cdeda8f26e0ab5aeafdae18dd910d5f7d8996fad8b317ad0", explorer: "arcTestnet" }],
  },
  {
    what: "Route race",
    how: "The swap through the venue the race picked",
    tx: [{ label: "swap", hash: "0x6518ecbe8a163d36f69d1fc2f91bacf3090b6aafe644df01ba9280d1947a1af6", explorer: "arcTestnet" }],
  },
  {
    what: "Bridge",
    how: "Arc to Base, one signature, Circle CCTP",
    tx: [
      { label: "burn on Arc", hash: "0x83784a163eb81dc223c8b956df9e6233315d46e14100bbb6b169df3878402900", explorer: "arcTestnet" },
      { label: "mint on Base", hash: "0x8a463f7c3285581a4ef2c6364e2889b7dea222bd3fa500b27c2e58ba26895a86", explorer: "baseSepolia" },
    ],
  },
  {
    what: "Earn",
    how: "A vault deposit and its withdrawal",
    tx: [
      { label: "deposit", hash: "0x186b62f7d05fd3ff550b8b28a8e0f6754d746698867f6ade895543d56787e4bf", explorer: "arcTestnet" },
      { label: "withdraw", hash: "0xd3ab115bc9933c428625ba3cdf9450c734e33da70f709999d131471b82ed6d69", explorer: "arcTestnet" },
    ],
  },
  {
    what: "Agent wallet (x402)",
    how: "Topped up under its grant, paid a tool, returned the rest",
    tx: [
      { label: "top-up", hash: "0xe3ce93c2f0a47483fda117f98645007ffc5b8463f285101bb0980e9d2d9a0016", explorer: "arcTestnet" },
      { label: "return", hash: "0xd2db35f6cff006856b6f1e174a22c1a8a0599f4045449833a3ff7eaddd86569c", explorer: "arcTestnet" },
    ],
  },
];

/** A hash shortened to its first and last characters, as explorers show it. */
const HEAD = 6;
const TAIL = 4;
const short = (hash: string) => `${hash.slice(0, HEAD)}…${hash.slice(-TAIL)}`;
const COLUMNS = 3;
const STAGGER_S = 0.06;

export function Proof() {
  return (
    <section id="proof" className="relative scroll-mt-24 py-24 sm:py-32" aria-labelledby="proof-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <p className="text-[13px] font-semibold tracking-[0.18em] text-accent uppercase">On chain</p>
          <h2 id="proof-title" className="mt-4 max-w-[900px] font-display text-[clamp(40px,6vw,76px)] leading-[0.98] font-black tracking-[-0.01em] text-foreground">
            Don&apos;t take our word for it.
          </h2>
          <p className="mt-6 max-w-[620px] text-[19px] leading-[1.5] text-[var(--lp-ink-soft)]">
            Every flow below ran through Kawase on Arc testnet today. Each one opens on the explorer.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROOFS.map((proof, index) => (
            <li key={proof.what}>
              <Reveal delay={(index % COLUMNS) * STAGGER_S} className="lp-tile flex h-full flex-col justify-between gap-6 rounded-[28px] border border-border p-6">
                <div>
                  <p className="font-display text-[24px] font-bold text-foreground">{proof.what}</p>
                  <p className="mt-1 text-[15px] text-muted-foreground">{proof.how}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {proof.tx.map((tx) => (
                    <a
                      key={tx.hash}
                      href={explorerTxUrl(tx.explorer, tx.hash)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-mono text-[13px] text-foreground transition-colors hover:bg-accent hover:text-white"
                    >
                      {tx.label} · {short(tx.hash)} <ArrowUpRight className="size-3.5" aria-hidden />
                    </a>
                  ))}
                </div>
              </Reveal>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold">
          <a href="/demo" className="text-foreground underline underline-offset-4 hover:text-accent">
            Watch the demo
          </a>
          <a href="/live" className="text-foreground underline underline-offset-4 hover:text-accent">
            Live counts
          </a>
          <a href="https://github.com/Blockchain-Oracle/Kawase" className="text-foreground underline underline-offset-4 hover:text-accent">
            Read the source
          </a>
        </div>
      </div>
    </section>
  );
}

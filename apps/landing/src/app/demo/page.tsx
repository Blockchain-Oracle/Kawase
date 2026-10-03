// The demo and its evidence: the video (once it is published) and every real testnet transaction behind the claims,
// each opening on its explorer. Rows come from src/data/evidence.ts, copied in full from the build logs.
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";

import { explorerTxUrl, type ExplorerId } from "@kawase/config";

import { Section } from "@/components/section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EVIDENCE, type EvidenceKind } from "@/data/evidence";
import { links } from "@/lib/links";

export const metadata: Metadata = {
  title: "Demo and evidence",
  description: "The Kawase demo and the real Arc testnet transactions behind each claim.",
};

const CHAIN_NAME: Record<ExplorerId, string> = {
  arc: "Arc",
  arcTestnet: "Arc Testnet",
  baseSepolia: "Base Sepolia",
  arbitrumSepolia: "Arbitrum Sepolia",
};

const KIND_LABEL: Record<EvidenceKind, string> = {
  setup: "Setup",
  allowance: "Allowance",
  send: "Send",
  swap: "Swap",
  bridge: "Bridge",
  earn: "Earn",
  automation: "Automation",
  revoke: "Revoke",
  business: "Business",
};

const HASH_EDGE = 10;
const HASH_TAIL = 8;
const shortHash = (hash: string) => `${hash.slice(0, HASH_EDGE)}…${hash.slice(-HASH_TAIL)}`;

function Video() {
  if (links.demoVideo) {
    return (
      <video
        className="aspect-video w-full rounded-3xl border border-border bg-card"
        src={links.demoVideo}
        controls
        preload="metadata"
      />
    );
  }
  return (
    <div className="stipple flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-3xl border border-border bg-card p-6 text-center">
      <p className="font-display text-xl font-semibold">The demo video is coming</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Until it is published, the table below is the proof: each row is a real transaction on Arc testnet that you
        can open on the explorer.
      </p>
    </div>
  );
}

export default function DemoPage() {
  const days = new Set(EVIDENCE.map((row) => row.date)).size;
  return (
    <>
      <Section
        eyebrow="Demo"
        title="See it work, then check the chain"
        body="Each feature Kawase ships was proven with real transactions on Arc testnet as it was built. Here is the video and the evidence behind it."
        className="pb-8 sm:pb-10"
      >
        <Video />
      </Section>

      <Section
        id="evidence"
        eyebrow="Evidence"
        title={`${EVIDENCE.length} transactions over ${days} days`}
        body={
          <>
            Each row names where it was triggered (a package script, an API test against testnet, the iOS simulator
            with Face ID, or chat) and the build log that recorded it. Testnet money has no value. Hashes are shortened
            for reading; each link carries the full one.
          </>
        }
        className="pt-8 sm:pt-10"
      >
        <div className="rounded-3xl border border-border bg-card p-2 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVIDENCE.map((row) => (
                <TableRow key={row.hash}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.date}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{KIND_LABEL[row.kind]}</span>
                  </TableCell>
                  <TableCell className="min-w-72 whitespace-normal leading-snug">
                    {row.action}
                    <span className="mt-1 block text-xs text-muted-foreground">{row.source}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.surface}</TableCell>
                  <TableCell>
                    <a
                      href={explorerTxUrl(row.explorer, row.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={row.hash}
                      className="inline-flex items-center gap-1.5 font-mono text-xs underline-offset-4 hover:underline"
                    >
                      <span dir="ltr">{shortHash(row.hash)}</span>
                      <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
                    </a>
                    <span className="mt-1 block text-xs text-muted-foreground">{CHAIN_NAME[row.explorer]}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </>
  );
}

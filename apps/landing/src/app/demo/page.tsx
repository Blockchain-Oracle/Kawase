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
};

/** The groups in the order a judge walks them (docs: judge walkthrough); each is a `/demo#<kind>` anchor. */
const KIND_ORDER = Object.keys(KIND_LABEL) as EvidenceKind[];
const GROUPS = KIND_ORDER.map((kind) => ({ kind, rows: EVIDENCE.filter((row) => row.kind === kind) })).filter(
  (group) => group.rows.length > 0,
);
const COLUMNS = 4;

const HASH_EDGE = 10;
const HASH_TAIL = 8;
const shortHash = (hash: string) => `${hash.slice(0, HASH_EDGE)}…${hash.slice(-HASH_TAIL)}`;

/** The YouTube video id in a watch, share or embed link; null for any other address (a file is played as one). */
function youTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match?.[1] ?? null;
}

function Video() {
  const url = links.demoVideo;
  const id = url ? youTubeId(url) : null;
  if (url && id) {
    return (
      <iframe
        className="aspect-video w-full rounded-3xl border border-border bg-card"
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title="The Kawase demo"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (url) {
    return <video className="aspect-video w-full rounded-3xl border border-border bg-card" src={url} controls preload="metadata" />;
  }
  // Until the recording is published: the cover (a composition of live app screens, not a recording) and a plain note.
  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <img src="/demo/cover.png" alt="The Kawase demo cover: the live Long / Short screen behind a play button. The recording is coming." className="aspect-video w-full object-cover" />
      </div>
      <figcaption className="flex flex-col items-center gap-1 text-center">
        <span className="font-display text-xl font-semibold">The demo video is coming</span>
        <span className="max-w-xl text-sm text-muted-foreground">
          The cover is a composition of live app screens, not a recording. Until the video is published, the table below
          is the proof: each row is a real transaction on Arc testnet that you can open on the explorer.
        </span>
      </figcaption>
    </figure>
  );
}

export default function DemoPage() {
  const days = new Set(EVIDENCE.map((row) => row.date)).size;
  return (
    <>
      <Section
        id="video"
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
            Grouped by what they prove, each group in the order it ran. Each row names where it was triggered (a package
            script, an API test against testnet, the iOS simulator with Face ID, or chat) and the build log that
            recorded it. Testnet money has no value. Hashes are shortened for reading; each link carries the full one.
          </>
        }
        className="pt-8 sm:pt-10"
      >
        <nav aria-label="Jump to a group" className="mb-4 flex flex-wrap gap-2">
          {GROUPS.map(({ kind, rows }) => (
            <a
              key={kind}
              href={`#${kind}`}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-muted"
            >
              {KIND_LABEL[kind]} <span className="text-muted-foreground">{rows.length}</span>
            </a>
          ))}
        </nav>
        <div className="rounded-3xl border border-border bg-card p-2 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GROUPS.flatMap(({ kind, rows }) => [
                <TableRow key={kind} id={kind} className="scroll-mt-28 hover:bg-transparent target:bg-muted">
                  <TableCell
                    colSpan={COLUMNS}
                    className="pt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {KIND_LABEL[kind]}
                  </TableCell>
                </TableRow>,
                ...rows.map((row) => (
                  <TableRow key={row.hash}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.date}</TableCell>
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
                )),
              ])}
            </TableBody>
          </Table>
        </div>
      </Section>
    </>
  );
}

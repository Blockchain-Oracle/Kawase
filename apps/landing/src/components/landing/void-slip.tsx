"use client";
// The 404's receipt (the app's +not-found and the docs' 404 tell it the same way): Kawase's slip, voided — the address
// the visitor tried, "No such page", their money right where they left it, a vermilion VOID stamp where a real slip
// has its hanko, the perforation, and the stub. The address comes from the address bar after hydration: the page is
// prerendered once, so the server never knows it.
import { Mark } from "@kawase/ui-web/components/mark";
import { useSyncExternalStore } from "react";

import { ENTITY } from "@/lib/capabilities";

const noStore = () => () => undefined;
const addressPath = () => window.location.pathname;
const noPath = () => null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="text-[14px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[15px] font-semibold text-foreground">{children}</dd>
    </div>
  );
}

export function VoidSlip({ stub }: { stub: string }) {
  const path = useSyncExternalStore(noStore, addressPath, noPath);
  return (
    <figure className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)]" aria-label="Receipt 404: nothing moved">
      <div className="flex items-center gap-2.5 px-7 pt-7">
        <Mark entity={ENTITY.kawase} size={26} />
        <span className="font-display text-[17px] font-semibold text-foreground">Kawase</span>
        <span className="ml-auto text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Receipt #404</span>
      </div>
      <dl className="grid gap-3.5 px-7 py-7">
        <Row label="To">
          <span className="font-mono text-[14px]">{path ?? "—"}</span>
        </Row>
        <Row label="Status">No such page</Row>
        <Row label="Your money">
          <span className="text-up">Right where you left it</span>
        </Row>
      </dl>
      <span
        aria-hidden
        className="pointer-events-none absolute top-[74px] right-6 -rotate-12 rounded-md border-[3px] border-[#E0463D] px-2.5 py-0.5 font-display text-[22px] font-black tracking-[0.18em] text-[#E0463D] opacity-85"
      >
        VOID
      </span>
      <div className="relative" aria-hidden>
        <div className="mx-7 border-t-2 border-dashed border-border" />
        <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background" />
        <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background" />
      </div>
      <figcaption className="px-7 py-6 text-[14px] text-muted-foreground">{stub}</figcaption>
    </figure>
  );
}
